import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CSRF,
  type TestApp,
  type WebSession,
  createHouse,
  createTestApp,
  createUser,
  loginWeb,
  randomBin,
} from './helpers.js';

let t: TestApp;
let admin: WebSession;
const su = () => ({ ...CSRF, 'X-Step-Up-Token': admin.stepUp });

beforeAll(async () => {
  t = await createTestApp();
  admin = await loginWeb(t, await createUser(t, { admin: true }));
});
afterAll(() => t.close());

describe('organizations', () => {
  it('validates BIN checksum and rejects duplicates with 409', async () => {
    const bin = randomBin();
    const body = {
      name: 'ОСИ Тест',
      bin,
      management_form: 'OSI',
      legal_address: 'г. Астана, ул. Тестовая 5',
    };
    await admin.agent
      .post('/v1/admin/organizations')
      .set(su())
      .send({ ...body, bin: '123456789012' })
      .expect(400);
    await admin.agent.post('/v1/admin/organizations').set(su()).send(body).expect(201);
    const dup = await admin.agent.post('/v1/admin/organizations').set(su()).send(body).expect(409);
    expect(dup.body.error.code).toBe('ORGANIZATION_BIN_TAKEN');
  });
});

describe('houses and units', () => {
  it('creating a house generates units evenly across entrances', async () => {
    const { houseId } = await createHouse(t, admin, 11);
    const units = await t.db.unit.findMany({ where: { house_id: houseId }, orderBy: { id: 'asc' } });
    expect(units).toHaveLength(11);
    expect(units.map((u) => u.number)).toEqual(Array.from({ length: 11 }, (_, i) => String(i + 1)));
    expect(units.filter((u) => u.entrance === 1)).toHaveLength(6);
  });

  it('becomes voting-ready only when every participating unit has an area', async () => {
    const { houseId } = await createHouse(t, admin, 4);
    const r1 = await admin.agent.get(`/v1/admin/houses/${houseId}/readiness`).expect(200);
    expect(r1.body).toMatchObject({
      units_generated: true,
      areas_filled: 0,
      areas_total: 4,
      is_voting_ready: false,
      chairman_assigned: false,
    });
    expect(r1.body.blocking_issues).toContain('4 помещений без указанной площади');

    const units = await t.db.unit.findMany({ where: { house_id: houseId }, orderBy: { id: 'asc' } });
    await t.db.unit.updateMany({
      where: { id: { in: units.slice(0, 3).map((u) => u.id) } },
      data: { area: '50.25' },
    });
    expect((await t.db.house.findUniqueOrThrow({ where: { id: houseId } })).is_voting_ready).toBe(false);

    await t.db.unit.update({ where: { id: units[3]!.id }, data: { is_excluded_from_voting: true } });
    const house = await t.db.house.findUniqueOrThrow({ where: { id: houseId } });
    expect(house.is_voting_ready).toBe(true);
    expect(house.total_area?.toFixed(2)).toBe('150.75');
  });

  it('refuses to regenerate units once areas are filled', async () => {
    const { houseId } = await createHouse(t, admin, 4);
    await admin.agent
      .post(`/v1/admin/houses/${houseId}/generate-units`)
      .set(su())
      .send({
        strategy: 'SEQUENTIAL',
        entrances: [
          { entrance: 1, from: 1, to: 2 },
          { entrance: 2, from: 101, to: 103 },
        ],
      })
      .expect(200);
    const units = await t.db.unit.findMany({ where: { house_id: houseId }, orderBy: { id: 'asc' } });
    expect(units.map((u) => u.number)).toEqual(['1', '2', '101', '102', '103']);

    await t.db.unit.update({ where: { id: units[0]!.id }, data: { area: '40' } });
    const res = await admin.agent
      .post(`/v1/admin/houses/${houseId}/generate-units`)
      .set(su())
      .send({ strategy: 'SEQUENTIAL' })
      .expect(409);
    expect(res.body.error.code).toBe('UNITS_LOCKED');
  });

  it('rejects overlapping layouts with 422', async () => {
    const { houseId } = await createHouse(t, admin, 4);
    const res = await admin.agent
      .post(`/v1/admin/houses/${houseId}/generate-units`)
      .set(su())
      .send({
        strategy: 'SEQUENTIAL',
        entrances: [
          { entrance: 1, from: 1, to: 5 },
          { entrance: 2, from: 5, to: 8 },
        ],
      })
      .expect(422);
    expect(res.body.error.code).toBe('UNIT_LAYOUT_INVALID');
  });

  it('paginates with a cursor', async () => {
    const { houseId } = await createHouse(t, admin, 25);
    const p1 = await admin.agent.get(`/v1/admin/houses/${houseId}/units?limit=10`).expect(200);
    const p2 = await admin.agent
      .get(`/v1/admin/houses/${houseId}/units?limit=10&cursor=${p1.body.next_cursor}`)
      .expect(200);
    const p3 = await admin.agent
      .get(`/v1/admin/houses/${houseId}/units?limit=10&cursor=${p2.body.next_cursor}`)
      .expect(200);
    expect(p3.body.next_cursor).toBeNull();
    const numbers = [...p1.body.items, ...p2.body.items, ...p3.body.items].map((u: { number: string }) =>
      Number(u.number),
    );
    expect(numbers).toEqual(Array.from({ length: 25 }, (_, i) => i + 1));
  });
});

describe('audit log', () => {
  it('records admin actions without personal data and keeps the hash chain intact', async () => {
    const { houseId } = await createHouse(t, admin, 2);
    await admin.agent
      .post(`/v1/admin/houses/${houseId}/chairman`)
      .set(su())
      .send({ email: `audit-${Date.now()}@test.local`, full_name: 'Аудит Проверкин' })
      .expect(201);

    const log = await admin.agent.get(`/v1/admin/audit?house_id=${houseId}`).expect(200);
    const actions = log.body.items.map((e: { action: string }) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['house.create', 'membership.chairman.assign']));

    const rows = await t.db.auditLog.findMany({ where: { house_id: houseId } });
    expect(JSON.stringify(rows.map((r) => [r.before, r.after]))).not.toMatch(/@test\.local|Проверкин/);

    const verify = await admin.agent.get('/v1/admin/audit/verify').expect(200);
    expect(verify.body).toEqual({ intact: true, broken: [] });
  });

  it('a failed action leaves no audit record (same transaction)', async () => {
    const before = await t.db.auditLog.count({ where: { action: 'organization.create' } });
    await admin.agent
      .post('/v1/admin/organizations')
      .set(su())
      .send({ name: 'x', bin: '990940000036', management_form: 'OSI', legal_address: 'г. Алматы' });
    await admin.agent
      .post('/v1/admin/organizations')
      .set(su())
      .send({ name: 'x', bin: '990940000036', management_form: 'OSI', legal_address: 'г. Алматы' });
    const after = await t.db.auditLog.count({ where: { action: 'organization.create' } });
    expect(after - before).toBeLessThanOrEqual(1);
  });
});
