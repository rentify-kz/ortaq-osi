import type { House as HouseRow, Organization as OrgRow, Unit as UnitRow } from '@prisma/client';
import type { House, Organization, Unit } from '@ortaq/shared';

export function toOrganization(o: OrgRow & { _count?: { houses: number } }): Organization {
  return {
    id: o.id,
    name: o.name,
    bin: o.bin,
    management_form: o.management_form,
    legal_address: o.legal_address,
    status: o.status,
    house_count: o._count?.houses ?? 0,
    created_at: o.created_at.toISOString(),
  };
}

export function toHouse(h: HouseRow & { organization: { name: string } }): House {
  return {
    id: h.id,
    organization_id: h.organization_id,
    organization_name: h.organization.name,
    address: h.address,
    display_name: h.display_name,
    entrance_count: h.entrance_count,
    unit_count: h.unit_count,
    floor_count: h.floor_count,
    built_year: h.built_year,
    total_area: h.total_area?.toFixed(2) ?? null,
    is_voting_ready: h.is_voting_ready,
    created_at: h.created_at.toISOString(),
  };
}

export function toUnit(u: UnitRow): Unit {
  return {
    id: u.id,
    number: u.number,
    type: u.type,
    area: u.area?.toFixed(2) ?? null,
    entrance: u.entrance,
    floor: u.floor,
    rooms: u.rooms,
    is_excluded_from_voting: u.is_excluded_from_voting,
  };
}
