import ExcelJS from 'exceljs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createApp, login, makeBin as makeIin, makeHouse, makeUser, owner, phoneLogin, resetDb, stepUpToken, type TestApp } from './helpers'

let t: TestApp
type Agent = Awaited<ReturnType<typeof login>>

beforeAll(async () => {
  t = await createApp()
})
afterAll(async () => {
  await t.app.close()
})
beforeEach(async () => {
  await resetDb()
  t.limiter.reset()
  t.sms.outbox.length = 0
})

async function chairmanWithHouse() {
  const chairman = await makeUser()
  const { house } = await makeHouse({ chairman, units: 8 })
  const agent = await login(t, chairman)
  const token = await stepUpToken(agent, chairman.secret)
  return { chairman, house, agent, token }
}

const csv = (rows: string[][]) => Buffer.from(rows.map((r) => r.join(';')).join('\r\n'), 'utf8')

function upload(agent: Agent, houseId: string, buf: Buffer, name = 'reestr.csv') {
  return agent.post(`/v1/houses/${houseId}/registry/imports`).attach('file', buf, name)
}

describe('owners registry import', () => {
  it('previews a CSV with errors, applies it, fills empty areas and marks the house', async () => {
    const { house, agent, token } = await chairmanWithHouse()
    const [a, b] = [makeIin(), makeIin()]
    const file = csv([
      ['Номер помещения', 'ФИО', 'ИИН', 'Площадь'],
      ['1', 'Асанов Данияр', a, '45,6'],
      ['2', 'Ким Виктория', b, '61.2'],
      ['77', 'Нет Такого', makeIin(), '30'],
    ])
    const preview = await upload(agent, house.id, file)
    expect(preview.status).toBe(201)
    expect(preview.body).toMatchObject({ status: 'PREVIEW', rows_total: 3, rows_valid: 2, units_covered: 2, units_missing: 6 })
    expect(preview.body.issues).toEqual([expect.objectContaining({ row: 4, code: 'UNIT_NOT_FOUND', severity: 'error' })])
    expect(preview.body.sample[0]).toEqual({ row: 2, unit_number: '1', full_name: 'Асанов Данияр', area: '45.60' })

    // Превью ничего не пишет в реестр, а в базе нет ИИН ни в каком виде
    expect(await owner.ownerRegistryEntry.count()).toBe(0)
    const stored = await owner.registryImport.findUniqueOrThrow({ where: { id: preview.body.import_id } })
    expect(JSON.stringify(stored)).not.toContain(a)

    const id = preview.body.import_id as string
    expect((await agent.post(`/v1/houses/${house.id}/registry/imports/${id}/apply`).send({})).status).toBe(428)
    const applied = await agent.post(`/v1/houses/${house.id}/registry/imports/${id}/apply`).set('X-Step-Up-Token', token).send({})
    expect(applied.status).toBe(200)
    expect(applied.body).toEqual({ applied: true, entries: 2, areas_updated: 2, verified_now: 0 })

    const units = await owner.unit.findMany({ where: { houseId: house.id, number: { in: ['1', '2'] } }, orderBy: { number: 'asc' } })
    expect(units.map((u) => u.area?.toString())).toEqual(['45.6', '61.2'])
    expect((await owner.house.findUniqueOrThrow({ where: { id: house.id } })).registryUploadedAt).not.toBeNull()

    const summary = await agent.get(`/v1/houses/${house.id}/registry`)
    expect(summary.body).toMatchObject({ entries: 2, units_covered: 2, units_total: 8, last_import: { status: 'APPLIED' } })
    const readiness = await agent.get(`/v1/houses/${house.id}/readiness`)
    expect(readiness.body.registry_uploaded).toBe(true)

    const again = await agent.post(`/v1/houses/${house.id}/registry/imports/${id}/apply`).set('X-Step-Up-Token', token).send({})
    expect(again.status).toBe(409)
  })

  it('reads XLSX with numeric cells and a title row', async () => {
    const { house, agent } = await chairmanWithHouse()
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Реестр')
    ws.addRow(['Реестр собственников'])
    ws.addRow(['№ п/п', 'Квартира', 'ФИО собственника', 'ИИН', 'Площадь, м²'])
    ws.addRow([1, 3, 'Ли Артём', Number(makeIin()), 52.4])
    const buf = Buffer.from(await wb.xlsx.writeBuffer())
    const res = await upload(agent, house.id, buf, 'Реестр.xlsx')
    expect(res.status).toBe(201)
    expect(res.body.issues).toEqual([])
    expect(res.body.sample).toEqual([{ row: 3, unit_number: '3', full_name: 'Ли Артём', area: '52.40' }])
  })

  it('reads a Windows-1251 CSV saved by Russian Excel', async () => {
    const { house, agent } = await chairmanWithHouse()
    const text = `Номер помещения;ФИО;ИИН\r\n1;Семёнова Алия;${makeIin()}\r\n`
    const cp1251 = Buffer.from([...text].map((ch) => {
      const code = ch.charCodeAt(0)
      if (code === 0x401) return 0xa8
      if (code === 0x451) return 0xb8
      return code >= 0x410 && code <= 0x44f ? code - 0x350 : code
    }))
    const res = await upload(agent, house.id, cp1251)
    expect(res.status).toBe(201)
    expect(res.body.sample[0].full_name).toBe('Семёнова Алия')
  })

  it('refuses files it cannot read', async () => {
    const { house, agent } = await chairmanWithHouse()
    expect((await upload(agent, house.id, Buffer.from('x'), 'reestr.xls')).body.error.code).toBe('REGISTRY_INVALID')
    expect((await upload(agent, house.id, Buffer.from('not a zip'), 'reestr.xlsx')).body.error.code).toBe('REGISTRY_INVALID')
    expect((await upload(agent, house.id, csv([['Квартира', 'Телефон']]))).body.error.message).toContain('Не нашли заголовки')
    expect((await agent.post(`/v1/houses/${house.id}/registry/imports`)).status).toBe(422)
    expect((await upload(agent, house.id, Buffer.alloc(6 * 1024 * 1024), 'big.csv')).status).toBe(413)
  })

  it('keeps entered areas unless asked to overwrite', async () => {
    const { house, agent, token } = await chairmanWithHouse()
    await owner.unit.updateMany({ where: { houseId: house.id, number: '1' }, data: { area: 40 } })
    const file = csv([['Номер помещения', 'ФИО', 'ИИН', 'Площадь'], ['1', 'Асанов Данияр', makeIin(), '45']])

    const first = await upload(agent, house.id, file)
    expect(first.body.area_conflicts).toBe(1)
    expect(first.body.issues[0].code).toBe('AREA_CONFLICT')
    const kept = await agent.post(`/v1/houses/${house.id}/registry/imports/${first.body.import_id}/apply`).set('X-Step-Up-Token', token).send({})
    expect(kept.body.areas_updated).toBe(0)

    const second = await upload(agent, house.id, file)
    const overwritten = await agent
      .post(`/v1/houses/${house.id}/registry/imports/${second.body.import_id}/apply`)
      .set('X-Step-Up-Token', token)
      .send({ areas: 'overwrite' })
    expect(overwritten.body.areas_updated).toBe(1)
    // Новый реестр заменяет прежний, а не дописывается к нему
    expect(await owner.ownerRegistryEntry.count({ where: { houseId: house.id } })).toBe(1)
  })

  it('verifies residents who confirmed their identity before the registry existed', async () => {
    const { house, agent, token } = await chairmanWithHouse()
    const iin = makeIin()
    const resident = await makeUser({ totp: false, phone: '+77071234532', fullName: 'Асанов Данияр Айдарович' })
    const { CryptoService } = await import('../src/infra/crypto.service')
    await owner.user.update({ where: { id: resident.id }, data: { iinHash: new CryptoService().hashIin(iin), identityVerifiedAt: new Date() } })
    await owner.houseMembership.create({ data: { houseId: house.id, userId: resident.id, role: 'RESIDENT', joinedVia: 'INVITE_LINK' } })
    const unit = await owner.unit.findFirstOrThrow({ where: { houseId: house.id, number: '1' } })
    await owner.unitOwnership.create({ data: { houseId: house.id, unitId: unit.id, userId: resident.id, relation: 'OWNER' } })

    const preview = await upload(agent, house.id, csv([['Номер помещения', 'ФИО', 'ИИН'], ['1', 'Асанов Д.А.', iin]]))
    const applied = await agent.post(`/v1/houses/${house.id}/registry/imports/${preview.body.import_id}/apply`).set('X-Step-Up-Token', token).send({})
    expect(applied.body.verified_now).toBe(1)
    expect(await owner.unitOwnership.findFirstOrThrow({ where: { userId: resident.id } })).toMatchObject({
      verificationStatus: 'VERIFIED', verificationMethod: 'EDS_REGISTRY_MATCH',
    })
  })

  it('a discarded preview cannot be applied', async () => {
    const { house, agent, token } = await chairmanWithHouse()
    const preview = await upload(agent, house.id, csv([['Номер помещения', 'ФИО', 'ИИН'], ['1', 'Асанов Данияр', makeIin()]]))
    await agent.delete(`/v1/houses/${house.id}/registry/imports/${preview.body.import_id}`).expect(200)
    const res = await agent.post(`/v1/houses/${house.id}/registry/imports/${preview.body.import_id}/apply`).set('X-Step-Up-Token', token).send({})
    expect(res.status).toBe(409)
  })

  it('only the chairman of this house sees the registry', async () => {
    const { house, agent } = await chairmanWithHouse()
    const preview = await upload(agent, house.id, csv([['Номер помещения', 'ФИО', 'ИИН'], ['1', 'Асанов Данияр', makeIin()]]))

    const other = await makeUser()
    await makeHouse({ chairman: other })
    const otherAgent = await login(t, other)
    expect((await otherAgent.get(`/v1/houses/${house.id}/registry/imports/${preview.body.import_id}`)).status).toBe(404)

    const resident = await phoneLogin(t, '+77071234532')
    await owner.houseMembership.create({ data: { houseId: house.id, userId: resident.body.user.id, role: 'RESIDENT', joinedVia: 'INVITE_LINK' } })
    expect((await resident.agent.get(`/v1/houses/${house.id}/registry`)).status).toBe(403)
  })
})

