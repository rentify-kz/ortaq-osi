import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import {
  ErrorCode,
  type AssignChairmanBody, type CreateHouseBody, type CreateOrganizationBody, type GenerateUnitsBody,
  type UpdateHouseBody, type UpdateOrganizationBody,
} from '@ortaq/shared'
import { conflict, notFound, unprocessable } from '../../common/errors'
import { env } from '../../config/env'
import { CryptoService } from '../../infra/crypto.service'
import { MailerService } from '../../infra/mailer.service'
import { PrismaService, type Tx } from '../../infra/prisma.service'
import { AuditService } from '../audit/audit.service'
import { ReadinessService } from '../houses/readiness.service'
import { defaultLayout, generateUnits, UnitsLayoutError, type EntranceLayout } from './units.generator'

const SET_PASSWORD_TTL_MS = 72 * 3600 * 1000

/** Админ-панель (docs/04 §2–3). Все методы вызываются в контексте bypass из AdminGuard */
@Injectable()
export class AdminService {
  constructor(
    private readonly db: PrismaService,
    private readonly audit: AuditService,
    private readonly readiness: ReadinessService,
    private readonly crypto: CryptoService,
    private readonly mailer: MailerService,
  ) {}

  /* ───────── организации ───────── */

  listOrganizations() {
    return this.db.run(async (tx) => {
      const orgs = await tx.organization.findMany({ orderBy: { createdAt: 'desc' }, include: { _count: { select: { houses: true } } } })
      return orgs.map((o) => ({ ...organizationView(o), house_count: o._count.houses }))
    })
  }

  createOrganization(body: CreateOrganizationBody) {
    return this.db.run(async (tx) => {
      if (await tx.organization.findUnique({ where: { bin: body.bin } })) {
        throw conflict(ErrorCode.BIN_TAKEN, 'Организация с таким БИН уже заведена')
      }
      const org = await tx.organization.create({
        data: {
          name: body.name,
          bin: body.bin,
          managementForm: body.management_form,
          legalAddress: body.legal_address,
          bankDetails: body.bank_details,
        },
      })
      await this.audit.append(tx, { houseId: null, action: 'organization.create', entityType: 'Organization', entityId: org.id, after: org })
      return organizationView(org)
    })
  }

  updateOrganization(id: string, body: UpdateOrganizationBody) {
    return this.db.run(async (tx) => {
      const before = await tx.organization.findUnique({ where: { id } })
      if (!before) throw notFound('Организация')
      if (body.bin && body.bin !== before.bin && (await tx.organization.findUnique({ where: { bin: body.bin } }))) {
        throw conflict(ErrorCode.BIN_TAKEN, 'Организация с таким БИН уже заведена')
      }
      const after = await tx.organization.update({
        where: { id },
        data: {
          name: body.name,
          bin: body.bin,
          managementForm: body.management_form,
          legalAddress: body.legal_address,
          bankDetails: body.bank_details,
          status: body.status,
        },
      })
      await this.audit.append(tx, { houseId: null, action: 'organization.update', entityType: 'Organization', entityId: id, before, after })
      return organizationView(after)
    })
  }

  /* ───────── дома ───────── */

