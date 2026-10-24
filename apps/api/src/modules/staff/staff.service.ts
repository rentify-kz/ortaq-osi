import { Injectable } from '@nestjs/common'
import type { Contractor, StaffMember } from '@prisma/client'
import {
  contractorBody, ErrorCode, staffBody, updateContractorBody, updateStaffBody,
  type ContractorBody, type StaffBody, type UpdateContractorBody, type UpdateStaffBody,
} from '@ortaq/shared'
import { ctx } from '../../common/context'
import { notFound, unprocessable } from '../../common/errors'
import { PrismaService, type Tx } from '../../infra/prisma.service'
import { AuditService } from '../audit/audit.service'

/** Правление видит всё, остальные участники — только открытое жильцам (docs/06 §6.5) */
const isBoard = () => ctx().role === 'CHAIRMAN' || ctx().role === 'ACCOUNTANT'
const toDate = (v: string | null | undefined) => (v === undefined ? undefined : v === null ? null : new Date(`${v}T00:00:00Z`))

/**
 * Персонал и подрядчики дома. Требование прозрачности: жильцы знают, кто работает в доме.
 * Прозрачность касается работы, а не личных данных: жильцу уходят только публичные поля.
 */
@Injectable()
export class StaffService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
  ) {}

  listStaff() {
    return this.db.run(async (tx) => {
      const board = isBoard()
      const rows = await tx.staffMember.findMany({
        where: board ? {} : { visibleToResidents: true, isActive: true },
        orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
      })
      return rows.map((s) => (board ? staffView(s) : staffPublicView(s)))
    })
  }

  createStaff(input: StaffBody) {
    const b = staffBody.parse(input)
    return this.db.run(async (tx) => {
      const s = await tx.staffMember.create({
        data: {
          houseId: ctx().houseId ?? '', fullName: b.full_name, position: b.position, specializations: b.specializations,
          phonePublic: b.phone_public ?? null, workSchedule: b.work_schedule ?? null, visibleToResidents: b.visible_to_residents,
        },
      })
      await this.audit.append(tx, { action: 'staff.create', entityType: 'StaffMember', entityId: s.id, after: { full_name: s.fullName, position: s.position } })
      return staffView(s)
    })
  }

  updateStaff(id: string, input: UpdateStaffBody) {
    const b = updateStaffBody.parse(input)
    return this.db.run(async (tx) => {
      const before = await tx.staffMember.findFirst({ where: { id } })
      if (!before) throw notFound('Сотрудник')
      if (b.user_id) await this.assertWorker(tx, b.user_id)
      const s = await tx.staffMember.update({
        where: { id },
        data: {
          fullName: b.full_name, position: b.position, specializations: b.specializations, phonePublic: b.phone_public,
          workSchedule: b.work_schedule, visibleToResidents: b.visible_to_residents, isActive: b.is_active, userId: b.user_id,
        },
      })
      await this.audit.append(tx, { action: 'staff.update', entityType: 'StaffMember', entityId: id, before: staffView(before), after: b })
      return staffView(s)
    })
  }

  listContractors() {
    return this.db.run(async (tx) => {
      const board = isBoard()
      const rows = await tx.contractor.findMany({
        where: board ? {} : { visibleToResidents: true, isActive: true },
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      })
      return rows.map((c) => (board ? contractorView(c) : contractorPublicView(c)))
    })
  }

  createContractor(input: ContractorBody) {
    const b = contractorBody.parse(input)
    return this.db.run(async (tx) => {
      const c = await tx.contractor.create({
        data: {
          houseId: ctx().houseId ?? '', name: b.name, bin: b.bin ?? null, specializations: b.specializations,
          contactPerson: b.contact_person ?? null, phone: b.phone ?? null, email: b.email ?? null,
          contractFrom: toDate(b.contract_from) ?? null, contractTo: toDate(b.contract_to) ?? null, visibleToResidents: b.visible_to_residents,
        },
      })
      await this.audit.append(tx, { action: 'contractor.create', entityType: 'Contractor', entityId: c.id, after: { name: c.name, bin: c.bin } })
      return contractorView(c)
    })
  }

  updateContractor(id: string, input: UpdateContractorBody) {
    const b = updateContractorBody.parse(input)
    return this.db.run(async (tx) => {
      const before = await tx.contractor.findFirst({ where: { id } })
      if (!before) throw notFound('Подрядчик')
      const from = b.contract_from === undefined ? before.contractFrom : toDate(b.contract_from)
      const to = b.contract_to === undefined ? before.contractTo : toDate(b.contract_to)
      if (from && to && from > to) throw unprocessable(ErrorCode.VALIDATION, 'Договор заканчивается раньше, чем начинается')
      const c = await tx.contractor.update({
        where: { id },
        data: {
          name: b.name, bin: b.bin, specializations: b.specializations, contactPerson: b.contact_person, phone: b.phone, email: b.email,
          contractFrom: toDate(b.contract_from), contractTo: toDate(b.contract_to), visibleToResidents: b.visible_to_residents, isActive: b.is_active,
        },
      })
      await this.audit.append(tx, { action: 'contractor.update', entityType: 'Contractor', entityId: id, before: contractorView(before), after: b })
      return contractorView(c)
    })
  }

  /** Привязать к записи персонала можно только работника этого дома */
  private async assertWorker(tx: Tx, userId: string) {
    const m = await tx.houseMembership.findFirst({ where: { userId, status: 'ACTIVE', role: 'WORKER' } })
    if (!m) throw unprocessable(ErrorCode.VALIDATION, 'Привязать можно только работника этого дома, вступившего по приглашению')
  }
}

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

function staffPublicView(s: StaffMember) {
  return {
    id: s.id, full_name: s.fullName, position: s.position, specializations: s.specializations,
    phone_public: s.phonePublic, work_schedule: s.workSchedule,
  }
}

function staffView(s: StaffMember) {
  return { ...staffPublicView(s), user_id: s.userId, visible_to_residents: s.visibleToResidents, is_active: s.isActive, created_at: s.createdAt }
}

function contractorPublicView(c: Contractor) {
  return {
    id: c.id, name: c.name, bin: c.bin, specializations: c.specializations, contact_person: c.contactPerson,
    phone: c.phone, email: c.email, contract_from: day(c.contractFrom), contract_to: day(c.contractTo),
  }
}

function contractorView(c: Contractor) {
  return { ...contractorPublicView(c), visible_to_residents: c.visibleToResidents, is_active: c.isActive, created_at: c.createdAt }
}