describe('unit areas', () => {
  it('bulk entry fills areas in one go and moves the house to voting-ready', async () => {
    const { house, agent, token } = await chairmanWithHouse()
    const units = await owner.unit.findMany({ where: { houseId: house.id } })
    const areas = units.map((u, i) => ({ unit_id: u.id, area: i % 2 ? `${50 + i},5` : 50 + i }))

    expect((await agent.post(`/v1/houses/${house.id}/units/bulk-areas`).send({ areas })).status).toBe(428)
    const res = await agent.post(`/v1/houses/${house.id}/units/bulk-areas`).set('X-Step-Up-Token', token).send({ areas })
    expect(res.status).toBe(200)
    expect(res.body.updated).toBe(8)
    expect(res.body.readiness.areas_filled).toBe(8)

    const after = await owner.house.findUniqueOrThrow({ where: { id: house.id } })
    expect(after.isVotingReady).toBe(true)
    expect(Number(after.totalArea)).toBeCloseTo(units.reduce((s, _, i) => s + 50 + i + (i % 2 ? 0.5 : 0), 0))

    // Повтор тех же значений ничего не меняет и не пишет в журнал
    const repeat = await agent.post(`/v1/houses/${house.id}/units/bulk-areas`).set('X-Step-Up-Token', token).send({ areas })
    expect(repeat.body.updated).toBe(0)
    expect(await owner.auditLog.count({ where: { action: 'unit.bulk_areas' } })).toBe(1)
  })

  it('rejects bad areas, duplicates and units of another house', async () => {
    const { house, agent, token } = await chairmanWithHouse()
    const { house: other } = await makeHouse()
    const [mine] = await owner.unit.findMany({ where: { houseId: house.id }, take: 1 })
    const [foreign] = await owner.unit.findMany({ where: { houseId: other.id }, take: 1 })
    const post = (areas: unknown) => agent.post(`/v1/houses/${house.id}/units/bulk-areas`).set('X-Step-Up-Token', token).send({ areas })

    expect((await post([{ unit_id: mine!.id, area: -1 }])).status).toBe(400)
    expect((await post([{ unit_id: mine!.id, area: 'abc' }])).status).toBe(400)
    expect((await post([{ unit_id: mine!.id, area: 50 }, { unit_id: mine!.id, area: 51 }])).status).toBe(422)
    const cross = await post([{ unit_id: foreign!.id, area: 50 }])
    expect(cross.body.error.code).toBe('UNIT_NOT_FOUND')
    expect((await owner.unit.findUniqueOrThrow({ where: { id: foreign!.id } })).area).toBeNull()
  })

  it('a single unit edit keeps the previous value in the audit log', async () => {
    const { house, agent, token } = await chairmanWithHouse()
    const [unit] = await owner.unit.findMany({ where: { houseId: house.id }, take: 1 })
    await owner.unit.update({ where: { id: unit!.id }, data: { area: 40 } })
    const res = await agent.patch(`/v1/houses/${house.id}/units/${unit!.id}`).set('X-Step-Up-Token', token).send({ area: '42,5', rooms: 2 })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ area: '42.5' })
    const entry = await owner.auditLog.findFirstOrThrow({ where: { action: 'unit.update' } })
    expect(entry.before).toMatchObject({ area: '40' })
    expect((await agent.patch(`/v1/houses/${house.id}/units/${unit!.id}`).set('X-Step-Up-Token', token).send({})).status).toBe(400)
  })
})
