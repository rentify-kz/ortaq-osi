import type { EntranceLayout } from '@ortaq/shared';

export interface PlannedUnit {
  number: string;
  entrance: number;
  floor: number | null;
}

export type LayoutResult = { ok: true; units: PlannedUnit[] } | { ok: false; reason: string };

/**
 * Раскладка помещений по подъездам (docs/spec/04-flows-admin-onboarding.md §2.3).
 * Без явной раскладки — сквозная нумерация с равномерным распределением; остаток уходит в первые подъезды.
 * Результат — заготовка: председатель потом правит номера и площади.
 */
export function planUnits(
  house: { entrance_count: number; unit_count: number; floor_count?: number | null },
  layout?: EntranceLayout[],
): LayoutResult {
  const entrances = layout ?? evenLayout(house.entrance_count, house.unit_count, house.floor_count ?? undefined);
  const problem = validate(entrances);
  if (problem) return { ok: false, reason: problem };

  const units: PlannedUnit[] = [];
  for (const e of [...entrances].sort((a, b) => a.from - b.from)) {
    const count = e.to - e.from + 1;
    const floors = e.floors ?? house.floor_count ?? null;
    const perFloor = floors ? Math.ceil(count / floors) : null;
    for (let i = 0; i < count; i++) {
      units.push({
        number: String(e.from + i),
        entrance: e.entrance,
        floor: floors && perFloor ? Math.min(floors, Math.floor(i / perFloor) + 1) : null,
      });
    }
  }
  return { ok: true, units };
}

function evenLayout(entranceCount: number, unitCount: number, floors?: number): EntranceLayout[] {
  const base = Math.floor(unitCount / entranceCount);
  const extra = unitCount % entranceCount;
  const out: EntranceLayout[] = [];
  let next = 1;
  for (let e = 1; e <= entranceCount; e++) {
    const count = base + (e <= extra ? 1 : 0);
    if (count === 0) continue;
    out.push({ entrance: e, from: next, to: next + count - 1, floors });
    next += count;
  }
  return out;
}

function validate(entrances: EntranceLayout[]): string | null {
  if (entrances.length === 0) return 'Нет ни одного подъезда';
  const seen = new Set<number>();
  for (const e of entrances) {
    if (seen.has(e.entrance)) return `Подъезд ${e.entrance} указан дважды`;
    seen.add(e.entrance);
    if (e.from > e.to) return `Подъезд ${e.entrance}: начало диапазона больше конца`;
  }
  const sorted = [...entrances].sort((a, b) => a.from - b.from);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.from <= sorted[i - 1]!.to) {
      return `Диапазоны подъездов ${sorted[i - 1]!.entrance} и ${sorted[i]!.entrance} пересекаются`;
    }
  }
  const total = sorted.reduce((n, e) => n + (e.to - e.from + 1), 0);
  if (total > 5000) return 'Больше 5000 помещений';
  return null;
}
