import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { CryptoService } from '../src/infra/crypto.service'
import { DevSignatureProvider } from '../src/integrations/signature/dev-signature.provider'
import { SIGNATURE_PROVIDER } from '../src/integrations/signature/signature.provider'
import { createApp, login, makeBin as makeIin, makeHouse, makeUser, owner, phoneLogin, resetDb, stepUpToken, type TestApp } from './helpers'

let t: TestApp
let provider: DevSignatureProvider
const crypto = new CryptoService()
const http = () => request(t.app.getHttpServer())
type Agent = ReturnType<typeof request.agent>

beforeAll(async () => {
  t = await createApp()
  provider = t.app.get(SIGNATURE_PROVIDER)
})
afterAll(async () => {
  await t.app.close()
})
beforeEach(async () => {
  await resetDb()
  t.limiter.reset()
  t.sms.outbox.length = 0
})

/** Дом, жилец по ссылке с заявленным помещением */
async function residentInHouse(opts: { unit?: string; relation?: 'OWNER' | 'TENANT'; phone?: string } = {}) {
  const chairman = await makeUser()
  const { house } = await makeHouse({ chairman })
  const chairmanAgent = await login(t, chairman)
  const invite = await chairmanAgent.post(`/v1/houses/${house.id}/invites`).send({ type: 'PUBLIC_LINK' })
  const { agent, body } = await phoneLogin(t, opts.phone ?? '+77071234532')
  await agent
    .post(`/v1/invites/${invite.body.token}/accept`)
    .send({ unit_number: opts.unit ?? '3', relation: opts.relation ?? 'OWNER', accept_terms: true })
    .expect(200)
  return { chairman, chairmanAgent, house, agent, userId: body.user.id }
}

async function registry(houseId: string, unitNumber: string, iin: string, fullName: string) {
  await owner.ownerRegistryEntry.create({ data: { houseId, unitNumber, iinHash: crypto.hashIin(iin), fullName, importId: randomUUID() } })
}

const externalIdOf = (started: { body: { deeplink: string } }) => started.body.deeplink.split('#')[1] as string

async function devSign(externalId: string, iin: string, fullName: string) {
  const res = await http().post(`/v1/dev/egov/${externalId}/sign`).send({ iin, full_name: fullName })
  expect(res.status).toBe(200)
}

/** Полный проход: старт, подпись в «eGov mobile», «Готово» */
async function verifyAs(agent: Agent, signer: { iin: string; fullName: string }, houseId?: string) {
  const started = await agent.post('/v1/verification/start').send(houseId ? { house_id: houseId } : {})
  expect(started.status).toBe(201)
  await devSign(externalIdOf(started), signer.iin, signer.fullName)
  return agent.post(`/v1/verification/${started.body.verification_id}/complete`)
}

