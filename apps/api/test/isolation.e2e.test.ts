/**
 * Изоляция домов (docs/spec/13-security.md §1). ШАБЛОН для каждого нового эндпоинта в скоупе дома:
 * добавьте путь в HOUSE_SCOPED_GETS (или отдельный тест для записи) — без этого код не мержится.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DbService } from '../src/infra/db/db.service.js';
import { type HouseFixture, type TestApp, type WebSession, createChairman, createHouse, createTestApp, createUser, loginWeb } from './helpers.js';

/** Все GET-эндпоинты вида /houses/:houseId/... */
const HOUSE_SCOPED_GETS = ['/v1/houses/:houseId', '/v1/houses/:houseId/units'];

let t: TestApp;
let a: HouseFixture;
let b: HouseFixture;
let chairmanA: WebSession;
let chairmanB: WebSession;

beforeAll(async () => {
  t = await createTestApp();
  const admin = await loginWeb(t, await createUser(t, { admin: true }));
  a = await createHouse(t, admin, 10);
  b = await createHouse(t, admin, 6);
  chairmanA = await loginWeb(t, await createChairman(t, a.houseId));
  chairmanB = await loginWeb(t, await createChairman(t, b.houseId));
});
afterAll(() => t.close());

describe.each(HOUSE_SCOPED_GETS)('GET %s', (path) => {
  it('member of house A gets 200 for house A', async () => {
    await chairmanA.agent.get(path.replace(':houseId', a.houseId)).expect(200);
  });

  it('member of house A gets 404 (not 403) for house B', async () => {
    const res = await chairmanA.agent.get(path.replace(':houseId', b.houseId)).expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('a non-existent house and a malformed id are indistinguishable from a foreign house', async () => {
    const foreign = await chairmanA.agent.get(path.replace(':houseId', b.houseId));
    const missing = await chairmanA.agent.get(path.replace(':houseId', randomUUID()));
    const malformed = await chairmanA.agent.get(path.replace(':houseId', 'not-a-uuid'));
    expect(missing.status).toBe(404);
    expect(malformed.status).toBe(404);
    expect(missing.body).toEqual(foreign.body);
    expect(malformed.body).toEqual(foreign.body);
  });
});

describe('house list and units', () => {
  it('GET /houses lists only own houses', async () => {
    const res = await chairmanA.agent.get('/v1/houses').expect(200);
    expect(res.body.map((h: { id: string }) => h.id)).toEqual([a.houseId]);
  });

  it('units of house A contain only units of house A', async () => {
    const resA = await chairmanA.agent.get(`/v1/houses/${a.houseId}/units?limit=100`).expect(200);
    const resB = await chairmanB.agent.get(`/v1/houses/${b.houseId}/units?limit=100`).expect(200);
    expect(resA.body.items).toHaveLength(10);
    expect(resB.body.items).toHaveLength(6);
    const idsB = new Set(resB.body.items.map((u: { id: string }) => u.id));
    expect(resA.body.items.some((u: { id: string }) => idsB.has(u.id))).toBe(false);
  });

  it('a revoked membership loses access immediately', async () => {
    const acc = await createUser(t);
    const m = await t.db.houseMembership.create({ data: { house_id: a.houseId, user_id: acc.id, role: 'ACCOUNTANT', joined_via: 'CHAIRMAN_ADD' } });
    const s = await loginWeb(t, acc);
    await s.agent.get(`/v1/houses/${a.houseId}/units`).expect(200);
    await t.db.houseMembership.update({ where: { id: m.id }, data: { status: 'REVOKED', revoked_at: new Date() } });
    await s.agent.get(`/v1/houses/${a.houseId}/units`).expect(404);
  });
});

describe('row level security (database layer)', () => {
  it('app_rw without a scope sees no house data at all', async () => {
    const db = t.app.get(DbService);
    expect(await db.rw.unit.count()).toBe(0);
    expect(await db.rw.house.count()).toBe(0);
  });

  it('a query scoped to house A cannot read or modify rows of house B, even when it asks for them', async () => {
    const db = t.app.get(DbService);
    const { visible, updated } = await db.scoped({ houseId: a.houseId }, async (tx) => ({
      visible: await tx.unit.count({ where: { house_id: b.houseId } }),
      updated: (await tx.unit.updateMany({ where: { house_id: b.houseId }, data: { rooms: 99 } })).count,
    }));
    expect(visible).toBe(0);
    expect(updated).toBe(0);
    expect(await t.db.unit.count({ where: { house_id: b.houseId, rooms: 99 } })).toBe(0);
  });

  it('cannot insert a row into another house', async () => {
    const db = t.app.get(DbService);
    await expect(
      db.scoped({ houseId: a.houseId }, (tx) => tx.unit.create({ data: { house_id: b.houseId, number: 'X-1' } })),
    ).rejects.toThrow();
  });

  it('app_rw cannot read the audit log', async () => {
    const db = t.app.get(DbService);
    await expect(db.rw.auditLog.count()).rejects.toThrow(/permission denied/);
  });
});
