import { z } from 'zod'
import type { FileView } from './requests.js'

/* Фаза 4: голосования (docs/09, docs/03 §11) */

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max)
const instant = z.iso.datetime({ offset: true })

export const VoteLegalBasis = ['ART_42_MEETING', 'ART_43_WRITTEN_SURVEY', 'ART_44_ELECTRONIC'] as const
export type VoteLegalBasis = (typeof VoteLegalBasis)[number]
/** Очное собрание (ст. 42) система не проводит: только электронное голосование и письменный опрос */
export const SupportedLegalBasis = ['ART_44_ELECTRONIC', 'ART_43_WRITTEN_SURVEY'] as const

export const DecisionType = [
  'ROUTINE', 'CURRENT_REPAIR', 'TARIFF_CHANGE', 'TARGETED_CONTRIBUTION', 'CHAIRMAN_ELECTION',
  'MAJOR_EXPENSE', 'CAPITAL_REPAIR', 'MANAGEMENT_CHANGE', 'LIQUIDATION', 'COMMON_PROPERTY_DISPOSAL',
] as const
export type DecisionType = (typeof DecisionType)[number]

export const VoteThreshold = ['SIMPLE_MAJORITY', 'TWO_THIRDS'] as const
export type VoteThreshold = (typeof VoteThreshold)[number]

/**
 * Порог выводится из типа решения и не выбирается председателем (docs/09 §3).
 * Таблица — единственное место, где он задан; голосование хранит порог на момент создания.
 */
export const DECISION_THRESHOLD: Record<DecisionType, VoteThreshold> = {
  ROUTINE: 'SIMPLE_MAJORITY',
  CURRENT_REPAIR: 'SIMPLE_MAJORITY',
  TARIFF_CHANGE: 'SIMPLE_MAJORITY',
  TARGETED_CONTRIBUTION: 'SIMPLE_MAJORITY',
  CHAIRMAN_ELECTION: 'SIMPLE_MAJORITY',
  MAJOR_EXPENSE: 'TWO_THIRDS',
  CAPITAL_REPAIR: 'TWO_THIRDS',
  MANAGEMENT_CHANGE: 'TWO_THIRDS',
  LIQUIDATION: 'TWO_THIRDS',
  COMMON_PROPERTY_DISPOSAL: 'TWO_THIRDS',
}

export const DECISION_LABEL: Record<DecisionType, string> = {
  ROUTINE: 'Текущие вопросы',
  CURRENT_REPAIR: 'Текущий ремонт',
  TARIFF_CHANGE: 'Изменение тарифа',
  TARGETED_CONTRIBUTION: 'Целевой взнос',
  CHAIRMAN_ELECTION: 'Выборы председателя',
  MAJOR_EXPENSE: 'Крупный расход',
  CAPITAL_REPAIR: 'Капитальный ремонт',
  MANAGEMENT_CHANGE: 'Смена способа управления',
  LIQUIDATION: 'Ликвидация ОСИ',
  COMMON_PROPERTY_DISPOSAL: 'Распоряжение общим имуществом',
}

export const THRESHOLD_LABEL: Record<VoteThreshold, string> = { SIMPLE_MAJORITY: 'простое большинство', TWO_THIRDS: '2/3 голосов' }
export const LEGAL_BASIS_LABEL: Record<VoteLegalBasis, string> = {
  ART_42_MEETING: 'Очное собрание (ст. 42)',
  ART_43_WRITTEN_SURVEY: 'Письменный опрос (ст. 43)',
  ART_44_ELECTRONIC: 'Электронное голосование (ст. 44)',
}

/** Закон: уведомить не позднее чем за 5 календарных дней. Предлагаем 7 — запас дешевле спора */
export const NOTICE_DAYS = 5
export const RECOMMENDED_NOTICE_DAYS = 7
export const MIN_VOTE_HOURS = 24
export const MAX_VOTE_DAYS = 60
/** Доля бумажных бюллетеней, выше которой протокол явно на это указывает (docs/09 §9) */
export const PAPER_SHARE_NOTE = 0.3

