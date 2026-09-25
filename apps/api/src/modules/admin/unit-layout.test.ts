import { describe, expect, it } from 'vitest';
import { planUnits } from './unit-layout.js';

describe('planUnits', () => {
  it('distributes evenly with remainder going to the first entrances', () => {
    const r = planUnits({ entrance_count: 3, unit_count: 10 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const perEntrance = [1, 2, 3].map((e) => r.units.filter((u) => u.entrance === e).length);
    expect(perEntrance).toEqual([4, 3, 3]);
    expect(r.units.map((u) => u.number)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  });

  it('assigns floors when floor count is known', () => {
    const r = planUnits({ entrance_count: 1, unit_count: 36, floor_count: 9 });
    if (!r.ok) throw new Error(r.reason);
    expect(r.units[0]!.floor).toBe(1);
    expect(r.units[3]!.floor).toBe(1);
    expect(r.units[4]!.floor).toBe(2);
    expect(r.units[35]!.floor).toBe(9);
  });

  it('never assigns a floor above the top floor', () => {
    const r = planUnits({ entrance_count: 1, unit_count: 10, floor_count: 3 });
    if (!r.ok) throw new Error(r.reason);
    expect(Math.max(...r.units.map((u) => u.floor ?? 0))).toBe(3);
  });

  it('follows an explicit layout', () => {
    const r = planUnits({ entrance_count: 2, unit_count: 0 }, [
      { entrance: 1, from: 1, to: 3 },
      { entrance: 2, from: 101, to: 102 },
    ]);
    if (!r.ok) throw new Error(r.reason);
    expect(r.units.map((u) => `${u.entrance}:${u.number}`)).toEqual(['1:1', '1:2', '1:3', '2:101', '2:102']);
  });

  it('rejects overlapping ranges and duplicate entrances', () => {
    expect(
      planUnits({ entrance_count: 2, unit_count: 0 }, [
        { entrance: 1, from: 1, to: 10 },
        { entrance: 2, from: 10, to: 20 },
      ]).ok,
    ).toBe(false);
    expect(
      planUnits({ entrance_count: 2, unit_count: 0 }, [
        { entrance: 1, from: 1, to: 2 },
        { entrance: 1, from: 3, to: 4 },
      ]).ok,
    ).toBe(false);
  });
});
