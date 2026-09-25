import { z } from 'zod';
import { Bin, Email } from './validators.js';
import { ManagementForm, OrganizationStatus, UnitType } from './enums.js';

export const CreateOrganizationRequest = z.object({
  name: z.string().trim().min(2).max(300),
  bin: Bin,
  management_form: ManagementForm,
  legal_address: z.string().trim().min(5).max(500),
  bank_details: z.record(z.string()).optional(),
});
export type CreateOrganizationRequest = z.infer<typeof CreateOrganizationRequest>;

export const UpdateOrganizationRequest = CreateOrganizationRequest.partial().extend({
  status: OrganizationStatus.optional(),
});
export type UpdateOrganizationRequest = z.infer<typeof UpdateOrganizationRequest>;

export const Organization = z.object({
  id: z.string(),
  name: z.string(),
  bin: z.string(),
  management_form: ManagementForm,
  legal_address: z.string(),
  status: OrganizationStatus,
  house_count: z.number().int(),
  created_at: z.string(),
});
export type Organization = z.infer<typeof Organization>;

export const CreateHouseRequest = z.object({
  organization_id: z.string().uuid(),
  address: z.string().trim().min(5).max(500),
  display_name: z.string().trim().min(2).max(200),
  entrance_count: z.number().int().min(1).max(100),
  unit_count: z.number().int().min(1).max(5000),
  floor_count: z.number().int().min(1).max(200).optional(),
  built_year: z.number().int().min(1800).max(2100).optional(),
  cadastral_number: z.string().trim().max(50).optional(),
});
export type CreateHouseRequest = z.infer<typeof CreateHouseRequest>;

export const UpdateHouseRequest = CreateHouseRequest.omit({ entrance_count: true, unit_count: true }).partial();
export type UpdateHouseRequest = z.infer<typeof UpdateHouseRequest>;

export const EntranceLayout = z.object({
  entrance: z.number().int().min(1),
  from: z.number().int().min(1),
  to: z.number().int().min(1),
  floors: z.number().int().min(1).max(200).optional(),
});
export type EntranceLayout = z.infer<typeof EntranceLayout>;

export const GenerateUnitsRequest = z.object({
  strategy: z.literal('SEQUENTIAL'),
  entrances: z.array(EntranceLayout).min(1).max(100).optional(),
  unit_type: UnitType.default('APARTMENT'),
});
export type GenerateUnitsRequest = z.infer<typeof GenerateUnitsRequest>;

export const House = z.object({
  id: z.string(),
  organization_id: z.string(),
  organization_name: z.string(),
  address: z.string(),
  display_name: z.string(),
  entrance_count: z.number().int(),
  unit_count: z.number().int(),
  floor_count: z.number().int().nullable(),
  built_year: z.number().int().nullable(),
  total_area: z.string().nullable(),
  is_voting_ready: z.boolean(),
  created_at: z.string(),
});
export type House = z.infer<typeof House>;

export const HouseReadiness = z.object({
  units_generated: z.boolean(),
  areas_filled: z.number().int(),
  areas_total: z.number().int(),
  is_voting_ready: z.boolean(),
  registry_uploaded: z.boolean(),
  chairman_assigned: z.boolean(),
  chairman_activated: z.boolean(),
  residents_verified: z.number().int(),
  blocking_issues: z.array(z.string()),
});
export type HouseReadiness = z.infer<typeof HouseReadiness>;

export const AssignChairmanRequest = z.object({ email: Email, full_name: z.string().trim().min(2).max(200) });
export type AssignChairmanRequest = z.infer<typeof AssignChairmanRequest>;

export const AuditEntry = z.object({
  id: z.string(),
  seq: z.string(),
  house_id: z.string().nullable(),
  actor_id: z.string().nullable(),
  actor_role: z.string().nullable(),
  action: z.string(),
  entity_type: z.string(),
  entity_id: z.string().nullable(),
  created_at: z.string(),
});
export type AuditEntry = z.infer<typeof AuditEntry>;