export const VoteStatus = ['DRAFT', 'NOTICE_SENT', 'ACTIVE', 'CLOSED', 'CANCELLED'] as const
export type VoteStatus = (typeof VoteStatus)[number]
export const QuestionType = ['YES_NO', 'SINGLE_CHOICE', 'MULTI_CHOICE'] as const
export type QuestionType = (typeof QuestionType)[number]
export const OptionKind = ['FOR', 'AGAINST', 'ABSTAIN', 'CHOICE'] as const
export type OptionKind = (typeof OptionKind)[number]
export const BallotChannel = ['ELECTRONIC', 'PAPER'] as const
export type BallotChannel = (typeof BallotChannel)[number]
export const ProtocolStatus = ['AWAITING_SIGNATURES', 'SIGNED', 'PUBLISHED'] as const
export type ProtocolStatus = (typeof ProtocolStatus)[number]

/* ───────── создание и правка ───────── */

const question = z
  .object({
    text: trimmed(5, 1000),
    type: z.enum(QuestionType),
    /** Для вопросов с выбором. «Воздержался» система добавляет сама */
    options: z.array(trimmed(1, 200)).max(20).optional(),
  })
  .superRefine((q, c) => {
    if (q.type === 'YES_NO') {
      if (q.options?.length) c.addIssue({ code: 'custom', path: ['options'], message: 'У вопроса «за / против» варианты фиксированные' })
      return
    }
    const opts = q.options ?? []
    if (opts.length < 2) c.addIssue({ code: 'custom', path: ['options'], message: 'Нужно хотя бы два варианта' })
    if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) c.addIssue({ code: 'custom', path: ['options'], message: 'Варианты повторяются' })
  })
export type VoteQuestionInput = z.input<typeof question>

const voteFields = {
  title: trimmed(5, 200),
  description: trimmed(0, 4000).nullable().optional(),
  legal_basis: z.enum(SupportedLegalBasis),
  decision_type: z.enum(DecisionType),
  results_visible_during: z.boolean().default(false),
  secretary_user_id: z.uuid().nullable().optional(),
  questions: z.array(question).min(1, 'Нужен хотя бы один вопрос').max(20),
  material_file_ids: z.array(z.uuid()).max(10).default([]),
}

export const createVoteBody = z.object(voteFields)
export type CreateVoteBody = z.input<typeof createVoteBody>