  listHouses() {
    return this.db.run(async (tx) => {
      const houses = await tx.house.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          organization: { select: { name: true } },
          _count: { select: { units: true } },
          memberships: { where: { role: 'CHAIRMAN', status: 'ACTIVE' }, include: { user: { select: { fullName: true, status: true } } } },
        },
      })
      return houses.map((h) => ({
        ...houseView(h),
        organization_name: h.organization.name,
        units_total: h._count.units,
        chairman: h.memberships[0] ? { full_name: h.memberships[0].user.fullName, activated: h.memberships[0].user.status === 'ACTIVE' } : null,
      }))
    })
  }

  /** Создание дома сразу генерирует помещения по разбивке по умолчанию, площади пустые */
  createHouse(body: CreateHouseBody) {
    return this.db.run(
      async (tx) => {
        const org = await tx.organization.findUnique({ where: { id: body.organization_id } })
        if (!org) throw notFound('Организация')
        if (org.status !== 'ACTIVE') throw unprocessable(ErrorCode.CONFLICT, 'Организация приостановлена')
        const house = await tx.house.create({
          data: {
            organizationId: org.id,
            address: body.address,
            displayName: body.display_name,
            entranceCount: body.entrance_count,
            unitCount: body.unit_count,
            floorCount: body.floor_count ?? null,
            builtYear: body.built_year ?? null,
          },
        })
        const units = generateUnits(defaultLayout(house))
        await tx.unit.createMany({ data: units.map((u) => ({ ...u, houseId: house.id })) })
        await this.audit.append(tx, { houseId: house.id, action: 'house.create', entityType: 'House', entityId: house.id, after: { ...house, units: units.length } })
        return houseView(house)
      },
      { timeout: 30_000 },
    )
  }

  updateHouse(id: string, body: UpdateHouseBody) {
    return this.db.run(async (tx) => {
      const before = await tx.house.findUnique({ where: { id } })
      if (!before) throw notFound('Дом')
      if (body.organization_id && !(await tx.organization.findUnique({ where: { id: body.organization_id } }))) throw notFound('Организация')
      const after = await tx.house.update({
        where: { id },
        data: {
          organizationId: body.organization_id,
          address: body.address,
          displayName: body.display_name,
          floorCount: body.floor_count,
          builtYear: body.built_year,
        },
      })
      await this.audit.append(tx, { houseId: id, action: 'house.update', entityType: 'House', entityId: id, before, after })
      return houseView(after)
    })
  }

  getHouse(id: string) {
    return this.db.run(async (tx) => {
      const house = await tx.house.findUnique({
        where: { id },
        include: {
          organization: true,
          memberships: { where: { role: 'CHAIRMAN', status: 'ACTIVE' }, include: { user: true } },
        },
      })
      if (!house) throw notFound('Дом')
      const chairman = house.memberships[0]
      return {
        ...houseView(house),
        organization: organizationView(house.organization),
        chairman: chairman
          ? {
              user_id: chairman.userId,
              full_name: chairman.user.fullName,
              email: chairman.user.email,
              activated: chairman.user.status === 'ACTIVE' && chairman.user.totpEnabledAt !== null,
              assigned_at: chairman.createdAt,
            }
          : null,
        layout: await this.layout(tx, id),
        readiness: await this.readiness.compute(tx, id),
      }
    })
  }

  listUnits(houseId: string) {
    return this.db.run(async (tx) => {
      if (!(await tx.house.findUnique({ where: { id: houseId }, select: { id: true } }))) throw notFound('Дом')
      const units = await tx.unit.findMany({ where: { houseId } })
      return units.sort(byUnitNumber).map(unitView)
    })
  }

  /**
   * Перегенерация по ручной разбивке. Запрещена, когда к помещениям уже привязаны люди:
   * пересоздание разорвало бы связи собственности, а позже — бюллетеней и платежей
   */
  regenerateUnits(houseId: string, body: GenerateUnitsBody) {
    return this.db.run(
      async (tx) => {
        const house = await tx.house.findUnique({ where: { id: houseId } })
        if (!house) throw notFound('Дом')
        const linked = await tx.unitOwnership.count({ where: { houseId } })
        if (linked > 0) {
          throw conflict(ErrorCode.UNITS_LOCKED, 'К помещениям уже привязаны жильцы, перегенерация разорвала бы связи', { linked })
        }
        let units
        try {
          units = generateUnits(body.entrances)
        } catch (e) {
          if (e instanceof UnitsLayoutError) throw unprocessable(ErrorCode.UNITS_RANGE_INVALID, e.message)
          throw e
        }
        const before = { units: await tx.unit.count({ where: { houseId } }), entrances: house.entranceCount }
        await tx.unit.deleteMany({ where: { houseId } })
        await tx.unit.createMany({ data: units.map((u) => ({ ...u, houseId })) })
        await tx.house.update({ where: { id: houseId }, data: { unitCount: units.length, entranceCount: body.entrances.length } })
        await this.audit.append(tx, {
          houseId, action: 'house.units_regenerate', entityType: 'House', entityId: houseId,
          before, after: { units: units.length, entrances: body.entrances },
        })
        return { units_total: units.length, layout: await this.layout(tx, houseId) }
      },
      { timeout: 30_000 },
    )
  }

  /* ───────── председатель ───────── */

  /**
   * Учётка председателя по почте (docs/04 §3). Письмо со ссылкой на установку пароля,
   * дальше обязательная 2FA. Второго действующего председателя быть не может.
   */
  async assignChairman(houseId: string, body: AssignChairmanBody) {
    const token = this.crypto.token(32)
    const result = await this.db.run(async (tx) => {
      const house = await tx.house.findUnique({ where: { id: houseId } })
      if (!house) throw notFound('Дом')
      const existing = await tx.houseMembership.findFirst({ where: { houseId, role: 'CHAIRMAN', status: 'ACTIVE' } })
      if (existing) throw conflict(ErrorCode.CHAIRMAN_EXISTS, 'У дома уже есть председатель. Сначала отзовите его доступ')

      let user = await tx.user.findUnique({ where: { email: body.email } })
      user ??= await tx.user.create({ data: { email: body.email, fullName: body.full_name, status: 'PENDING' } })

      // Если человек уже живёт в этом доме, его членство становится председательским
      const current = await tx.houseMembership.findFirst({ where: { houseId, userId: user.id, status: { not: 'REVOKED' } } })
      if (current) await tx.houseMembership.update({ where: { id: current.id }, data: { status: 'REVOKED', revokedAt: new Date() } })
      const membership = await tx.houseMembership.create({
        data: { houseId, userId: user.id, role: 'CHAIRMAN', status: 'ACTIVE', joinedVia: 'ADMIN_PROVISION' },
      })

      const needsPassword = !user.passwordHash
      if (needsPassword) {
        await tx.authToken.create({
          data: { userId: user.id, tokenHash: this.crypto.sha256(token), purpose: 'SET_PASSWORD', expiresAt: new Date(Date.now() + SET_PASSWORD_TTL_MS) },
        })
      }
      await this.audit.append(tx, {
        houseId, action: 'house.chairman_assign', entityType: 'HouseMembership', entityId: membership.id,
        after: { user_id: user.id, full_name: user.fullName, previous_role: current?.role ?? null },
      })
      return { user, house, needsPassword }
    })

    const web = env().WEB_ORIGIN
    await this.mailer.send({
      to: body.email,
      subject: `Доступ председателя: ${result.house.displayName}`,
      text: result.needsPassword
        ? `Здравствуйте, ${result.user.fullName}.\n\nВас назначили председателем ОСИ в Ortaq: ${result.house.displayName}.\n` +
          `Задайте пароль по ссылке, она действует 72 часа:\n${web}/set-password#token=${token}\n\n` +
          'После пароля понадобится подключить приложение-аутентификатор: без второго фактора доступ к финансам дома не открывается.'
        : `Здравствуйте, ${result.user.fullName}.\n\nВас назначили председателем ОСИ в Ortaq: ${result.house.displayName}.\n` +
          `Войдите как обычно: ${web}/login`,
    })
    return { user_id: result.user.id, invitation_sent: true }
  }

  /** Переизбрание: доступ старого председателя отзывается только через админа, docs/04 §10 */
  revokeChairman(houseId: string) {
    return this.db.run(async (tx) => {
      const m = await tx.houseMembership.findFirst({ where: { houseId, role: 'CHAIRMAN', status: 'ACTIVE' } })
      if (!m) throw notFound('Председатель')
      await tx.houseMembership.update({ where: { id: m.id }, data: { status: 'REVOKED', revokedAt: new Date() } })
      await this.audit.append(tx, { houseId, action: 'house.chairman_revoke', entityType: 'HouseMembership', entityId: m.id, before: { user_id: m.userId } })
      return { revoked: true }
    })
  }

  /* ───────── журнал ───────── */

  listAudit(params: { houseId?: string; cursor?: string; limit: number }) {
    return this.db.run(async (tx) => {
      const where: Prisma.AuditLogWhereInput = {}
      if (params.houseId === 'global') where.houseId = null
      else if (params.houseId) where.houseId = params.houseId
      if (params.cursor) where.seq = { lt: BigInt(params.cursor) }
      const rows = await tx.auditLog.findMany({ where, orderBy: { seq: 'desc' }, take: params.limit + 1 })
      const page = rows.slice(0, params.limit)
      const actorIds = [...new Set(page.map((r) => r.actorId).filter((id): id is string => id !== null))]
      const actors = await tx.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, fullName: true } })
      const names = new Map(actors.map((a) => [a.id, a.fullName]))
      return {
        items: page.map((r) => ({
          id: r.id,
          house_id: r.houseId,
          actor_name: r.actorId ? (names.get(r.actorId) ?? null) : null,
          actor_role: r.actorRole,
          action: r.action,
          entity_type: r.entityType,
          entity_id: r.entityId,
          ip: r.ip,
          created_at: r.createdAt,
        })),
        next_cursor: rows.length > params.limit ? page[page.length - 1]!.seq.toString() : null,
      }
    })
  }

  verifyAudit(houseId: string | null) {
    return this.db.run((tx) => this.audit.verify(tx, houseId), { timeout: 60_000 })
  }

  /** Фактическая разбивка по подъездам из помещений: что показать в форме перегенерации */
  private async layout(tx: Tx, houseId: string): Promise<EntranceLayout[]> {
    const units = await tx.unit.findMany({ where: { houseId }, select: { number: true, entrance: true, floor: true } })
    const byEntrance = new Map<number, { nums: number[]; floors: number }>()
    for (const u of units) {
      const n = Number.parseInt(u.number, 10)
      const e = u.entrance ?? 0
      const entry = byEntrance.get(e) ?? { nums: [], floors: 1 }
      if (Number.isFinite(n)) entry.nums.push(n)
      entry.floors = Math.max(entry.floors, u.floor ?? 1)
      byEntrance.set(e, entry)
    }
    return [...byEntrance.entries()]
      .sort(([a], [b]) => a - b)
      .filter(([, v]) => v.nums.length > 0)
      .map(([entrance, v]) => ({ entrance, from: Math.min(...v.nums), to: Math.max(...v.nums), floors: v.floors }))
  }
}

