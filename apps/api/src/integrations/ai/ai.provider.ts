import type { RequestCategory, RequestPlan, RequestTriage } from '@ortaq/shared'

/**
 * Языковая модель за интерфейсом (docs/11). Провайдер получает только обезличенный текст:
 * вызывать его напрямую нельзя, только через AiService, который делает redact().
 */
export const AI_PROVIDER = Symbol('AiProvider')

export type TriageInput = {
  /** Обезличенный текст заявки */
  text: string
  category: RequestCategory
  location: string
  /** Открытые заявки по той же локации: номер и обезличенный краткий текст */
  candidates: { number: number; text: string }[]
}

export type SuggestInput = { text: string; category: RequestCategory; location: string }

export interface AiProvider {
  readonly name: string
  readonly model: string
  triage(input: TriageInput): Promise<RequestTriage>
  suggest(input: SuggestInput): Promise<RequestPlan>
}