/** В черновике меняется всё; после уведомления — только секретарь и новые материалы */
export const updateVoteBody = z
  .object({
    title: voteFields.title.optional(),
    description: voteFields.description,
    legal_basis: voteFields.legal_basis.optional(),
    decision_type: voteFields.decision_type.optional(),
    results_visible_during: z.boolean().optional(),
    secretary_user_id: voteFields.secretary_user_id,
    questions: voteFields.questions.optional(),
    material_file_ids: z.array(z.uuid()).max(10).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, 'Нечего менять')
export type UpdateVoteBody = z.infer<typeof updateVoteBody>

export const sendNoticeBody = z
  .object({ starts_at: instant, ends_at: instant })
  .refine((b) => Date.parse(b.ends_at) - Date.parse(b.starts_at) >= MIN_VOTE_HOURS * 3_600_000, { path: ['ends_at'], message: `Голосование идёт не меньше ${MIN_VOTE_HOURS} часов` })
  .refine((b) => Date.parse(b.ends_at) - Date.parse(b.starts_at) <= MAX_VOTE_DAYS * 86_400_000, { path: ['ends_at'], message: `Не дольше ${MAX_VOTE_DAYS} дней` })
export type SendNoticeBody = z.infer<typeof sendNoticeBody>

export const cancelVoteBody = z.object({ reason: trimmed(5, 500) })
export type CancelVoteBody = z.infer<typeof cancelVoteBody>

/* ───────── бюллетени ───────── */

const answers = z
  .array(z.object({ question_id: z.uuid(), option_ids: z.array(z.uuid()).min(1).max(20) }))
  .min(1)
  .max(20)
  .refine((a) => new Set(a.map((x) => x.question_id)).size === a.length, 'Ответ на вопрос указан дважды')

export const ballotStartBody = z.object({ unit_id: z.uuid(), answers })
export type BallotStartBody = z.infer<typeof ballotStartBody>

export const ballotCompleteBody = z.object({ signing_id: z.uuid() })
export type BallotCompleteBody = z.infer<typeof ballotCompleteBody>

/** Бумажный бюллетень письменного опроса: вносит председатель, скан обязателен (docs/09 §9) */
export const paperBallotBody = z.object({ unit_id: z.uuid(), voter_name: trimmed(5, 200), scan_file_id: z.uuid(), answers })
export type PaperBallotBody = z.infer<typeof paperBallotBody>

/* ───────── ответы API ───────── */

export type VoteOptionView = { id: string; order: number; text: string; kind: OptionKind }
export type VoteQuestionView = { id: string; order: number; text: string; type: QuestionType; options: VoteOptionView[] }

export type Turnout = {
  total_units: number
  total_area: number
  cast_units: number
  cast_area: number
  /** Явка по площади, % — она же кворум */
  percent: number
  quorum_reached: boolean
}

/** Помещение вызывающего: может ли он голосовать за него и подан ли бюллетень */
export type MyVoteUnit = {
  unit_id: string
  number: string
  area: number
  weight_percent: number
  can_vote: boolean
  /** Почему нельзя: не представитель, не в снимке реестра */
  reason: string | null
  ballot: { cast_at: string; channel: BallotChannel } | null
}

export type VoteListItem = {
  id: string
  title: string
  status: VoteStatus
  decision_type: DecisionType
  threshold: VoteThreshold
  legal_basis: VoteLegalBasis
  starts_at: string | null
  ends_at: string | null
  turnout_percent: number | null
  /** Есть ли у вызывающего помещение, за которое он ещё может проголосовать */
  awaiting_my_ballot: boolean
  protocol: { id: string; number: number; status: ProtocolStatus } | null
}

export type VoteView = Omit<VoteListItem, 'turnout_percent' | 'awaiting_my_ballot'> & {
  description: string | null
  quorum_basis: 'BY_AREA' | 'BY_UNIT'
  results_visible_during: boolean
  notice_sent_at: string | null
  activated_at: string | null
  closed_at: string | null
  cancelled_at: string | null
  cancel_reason: string | null
  secretary: { user_id: string; name: string } | null
  questions: VoteQuestionView[]
  materials: FileView[]
  turnout: Turnout | null
  /** Помещения, за которые вызывающий голосует или голосовал. Пусто — не собственник */
  my_units: MyVoteUnit[]
  /** Сколько уведомлено, для председателя */
  notified: number | null
}

export type OptionResult = { option_id: string; text: string; kind: OptionKind; units: number; area: number; percent: number }
export type QuestionResult = {
  question_id: string
  order: number
  text: string
  type: QuestionType
  options: OptionResult[]
  /** null — кворума нет, решение не принималось */
  adopted: boolean | null
  /** Для вопросов с выбором — варианты, набравшие порог */
  adopted_option_ids: string[]
}

export type VoteResults = {
  status: VoteStatus
  threshold: VoteThreshold
  turnout: Turnout
  /** Распределение голосов скрыто до закрытия, если голосование не открытое */
  hidden: boolean
  questions: QuestionResult[]
  paper: { units: number; area: number; percent_of_cast: number }
}

export type ProtocolParticipant = { unit_number: string; area: number; channel: BallotChannel; voter_name: string; cast_at: string; cert_serial: string | null; entered_by_chairman: boolean }

/** Содержание протокола: формируется при закрытии и подписывается как есть */
export type ProtocolContent = {
  number: number
  house: { address: string; display_name: string }
  vote: { id: string; title: string; description: string | null; legal_basis: VoteLegalBasis; decision_type: DecisionType; threshold: VoteThreshold }
  dates: { notice_sent_at: string; starts_at: string; ends_at: string; closed_at: string }
  quorum: Turnout
  held: boolean
  agenda: { order: number; text: string }[]
  results: QuestionResult[]
  paper: { units: number; area: number; percent_of_cast: number; note: string | null }
  participants: ProtocolParticipant[]
  notice: { notified_users: number; notified_owner_units: number; units_without_owner_in_app: number }
  materials: { file_id: string; mime_type: string }[]
  snapshot: { total_area: number; total_units: number; entries_hash: string }
}

export type ProtocolView = {
  id: string
  vote_id: string
  number: number
  status: ProtocolStatus
  content: ProtocolContent
  content_hash: string
  signatures: { chairman: { name: string; signed_at: string } | null; secretary: { name: string; signed_at: string } | null }
  secretary: { user_id: string; name: string } | null
  published_at: string | null
  retention_until: string
}

export type BallotSigningView = { signing_id: string; external_id: string; qr_url: string; deeplink: string; expires_at: string }
