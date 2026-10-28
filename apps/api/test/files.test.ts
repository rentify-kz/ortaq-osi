import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { addMember, createApp, login, makeHouse, makeUser, owner, phoneLogin, photo, resetDb, uploadPhoto, type TestApp } from './helpers'

let t: TestApp

beforeAll(async () => {
  t = await createApp()
})
afterAll(async () => {
  await t.app.close()
})
beforeEach(async () => {
  await resetDb()
  t.limiter.reset()
  t.storage.objects.clear()
})

async function residentHouse() {
  const chairman = await makeUser()
  const { house } = await makeHouse({ chairman })
  const r = await phoneLogin(t, '+77071230001')
  await addMember(house.id, r.body.user.id, 'RESIDENT')
  return { house, chairman, resident: r }
}

describe('file upload', () => {
  it('goes through incoming storage, is re-encoded and stored without EXIF', async () => {
    const { house, resident } = await residentHouse()
    const body = await photo()
    const res = await resident.agent.post(`/v1/houses/${house.id}/files/upload-url`).send({ purpose: 'REQUEST_PHOTO', mime_type: 'image/jpeg', size_bytes: body.length, name: 'IMG 0001.jpg' })
    expect(res.status).toBe(201)
    expect(res.body).toMatchObject({ method: 'PUT', headers: { 'content-type': 'image/jpeg' } })

    // До finalize ничего не готово
    expect((await resident.agent.post(`/v1/houses/${house.id}/files/${res.body.file_id}/finalize`)).body.error.code).toBe('FILE_NOT_UPLOADED')
    t.storage.putAsClient(res.body.upload_url, body)
    const fin = await resident.agent.post(`/v1/houses/${house.id}/files/${res.body.file_id}/finalize`)
    expect(fin.status).toBe(200)
    expect(fin.body).toMatchObject({ mime_type: 'image/jpeg', width: 640, height: 480 })

    const stored = await owner.file.findUniqueOrThrow({ where: { id: res.body.file_id } })
    expect(stored).toMatchObject({ status: 'READY', exifStripped: true, scanStatus: 'CLEAN' })
    expect(stored.storageKey).toBe(`files/${house.id}/${stored.id}.jpg`)
    const keys = [...t.storage.objects.keys()]
    expect(keys).toEqual([stored.storageKey])
    expect(t.storage.objects.get(stored.storageKey)!.body.includes(Buffer.from('secret-location'))).toBe(false)

    // Повторный finalize ничего не ломает
    expect((await resident.agent.post(`/v1/houses/${house.id}/files/${res.body.file_id}/finalize`)).status).toBe(200)
  })

  it('rejects content that is not a photo, whatever the client claimed', async () => {
    const { house, resident } = await residentHouse()
    const fake = Buffer.from('<html><script>alert(1)</script></html>')
    const res = await resident.agent.post(`/v1/houses/${house.id}/files/upload-url`).send({ purpose: 'REQUEST_PHOTO', mime_type: 'image/jpeg', size_bytes: fake.length, name: 'cat.jpg' })
    t.storage.putAsClient(res.body.upload_url, fake)
    const fin = await resident.agent.post(`/v1/houses/${house.id}/files/${res.body.file_id}/finalize`)
    expect(fin.status).toBe(422)
    expect(fin.body.error.code).toBe('FILE_REJECTED')
    expect(t.storage.objects.size).toBe(0)
    expect((await owner.file.findUniqueOrThrow({ where: { id: res.body.file_id } })).status).toBe('REJECTED')
  })

  it('refuses unsupported types and oversize files up front', async () => {
    const { house, resident } = await residentHouse()
    const url = `/v1/houses/${house.id}/files/upload-url`
    expect((await resident.agent.post(url).send({ purpose: 'REQUEST_PHOTO', mime_type: 'application/pdf', size_bytes: 100, name: 'a.pdf' })).status).toBe(400)
    expect((await resident.agent.post(url).send({ purpose: 'REQUEST_PHOTO', mime_type: 'image/jpeg', size_bytes: 20 * 1024 * 1024, name: 'a.jpg' })).status).toBe(400)
  })

  it("an unattached file is visible only to its uploader, and nobody can finalize someone else's", async () => {
    const { house, chairman, resident } = await residentHouse()
    const id = await uploadPhoto(t, resident.agent, house.id)
    expect((await resident.agent.get(`/v1/houses/${house.id}/files/${id}/download-url`)).body.url).toMatch(/^memory:\/\/download\/files\//)

    const chair = await login(t, chairman)
    expect((await chair.get(`/v1/houses/${house.id}/files/${id}/download-url`)).status).toBe(404)
    expect((await chair.post(`/v1/houses/${house.id}/files/${id}/finalize`)).status).toBe(404)

    const other = await makeUser()
    await makeHouse({ chairman: other })
    const stranger = await login(t, other)
    expect((await stranger.get(`/v1/houses/${house.id}/files/${id}/download-url`)).status).toBe(404)
  })

  it('limits uploads per user per hour', async () => {
    const { house, resident } = await residentHouse()
    const send = () => resident.agent.post(`/v1/houses/${house.id}/files/upload-url`).send({ purpose: 'REQUEST_PHOTO', mime_type: 'image/jpeg', size_bytes: 1000, name: 'a.jpg' })
    for (let i = 0; i < 30; i++) expect((await send()).status).toBe(201)
    expect((await send()).status).toBe(429)
  })
})