/* ───────── представления ───────── */

type OrganizationRow = { id: string; name: string; bin: string; managementForm: string; legalAddress: string; bankDetails: unknown; status: string; createdAt: Date }
type HouseRow = {
  id: string; organizationId: string; address: string; displayName: string; entranceCount: number; unitCount: number
  floorCount: number | null; builtYear: number | null; totalArea: { toString(): string }; isVotingReady: boolean; createdAt: Date
}
type UnitRow = { id: string; number: string; type: string; area: { toString(): string } | null; entrance: number | null; floor: number | null; isExcludedFromVoting: boolean }

export function organizationView(o: OrganizationRow) {
  return {
    id: o.id, name: o.name, bin: o.bin, management_form: o.managementForm, legal_address: o.legalAddress,
    bank_details: o.bankDetails, status: o.status, created_at: o.createdAt,
  }
}

export function houseView(h: HouseRow) {
  return {
    id: h.id, organization_id: h.organizationId, address: h.address, display_name: h.displayName,
    entrance_count: h.entranceCount, unit_count: h.unitCount, floor_count: h.floorCount, built_year: h.builtYear,
    total_area: h.totalArea.toString(), is_voting_ready: h.isVotingReady, created_at: h.createdAt,
  }
}

export function unitView(u: UnitRow) {
  return {
    id: u.id, number: u.number, type: u.type, area: u.area?.toString() ?? null,
    entrance: u.entrance, floor: u.floor, is_excluded_from_voting: u.isExcludedFromVoting,
  }
}

/** «2» раньше «10», «12А» сразу после «12» */
export function byUnitNumber(a: { number: string }, b: { number: string }): number {
  return a.number.localeCompare(b.number, 'ru', { numeric: true })
}