describe('identity verification', () => {
  it('a registry match verifies the ownership and gives the vote', async () => {
    const { house, agent, userId } = await residentInHouse()
    const iin = makeIin()
    await registry(house.id, '3', iin, 'Асанов Д.А.')

    const res = await verifyAs(agent, { iin, fullName: 'Асанов Данияр Айдарович' }, house.id)
    expect(res.status).toBe(200)
    expect(res.body.state).toBe('SIGNED')
    expect(res.body.result).toEqual({
      full_name: 'Асанов Данияр Айдарович',
      iin_masked: `•••• •••• ${iin.slice(-4)}`,
      units: [{ house_id: house.id, unit_number: '3', outcome: 'MATCHED' }],
    })

    const place = await agent.get(`/v1/houses/${house.id}/me`)
    expect(place.body.identity_verified).toBe(true)
    expect(place.body.units[0]).toMatchObject({ verification: 'VERIFIED', can_vote: true })

    const user = await owner.user.findUniqueOrThrow({ where: { id: userId } })
    expect(user.fullName).toBe('Асанов Данияр Айдарович')
    expect(crypto.decrypt(user.iinEncrypted!)).toBe(iin)
    expect(crypto.equal(user.iinHash!, crypto.hashIin(iin))).toBe(true)

    const ownership = await owner.unitOwnership.findFirstOrThrow({ where: { userId } })
    expect(ownership).toMatchObject({ verificationMethod: 'EDS_REGISTRY_MATCH', verificationNote: null })

    // Подписанный документ и есть согласие на обработку персональных данных
    const consent = await owner.consent.findFirstOrThrow({ where: { userId, kind: 'PERSONAL_DATA' } })
    const signature = await owner.signature.findUniqueOrThrow({ where: { id: consent.signatureId! } })
    expect(signature).toMatchObject({ purpose: 'IDENTITY_VERIFICATION', signerFullName: 'АСАНОВ ДАНИЯР АЙДАРОВИЧ' })

    // ИИН не попадает в журнал ни в каком виде
    const audit = await owner.auditLog.findMany()
    expect(JSON.stringify(audit, (_, v) => (typeof v === 'bigint' ? String(v) : v))).not.toContain(iin)
  })

  it('the client cannot finish before signing', async () => {
    const { agent } = await residentInHouse()
    const started = await agent.post('/v1/verification/start').send({})
    expect(started.body.document).toContain('Согласие на сбор и обработку персональных данных')
    const res = await agent.post(`/v1/verification/${started.body.verification_id}/complete`)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('VERIFICATION_NOT_SIGNED')
    expect((await agent.get(`/v1/verification/${started.body.verification_id}/status`)).body.state).toBe('PENDING')
  })

  it('a signature over another document is refused', async () => {
    const { agent } = await residentInHouse()
    const a = await agent.post('/v1/verification/start').send({})
    t.limiter.reset()
    const b = await agent.post('/v1/verification/start').send({})
    await devSign(externalIdOf(a), makeIin(), 'Асанов Данияр')

    // Подпись процедуры A подставлена в процедуру B: хеш документа не сходится
    await owner.verification.update({ where: { id: b.body.verification_id }, data: { externalId: externalIdOf(a) } })
    const res = await agent.post(`/v1/verification/${b.body.verification_id}/complete`)
    expect(res.status).toBe(422)
    expect(res.body.error).toMatchObject({ code: 'VERIFICATION_FAILED', message: 'Подписан другой документ' })
    expect((await owner.user.findFirstOrThrow({ where: { phone: '+77071234532' } })).identityVerifiedAt).toBeNull()
  })

  it('a forged signature does not pass the CA check', async () => {
    const forged = Buffer.from(JSON.stringify({
      v: 1, document_hash: '00', signer: { iin: makeIin(), full_name: 'X' },
      cert: { serial: '1', valid_from: new Date(0).toISOString(), valid_to: new Date(Date.now() + 1e9).toISOString(), issuer: 'X' },
      signed_at: new Date().toISOString(), sig: Buffer.alloc(64).toString('base64'),
    }))
    const res = await provider.verify(forged, Buffer.alloc(32))
    expect(res).toEqual({ valid: false, reason: 'Подпись не прошла проверку ключом удостоверяющего центра' })
  })

  it('not in the registry: verified identity, ownership waits for the chairman', async () => {
    const { house, agent } = await residentInHouse()
    const res = await verifyAs(agent, { iin: makeIin(), fullName: 'Ким Виктория' })
    expect(res.body.result.units).toEqual([{ house_id: house.id, unit_number: '3', outcome: 'NOT_IN_REGISTRY' }])
    const place = await agent.get(`/v1/houses/${house.id}/me`)
    expect(place.body).toMatchObject({ identity_verified: true, units: [{ verification: 'PENDING', can_vote: false }] })
  })

  it('found in the registry under another unit: binds that unit and leaves the claim for review', async () => {
    const { house, agent, userId } = await residentInHouse({ unit: '3' })
    const iin = makeIin()
    await registry(house.id, '4', iin, 'Ким Виктория')
    const res = await verifyAs(agent, { iin, fullName: 'Ким Виктория Сергеевна' })
    expect(res.body.result.units).toEqual([
      { house_id: house.id, unit_number: '4', outcome: 'MOVED' },
      { house_id: house.id, unit_number: '3', outcome: 'NOT_IN_REGISTRY' },
    ])
    const rows = await owner.unitOwnership.findMany({ where: { userId }, include: { unit: true } })
    const byUnit = Object.fromEntries(rows.map((r) => [r.unit.number, r.verificationStatus]))
    expect(byUnit).toEqual({ '3': 'PENDING', '4': 'VERIFIED' })
  })

  it('a name mismatch keeps the ownership pending with a note', async () => {
    const { house, agent, userId } = await residentInHouse()
    const iin = makeIin()
    await registry(house.id, '3', iin, 'Сейтова Айгерим')
    const res = await verifyAs(agent, { iin, fullName: 'Бекова Айгерим' })
    expect(res.body.result.units[0].outcome).toBe('NAME_MISMATCH')
    const ownership = await owner.unitOwnership.findFirstOrThrow({ where: { userId } })
    expect(ownership.verificationStatus).toBe('PENDING')
    expect(ownership.verificationNote).toContain('Сейтова Айгерим')
  })

  it('a tenant is verified as a person but gets no vote', async () => {
    const { house, agent } = await residentInHouse({ relation: 'TENANT' })
    const res = await verifyAs(agent, { iin: makeIin(), fullName: 'Ли Артём' })
    expect(res.body.result.units[0].outcome).toBe('TENANT')
    expect((await agent.get(`/v1/houses/${house.id}/me`)).body.units[0].can_vote).toBe(false)
  })

  it('one IIN, one account', async () => {
    const iin = makeIin()
    const first = await residentInHouse({ phone: '+77071234532' })
    expect((await verifyAs(first.agent, { iin, fullName: 'Асанов Данияр' })).status).toBe(200)

    const second = await phoneLogin(t, '+77071234533')
    const res = await verifyAs(second.agent, { iin, fullName: 'Асанов Данияр' })
    expect(res.status).toBe(422)
    expect(res.body.error.message).toContain('другой учётной записи')
    expect((await owner.user.findUniqueOrThrow({ where: { id: second.body.user.id } })).identityVerifiedAt).toBeNull()
  })

  it('an account verified once cannot be re-signed by another person', async () => {
    const { agent } = await residentInHouse()
    expect((await verifyAs(agent, { iin: makeIin(), fullName: 'Асанов Данияр' })).status).toBe(200)
    t.limiter.reset()
    const res = await verifyAs(agent, { iin: makeIin(), fullName: 'Другой Человек' })
    expect(res.status).toBe(422)
    expect(res.body.error.message).toBe('Документ подписан ЭЦП другого человека')
  })

  it('finishing twice is harmless, and expired procedures cannot be finished', async () => {
    const { agent } = await residentInHouse()
    const started = await agent.post('/v1/verification/start').send({})
    await devSign(externalIdOf(started), makeIin(), 'Асанов Данияр')
    const id = started.body.verification_id as string
    expect((await agent.post(`/v1/verification/${id}/complete`)).status).toBe(200)
    expect((await agent.post(`/v1/verification/${id}/complete`)).body.state).toBe('SIGNED')
    expect(await owner.signature.count()).toBe(1)

    t.limiter.reset()
    const late = await agent.post('/v1/verification/start').send({})
    await owner.verification.update({ where: { id: late.body.verification_id }, data: { expiresAt: new Date(Date.now() - 1000) } })
    expect((await agent.get(`/v1/verification/${late.body.verification_id}/status`)).body.state).toBe('EXPIRED')
    expect((await agent.post(`/v1/verification/${late.body.verification_id}/complete`)).status).toBe(422)
  })

  it("someone else's procedure is invisible", async () => {
    const { agent } = await residentInHouse()
    const started = await agent.post('/v1/verification/start').send({})
    const stranger = await phoneLogin(t, '+77071234599')
    expect((await stranger.agent.get(`/v1/verification/${started.body.verification_id}/status`)).status).toBe(404)
    expect((await stranger.agent.post(`/v1/verification/${started.body.verification_id}/complete`)).status).toBe(404)
  })

  it('cannot start for a house the user is not in', async () => {
    const { house } = await residentInHouse()
    const stranger = await phoneLogin(t, '+77071234599')
    expect((await stranger.agent.post('/v1/verification/start').send({ house_id: house.id })).status).toBe(404)
  })
})

