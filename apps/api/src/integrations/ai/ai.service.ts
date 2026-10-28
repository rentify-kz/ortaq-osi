import { Inject, Injectable, Logger } from '@nestjs/common'
import type { RequestCategory, RequestPlan, RequestTriage } from '@ortaq/shared'
import { asSystem } from '../../common/context'
import { PrismaService } from '../../infra/prisma.service'
import { AI_PROVIDER, type AiProvider } from './ai.provider'
import { redact, restore } from './redactor'

const TIMEOUT_MS = 8000
const CANDIDATE_CHARS = 200

type RequestText = { id: string; houseId: string; text: string; category: RequestCategory; location: string }

/**
 * Единственная дверь к модели. Правило 1 (docs/11): ИИ готовит, человек решает —
 * результат всегда подсказка. Правило 2: вывод модели — данные, не команда.
 * Каждый вызов пишется в ai_jobs: без этого нельзя понять, полезен ли ИИ.
 */
@Injectable()
export class AiService {
  private readonly log = new Logger('Ai')

  constructor(
    private readonly db: PrismaService,
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
  ) {}

  /** null — модель недоступна: заявка уходит председателю с пометкой «без автопроверки» */
  async triage(req: RequestText, candidates: { number: number; text: string }[], names: string[]): Promise<{ jobId: string; triage: RequestTriage } | null> {
    const own = redact(req.text, names)
    const input = {
      text: own.text,
      category: req.category,
      location: req.location,
      candidates: candidates.map((c) => ({ number: c.number, text: redact(c.text, names).text.slice(0, CANDIDATE_CHARS) })),
    }
    const res = await this.call('REQUEST_TRIAGE', req, async () => {
      const t = await this.provider.triage(input)
      return {
        ...t,
        priority_reason: restore(t.priority_reason, own.map),
        clarification_hint: t.clarification_hint && restore(t.clarification_hint, own.map),
        // Номер дубликата принимаем только из списка кандидатов: модель не выдумывает ссылки
        duplicate_of: candidates.some((c) => c.number === t.duplicate_of) ? t.duplicate_of : null,
      }
    })
    return res && { jobId: res.jobId, triage: res.value }
  }

  async suggest(req: RequestText, names: string[]): Promise<{ jobId: string; plan: RequestPlan } | null> {
    const own = redact(req.text, names)
    const res = await this.call('REQUEST_SUGGEST', req, async () => {
      const p = await this.provider.suggest({ text: own.text, category: req.category, location: req.location })
      return { ...p, steps: p.steps.slice(0, 15).map((s) => ({ ...s, title: restore(s.title, own.map).slice(0, 120) })) }
    })
    return res && { jobId: res.jobId, plan: res.value }
  }

  /** Что председатель сделал с подсказкой: принял, поправил, отклонил */
  async decide(jobId: string | undefined, decision: 'ACCEPTED' | 'MODIFIED' | 'REJECTED') {
    if (!jobId) return
    // Позднейшая правка человека информативнее раннего согласия: «принял, потом исправил» — это MODIFIED
    const where = decision === 'ACCEPTED' ? { id: jobId, humanDecision: null } : { id: jobId }
    await asSystem(() => this.db.run((tx) => tx.aiJob.updateMany({ where, data: { humanDecision: decision } })))
  }

  private async call<T>(type: 'REQUEST_TRIAGE' | 'REQUEST_SUGGEST', req: RequestText, fn: () => Promise<T>): Promise<{ jobId: string; value: T } | null> {
    const started = Date.now()
    let output: T | null = null
    let error: string | null = null
    try {
      output = await Promise.race([fn(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS))])
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
      this.log.warn(`${type} не выполнен: ${error}`)
    }
    const job = await asSystem(() =>
      this.db.run((tx) =>
        tx.aiJob.create({
          data: {
            houseId: req.houseId, type, provider: this.provider.name, model: this.provider.model,
            // Ссылка на сущность, а не текст: в журнале вызовов нет содержимого заявок
            inputRef: { request_id: req.id }, output: (output ?? undefined) as object | undefined,
            status: output ? 'DONE' : 'FAILED', latencyMs: Date.now() - started, error,
          },
        }),
      ),
    )
    return output ? { jobId: job.id, value: output } : null
  }
}
