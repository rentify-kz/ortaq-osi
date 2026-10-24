import { Injectable } from '@nestjs/common'
import type { RegistryImport } from '@prisma/client'
import { applyRegistryBody, ErrorCode, type ApplyRegistryBody, type RegistryIssue, type RegistryPreview } from '@ortaq/shared'
import { ctx } from '../../common/context'
import { conflict, notFound, unprocessable } from '../../common/errors'
import { CryptoService } from '../../infra/crypto.service'
import { PrismaService, type Tx } from '../../infra/prisma.service'
import { AuditService } from '../audit/audit.service'
import { RegistryMatcher } from '../verification/registry-matcher'
import { parseRegistry, type RegistryRow } from './registry-parser'
import { readTable } from './table-reader'

const SAMPLE_ROWS = 5

type Stats = { rows_total: number; units_covered: number; units_missing: number; area_conflicts: number }

/**
 * Реестр собственников (docs/04 §4.2): эталон для автоматической верификации жильцов
 * и источник площадей. Загрузка в два шага — превью с ошибками, затем применение.
 * ИИН хешируется при разборе файла: в базе нет ни самого номера, ни исходного файла.
 */
@Injectable()
export class RegistryService {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly matcher: RegistryMatcher,
  ) {}

  async upload(file: { originalname: string; buffer: Buffer }): Promise<RegistryPreview> {
    const fileName = file.originalname.replace(/[^\p{L}\p{N} ._()-]/gu, '_').slice(0, 200)
    const table = await readTable(file.buffer, fileName)
    return this.db.run(async (tx) => {
      const units = (await tx.unit.findMany({ select: { number: true, area: true } })).map((u) => ({ number: u.number, area: u.area?.toString() ?? null }))
      const parsed = parseRegistry(table, units, (iin) => Buffer.from(this.crypto.hashIin(iin)).toString('hex'))
      const stats: Stats = {
        rows_total: parsed.rowsTotal, units_covered: parsed.unitsCovered,
        units_missing: parsed.unitsMissing, area_conflicts: parsed.areaConflicts,
      }
      const imp = await tx.registryImport.create({
        data: { houseId: ctx().houseId ?? '', fileName, rows: parsed.rows, issues: { list: parsed.issues, stats }, createdBy: ctx().userId ?? '' },
      })
      await this.audit.append(tx, {
        action: 'registry.upload', entityType: 'RegistryImport', entityId: imp.id,
        after: { file_name: fileName, rows_total: parsed.rowsTotal, rows_valid: parsed.rows.length },
      })
      return view(imp)
    })
  }

  async preview(importId: string): Promise<RegistryPreview> {
    return view(await this.db.run((tx) => this.find(tx, importId)))
  }

  /** Новый реестр заменяет прежний целиком: это снимок, а не журнал изменений */
  apply(importId: string, input: ApplyRegistryBody) {
    const { areas } = applyRegistryBody.parse(input)
    const houseId = ctx().houseId ?? ''
    return this.db.run(
      async (tx) => {
        const imp = await this.find(tx, importId)
        if (imp.status !== 'PREVIEW') throw conflict(ErrorCode.CONFLICT, 'Этот файл уже применён или отменён')
        const rows = imp.rows as RegistryRow[]
        if (rows.length === 0) throw unprocessable(ErrorCode.REGISTRY_INVALID, 'В файле нет ни одной строки без ошибок')

        await tx.ownerRegistryEntry.deleteMany({ where: { houseId } })
        await tx.ownerRegistryEntry.createMany({
          data: rows.map((r) => ({
            houseId, unitNumber: r.unit_number, iinHash: Buffer.from(r.iin_hash, 'hex'), fullName: r.full_name, area: r.area, importId: imp.id,
          })),
        })
        const areasUpdated = areas === 'skip' ? 0 : await this.applyAreas(tx, rows, areas === 'overwrite')

        const now = new Date()
        await tx.house.update({ where: { id: houseId }, data: { registryUploadedAt: now } })
        await tx.registryImport.updateMany({ where: { status: 'PREVIEW', id: { not: imp.id } }, data: { status: 'DISCARDED' } })
        await tx.registryImport.update({ where: { id: imp.id }, data: { status: 'APPLIED', appliedAt: now } })

        const verifiedNow = await this.rematch(tx, houseId)
        await this.audit.append(tx, {
          action: 'registry.apply', entityType: 'RegistryImport', entityId: imp.id,
          after: { entries: rows.length, areas_mode: areas, areas_updated: areasUpdated, verified_now: verifiedNow },
        })
        return { applied: true, entries: rows.length, areas_updated: areasUpdated, verified_now: verifiedNow }
      },
      { timeout: 60_000 },
    )
  }

  discard(importId: string) {
    return this.db.run(async (tx) => {
      const imp = await this.find(tx, importId)
      if (imp.status !== 'PREVIEW') throw conflict(ErrorCode.CONFLICT, 'Этот файл уже применён или отменён')
      await tx.registryImport.update({ where: { id: imp.id }, data: { status: 'DISCARDED' } })
      return { discarded: true }
    })
  }

  summary() {
    const houseId = ctx().houseId ?? ''
    return this.db.run(async (tx) => {
      const house = await tx.house.findUniqueOrThrow({ where: { id: houseId }, select: { registryUploadedAt: true, unitCount: true } })
      const entries = await tx.ownerRegistryEntry.findMany({ select: { unitNumber: true } })
      const last = await tx.registryImport.findFirst({ orderBy: { createdAt: 'desc' } })
      return {
        uploaded_at: house.registryUploadedAt,
        entries: entries.length,
        units_covered: new Set(entries.map((e) => e.unitNumber)).size,
        units_total: house.unitCount,
        last_import: last ? view(last) : null,
      }
    })
  }

  /** Площадь помещения — первая валидная площадь из его строк. Совладельцы с разными площадями уже показаны в превью */
  private async applyAreas(tx: Tx, rows: RegistryRow[], overwrite: boolean): Promise<number> {
    const byUnit = new Map<string, string>()
    for (const r of rows) if (r.area && !byUnit.has(r.unit_number)) byUnit.set(r.unit_number, r.area)
    const units = await tx.unit.findMany({ where: { number: { in: [...byUnit.keys()] } }, select: { id: true, number: true, area: true } })
    let updated = 0
    for (const u of units) {
      const area = byUnit.get(u.number)!
      const differs = u.area === null || Number(u.area) !== Number(area)
      if (!differs || (u.area !== null && !overwrite)) continue
      await tx.unit.update({ where: { id: u.id }, data: { area } })
      updated++
    }
    return updated
  }

  /** Жильцы, подтвердившие личность до загрузки реестра, сверяются с новым реестром сразу */
  private async rematch(tx: Tx, houseId: string): Promise<number> {
    const members = await tx.houseMembership.findMany({
      where: { status: 'ACTIVE', role: 'RESIDENT', user: { iinHash: { not: null } } },
      select: { user: { select: { id: true, iinHash: true, fullName: true } } },
    })
    const before = await tx.unitOwnership.count({ where: { verificationStatus: 'VERIFIED' } })
    for (const { user } of members) {
      await this.matcher.matchHouse(tx, houseId, user.id, new Uint8Array(user.iinHash!), user.fullName)
    }
    return (await tx.unitOwnership.count({ where: { verificationStatus: 'VERIFIED' } })) - before
  }

  private async find(tx: Tx, importId: string): Promise<RegistryImport> {
    const imp = await tx.registryImport.findFirst({ where: { id: importId } })
    if (!imp) throw notFound('Загрузка реестра')
    return imp
  }
}

function view(imp: RegistryImport): RegistryPreview {
  const rows = imp.rows as RegistryRow[]
  const { list, stats } = imp.issues as { list: RegistryIssue[]; stats: Stats }
  return {
    import_id: imp.id,
    file_name: imp.fileName,
    status: imp.status,
    rows_total: stats.rows_total,
    rows_valid: rows.length,
    units_covered: stats.units_covered,
    units_missing: stats.units_missing,
    area_conflicts: stats.area_conflicts,
    issues: list,
    sample: rows.slice(0, SAMPLE_ROWS).map((r) => ({ row: r.row, unit_number: r.unit_number, full_name: r.full_name, area: r.area })),
  }
}
