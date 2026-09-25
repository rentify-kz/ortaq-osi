import { z } from 'zod';

export const HouseRole = z.enum(['CHAIRMAN', 'ACCOUNTANT', 'WORKER', 'RESIDENT']);
export type HouseRole = z.infer<typeof HouseRole>;

export const ManagementForm = z.enum(['OSI', 'PT']);
export type ManagementForm = z.infer<typeof ManagementForm>;

export const OrganizationStatus = z.enum(['ACTIVE', 'SUSPENDED']);
export type OrganizationStatus = z.infer<typeof OrganizationStatus>;

export const UnitType = z.enum(['APARTMENT', 'COMMERCIAL', 'PARKING', 'STORAGE']);
export type UnitType = z.infer<typeof UnitType>;

export const UserStatus = z.enum(['PENDING', 'ACTIVE', 'BLOCKED']);
export type UserStatus = z.infer<typeof UserStatus>;

export const MembershipStatus = z.enum(['PENDING', 'ACTIVE', 'REVOKED']);
export type MembershipStatus = z.infer<typeof MembershipStatus>;

export const Locale = z.enum(['ru', 'kk']);
export type Locale = z.infer<typeof Locale>;
