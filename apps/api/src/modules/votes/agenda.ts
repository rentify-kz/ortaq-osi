import type { Prisma } from '@prisma/client'
import type { VoteQuestionInput } from '@ortaq/shared'
import type { Tx } from '../../infra/prisma.service'

const ABSTAIN = 'Воздержался'

/** Варианты ответа: у «за / против» они фиксированные, к вопросам с выбором система сама добавляет «Воздержался» */
export function optionsFor(q: VoteQuestionInput): { text: string; kind: 'FOR' | 'AGAINST' | 'ABSTAIN' | 'CHOICE' }[] {
  if (q.type === 'YES_NO') return [{ text: 'За', kind: 'FOR' }, { text: 'Против', kind: 'AGAINST' }, { text: ABSTAIN, kind: 'ABSTAIN' }]
  return [...(q.options ?? []).map((text) => ({ text, kind: 'CHOICE' as const })), { text: ABSTAIN, kind: 'ABSTAIN' }]
}

/** Повестка заново: вопросы черновика заменяются целиком, триггер не даст сделать это после уведомления */
export async function writeAgenda(tx: Tx, voteId: string, questions: VoteQuestionInput[], replace: boolean): Promise<void> {
  if (replace) {
    const old = await tx.voteQuestion.findMany({ where: { voteId }, select: { id: true } })
    await tx.voteOption.deleteMany({ where: { questionId: { in: old.map((q) => q.id) } } })
    await tx.voteQuestion.deleteMany({ where: { voteId } })
  }
  for (const [i, q] of questions.entries()) {
    const created = await tx.voteQuestion.create({ data: { voteId, order: i + 1, text: q.text.trim(), type: q.type } as Prisma.VoteQuestionUncheckedCreateInput })
    await tx.voteOption.createMany({
      data: optionsFor(q).map((o, j) => ({ questionId: created.id, order: j + 1, text: o.text.trim(), kind: o.kind }) as Prisma.VoteOptionCreateManyInput),
    })
  }
}

export type AgendaQuestion = Prisma.VoteQuestionGetPayload<{ include: { options: true } }>

export async function loadAgenda(tx: Tx, voteId: string): Promise<AgendaQuestion[]> {
  return tx.voteQuestion.findMany({ where: { voteId }, include: { options: { orderBy: { order: 'asc' } } }, orderBy: { order: 'asc' } })
}

/**
 * Ответы бюллетеня: на каждый вопрос ровно один ответ, варианты — из этого вопроса,
 * у «за / против» и одиночного выбора — один вариант, «Воздержался» не сочетается с другими.
 */
export function validateAnswers(agenda: AgendaQuestion[], answers: { question_id: string; option_ids: string[] }[]): string | null {
  if (answers.length !== agenda.length) return 'Ответьте на все вопросы повестки'
  for (const q of agenda) {
    const a = answers.find((x) => x.question_id === q.id)
    if (!a) return `Нет ответа на вопрос ${q.order}`
    const ids = new Set(a.option_ids)
    if (ids.size !== a.option_ids.length) return `Вариант в вопросе ${q.order} указан дважды`
    const chosen = q.options.filter((o) => ids.has(o.id))
    if (chosen.length !== ids.size) return `В вопросе ${q.order} указан чужой вариант`
    if (q.type !== 'MULTI_CHOICE' && chosen.length !== 1) return `В вопросе ${q.order} выберите один вариант`
    if (chosen.length > 1 && chosen.some((o) => o.kind === 'ABSTAIN')) return `В вопросе ${q.order} «Воздержался» не сочетается с другими вариантами`
  }
  return null
}
