import { Injectable } from '@nestjs/common'
import type { BudgetCategory } from '@prisma/client'
import type { BudgetCategoryView } from '@ortaq/shared'
import { PrismaService } from '../../infra/prisma.service'

/**
 * План счетов (docs/10 §1). Справочник глобальный и меняется только миграцией —
 * при новой редакции приказа, — поэтому читается из базы один раз за жизнь процесса.
 */
@Injectable()
export class CategoriesService {
  private cache: Promise<Map<string, BudgetCategory>> | null = null

  constructor(private readonly db: PrismaService) {}

  all(): Promise<Map<string, BudgetCategory>> {
    this.cache ??= this.db.client.budgetCategory
      .findMany({ orderBy: [{ section: 'asc' }, { code: 'asc' }] })
      .then((rows) => new Map(rows.map((r) => [r.code, r])))
      .catch((e: unknown) => {
        this.cache = null
        throw e
      })
    return this.cache
  }

  async get(code: string): Promise<BudgetCategory | undefined> {
    return (await this.all()).get(code)
  }

  /** Коды по порядку формы: 7.2.1.10 после 7.2.1.9, а не после 7.2.1.1 */
  async list(): Promise<BudgetCategoryView[]> {
    const rows = [...(await this.all()).values()].sort((a, b) => compareCodes(a.code, b.code))
    return rows.map(view)
  }
}

export function compareCodes(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? -1) - (pb[i] ?? -1)
    if (d !== 0) return d
  }
  return 0
}

function view(c: BudgetCategory): BudgetCategoryView {
  return {
    code: c.code, parent_code: c.parentCode, section: c.section, name: c.nameRu, short_name: c.shortName, is_leaf: c.isLeaf, in_form: c.inForm,
    allowed_accounts: c.allowedAccounts, requires_contractor: c.requiresContractor, requires_assembly_decision: c.requiresAssemblyDecision,
    required_documents: c.requiredDocuments,
  }
}
