import { z } from 'zod';
import { HouseRole, UnitType } from './enums.js';

export const MyHouse = z.object({
  id: z.string(),
  display_name: z.string(),
  address: z.string(),
  role: HouseRole,
});
export type MyHouse = z.infer<typeof MyHouse>;

export const HouseDetails = z.object({
  id: z.string(),
  display_name: z.string(),
  address: z.string(),
  entrance_count: z.number().int(),
  unit_count: z.number().int(),
  floor_count: z.number().int().nullable(),
  is_voting_ready: z.boolean(),
  my_role: HouseRole,
});
export type HouseDetails = z.infer<typeof HouseDetails>;

export const Unit = z.object({
  id: z.string(),
  number: z.string(),
  type: UnitType,
  area: z.string().nullable(),
  entrance: z.number().int().nullable(),
  floor: z.number().int().nullable(),
  rooms: z.number().int().nullable(),
  is_excluded_from_voting: z.boolean(),
});
export type Unit = z.infer<typeof Unit>;