describe('manual ownership review', () => {
  it('the chairman confirms a verified resident who is missing from the registry', async () => {
    const { chairman, chairmanAgent, house, agent } = await residentInHouse()
    expect((await verifyAs(agent, { iin: makeIin(), fullName: 'Ким Виктория' })).status).toBe(200)

    const queue = await chairmanAgent.get(`/v1/houses/${house.id}/ownerships/pending`)
    expect(queue.status).toBe(200)
    expect(queue.body).toEqual([expect.objectContaining({
      full_name: 'Ким Виктория', identity_verified: true, unit_number: '3', relation: 'OWNER',
      note: 'Нет в реестре собственников', registry_names: [], phone: '+7 707 ••• •• 32',
    })])

    const id = queue.body[0].id as string
    expect((await chairmanAgent.post(`/v1/houses/${house.id}/ownerships/${id}/verify`)).status).toBe(428)
    const token = await stepUpToken(chairmanAgent, chairman.secret)
    const res = await chairmanAgent.post(`/v1/houses/${house.id}/ownerships/${id}/verify`).set('X-Step-Up-Token', token)
    expect(res.status).toBe(200)
    expect((await agent.get(`/v1/houses/${house.id}/me`)).body.units[0].can_vote).toBe(true)
    expect(await owner.unitOwnership.findUniqueOrThrow({ where: { id } })).toMatchObject({ verificationMethod: 'MANUAL_CHAIRMAN', verifiedBy: chairman.id })

    const again = await chairmanAgent.post(`/v1/houses/${house.id}/ownerships/${id}/verify`).set('X-Step-Up-Token', token)
    expect(again.body.error.code).toBe('OWNERSHIP_DECIDED')
  })

  it('no vote without an EDS-verified identity, even from the chairman', async () => {
    const { chairman, chairmanAgent, house } = await residentInHouse()
    const queue = await chairmanAgent.get(`/v1/houses/${house.id}/ownerships/pending`)
    expect(queue.body[0].identity_verified).toBe(false)
    const token = await stepUpToken(chairmanAgent, chairman.secret)
    const res = await chairmanAgent.post(`/v1/houses/${house.id}/ownerships/${queue.body[0].id}/verify`).set('X-Step-Up-Token', token)
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('IDENTITY_REQUIRED')
  })

  it('the chairman can reject with a reason', async () => {
    const { chairman, chairmanAgent, house, agent } = await residentInHouse()
    const queue = await chairmanAgent.get(`/v1/houses/${house.id}/ownerships/pending`)
    const token = await stepUpToken(chairmanAgent, chairman.secret)
    const res = await chairmanAgent
      .post(`/v1/houses/${house.id}/ownerships/${queue.body[0].id}/reject`)
      .set('X-Step-Up-Token', token)
      .send({ reason: 'Квартира продана в августе' })
    expect(res.status).toBe(200)
    expect((await agent.get(`/v1/houses/${house.id}/me`)).body.units[0].verification).toBe('REJECTED')
  })

  it('residents and other houses cannot reach the queue', async () => {
    const { house, agent } = await residentInHouse()
    expect((await agent.get(`/v1/houses/${house.id}/ownerships/pending`)).status).toBe(403)
    const other = await makeUser()
    await makeHouse({ chairman: other })
    const otherAgent = await login(t, other)
    expect((await otherAgent.get(`/v1/houses/${house.id}/ownerships/pending`)).status).toBe(404)
  })
})
