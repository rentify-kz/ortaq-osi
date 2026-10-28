import type { Priority, RequestCategory, RequestPlan, RequestTriage } from '@ortaq/shared'
import type { Specialization } from '@ortaq/shared'
import type { AiProvider, SuggestInput, TriageInput } from './ai.provider'

/*
 * Заглушка модели для разработки и тестов: правила по ключевым словам вместо Gemini.
 * Контракт тот же, поэтому весь путь — обезличивание, журнал AiJob, подсказка председателю —
 * работает до подключения настоящей модели. Ключевые слова — по-русски и по-казахски.
 */

const CATEGORY_WORDS: [RequestCategory, RegExp][] = [
  ['ELEVATOR', /лифт/i],
  ['HEATING', /отоплен|батаре|радиатор|холодно в|жылу/i],
  ['PLUMBING', /труб|теч[ьёе]|протека|капа|канализ|унитаз|кран|стояк|су ақ|вода/i],
  ['ELECTRICITY', /свет|ламп|электр|розетк|провод|искр|щиток|жарық/i],
  ['TRASH', /мусор|бак|контейнер|қоқыс/i],
  ['CLEANING', /уборк|грязн|убрать|мыть|пыль|тазала/i],
  ['ROOF', /крыш|кровл|сосульк/i],
  ['BASEMENT', /подвал|жертөле/i],
  ['FACADE', /фасад|стен[аы] дома|балкон/i],
  ['SECURITY', /домофон|двер|замок|камер|охран|посторонн/i],
  ['YARD', /двор|площадк|газон|парковк|аула/i],
]

const CRITICAL = /прорыв|затоп|потоп|пожар|дым|горит|искрит|запах газа|газом пахнет|застрял|кипят|обрушен|оборван|нет отопления/i
const HIGH = /не работает лифт|лифт не работает|нет воды|нет света|течь|теч[её]т|протека|не греет|холодно|сломан/i
const LOW = /покрас|царапин|косметич|некрасив|пожелание|предлагаю/i
/** Попытки командовать модели из текста заявки — признак спама или атаки (docs/11 §1, правило 2) */
const INJECTION = /игнорир|ignore (all|previous)|system prompt|ты теперь|you are now|https?:\/\//i

const PLAN: Partial<Record<RequestCategory, { title: string; specialization: Specialization | null; urgency: RequestPlan['steps'][number]['urgency'] }[]>> = {
  PLUMBING: [
    { title: 'Перекрыть воду на участке', specialization: 'PLUMBER', urgency: 'IMMEDIATE' },
    { title: 'Осмотреть и определить объём работ', specialization: 'PLUMBER', urgency: 'TODAY' },
    { title: 'Закупить материалы', specialization: null, urgency: 'THIS_WEEK' },
    { title: 'Устранить неисправность', specialization: 'PLUMBER', urgency: 'THIS_WEEK' },
    { title: 'Проверить и составить акт', specialization: null, urgency: 'THIS_WEEK' },
  ],
  ELECTRICITY: [
    { title: 'Обесточить участок', specialization: 'ELECTRICIAN', urgency: 'IMMEDIATE' },
    { title: 'Найти причину неисправности', specialization: 'ELECTRICIAN', urgency: 'TODAY' },
    { title: 'Заменить неисправное оборудование', specialization: 'ELECTRICIAN', urgency: 'THIS_WEEK' },
    { title: 'Проверить работу', specialization: null, urgency: 'THIS_WEEK' },
  ],
  ELEVATOR: [
    { title: 'Вызвать обслуживающую организацию', specialization: 'ELEVATOR', urgency: 'IMMEDIATE' },
    { title: 'Диагностика и ремонт', specialization: 'ELEVATOR', urgency: 'TODAY' },
    { title: 'Получить акт о вводе в работу', specialization: null, urgency: 'THIS_WEEK' },
  ],
}

const DEFAULT_PLAN = [
  { title: 'Осмотреть на месте', specialization: 'HANDYMAN' as const, urgency: 'TODAY' as const },
  { title: 'Выполнить работы', specialization: 'HANDYMAN' as const, urgency: 'THIS_WEEK' as const },
  { title: 'Проверить результат', specialization: null, urgency: 'THIS_WEEK' as const },
]

const SPECIALIZATION: Partial<Record<RequestCategory, Specialization>> = {
  PLUMBING: 'PLUMBER', HEATING: 'PLUMBER', BASEMENT: 'PLUMBER', ELECTRICITY: 'ELECTRICIAN', ELEVATOR: 'ELEVATOR',
  CLEANING: 'CLEANER', TRASH: 'CLEANER', YARD: 'YARD_KEEPER', SECURITY: 'SECURITY',
}

/** Слова текста для сравнения: нижний регистр, без коротких служебных */
export function words(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/ё/g, 'е').split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 4).map((w) => w.slice(0, 6)))
}

export function similarity(a: string, b: string): number {
  const x = words(a)
  const y = words(b)
  if (x.size === 0 || y.size === 0) return 0
  let common = 0
  for (const w of x) if (y.has(w)) common++
  return common / Math.min(x.size, y.size)
}

export class RulesAiProvider implements AiProvider {
  readonly name = 'rules'
  readonly model = 'ortaq-rules-1'

  async triage(input: TriageInput): Promise<RequestTriage> {
    const text = input.text
    const letters = text.match(/\p{L}+/gu) ?? []
    const injection = INJECTION.test(text)
    const meaningful = letters.filter((w) => w.length >= 3).length >= 2 && !injection
    const detected = CATEGORY_WORDS.find(([, re]) => re.test(text))?.[0]
    const priority: Priority = CRITICAL.test(text) ? 'CRITICAL' : HIGH.test(text) ? 'HIGH' : LOW.test(text) ? 'LOW' : 'NORMAL'
    const best = input.candidates
      .map((c) => ({ c, score: similarity(text, c.text) }))
      .sort((a, b) => b.score - a.score)[0]
    const duplicate = best && best.score >= 0.5 ? best : null
    const vague = !detected && input.category === 'OTHER'

    return {
      is_meaningful: meaningful,
      category: detected ?? input.category,
      suggested_priority: priority,
      priority_reason: {
        CRITICAL: 'Риск аварии или ущерба имуществу — нужна реакция сразу',
        HIGH: 'Существенное неудобство для жильцов',
        NORMAL: 'Обычная бытовая неисправность',
        LOW: 'Косметический вопрос, можно запланировать',
      }[priority],
      duplicate_of: duplicate?.c.number ?? null,
      duplicate_confidence: duplicate ? Math.round(duplicate.score * 100) / 100 : 0,
      needs_clarification: meaningful && (vague || text.trim().length < 15),
      clarification_hint: vague ? 'Уточните, что именно сломалось и где' : text.trim().length < 15 ? 'Опишите проблему подробнее' : null,
      spam_likelihood: injection ? 0.9 : meaningful ? 0.05 : 0.6,
    }
  }

  async suggest(input: SuggestInput): Promise<RequestPlan> {
    const steps = PLAN[input.category] ?? DEFAULT_PLAN
    return {
      steps: steps.map((s, i) => ({ order: i + 1, ...s })),
      estimated_specialization: SPECIALIZATION[input.category] ?? 'HANDYMAN',
      safety_notes: input.category === 'ELECTRICITY' ? ['Работы только при снятом напряжении'] : input.category === 'PLUMBING' ? ['Проверить, не подтоплена ли электрощитовая'] : [],
      requires_contractor: input.category === 'ELEVATOR',
    }
  }
}
