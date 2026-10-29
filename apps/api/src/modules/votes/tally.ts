import { PAPER_SHARE_NOTE, type BallotChannel, type OptionKind, type QuestionResult, type QuestionType, type Turnout, type VoteThreshold } from '@ortaq/shared'

/** Строка снимка реестра: площадь и доля заморожены при старте голосования (docs/09 §6) */
export type SnapshotEntry = { unit_id: string; number: string; area: number; weight: number; voters: string[] }

export type TallyQuestion = { id: string; order: number; text: string; type: QuestionType; options: { id: string; order: number; text: string; kind: OptionKind }[] }
export type TallyBallot = { unitId: string; channel: BallotChannel; optionIds: string[] }

export type Tally = { turnout: Turnout; questions: QuestionResult[]; paper: { units: number; area: number; percent_of_cast: number; note: string | null } }

/**
 * Площади считаются в сотых долях квадратного метра — целыми числами. Сумма тысячи
 * площадей с копейками в плавающей точке расходится в последнем знаке, а протокол
 * через год должен пересчитываться до той же цифры.
 */
const centi = (area: number) => Math.round(area * 100)
const fromCenti = (c: number) => c / 100
const percent = (part: number, whole: number) => (whole === 0 ? 0 : Math.round((part / whole) * 10_000) / 100)

/**
 * Порог считается от суммы площадей поданных бюллетеней, а не от площади дома (docs/09 §3).
 * «Воздержался» входит в знаменатель, но не поддерживает решение. Сравнение без деления:
 * 2/3 — это for·3 ≥ cast·2, простое большинство — for·2 > cast.
 */
export function passes(forArea: number, castArea: number, threshold: VoteThreshold): boolean {
  if (castArea <= 0) return false
  return threshold === 'TWO_THIRDS' ? forArea * 3 >= castArea * 2 : forArea * 2 > castArea
}

/** Кворум — больше половины площади голосующих помещений из снимка */
export function quorumReached(castArea: number, totalArea: number): boolean {
  return totalArea > 0 && castArea * 2 > totalArea
}

/**
 * Подсчёт голосования только по снимку реестра: площадь бюллетеня — из снимка, а не из
 * текущего справочника. Бюллетень помещения, которого нет в снимке, не учитывается вовсе.
 */
export function tally(input: { entries: SnapshotEntry[]; threshold: VoteThreshold; questions: TallyQuestion[]; ballots: TallyBallot[] }): Tally {
  const areaOf = new Map(input.entries.map((e) => [e.unit_id, centi(e.area)]))
  const totalArea = input.entries.reduce((s, e) => s + centi(e.area), 0)
  const counted = input.ballots.filter((b) => areaOf.has(b.unitId))
  const castArea = counted.reduce((s, b) => s + areaOf.get(b.unitId)!, 0)
  const held = quorumReached(castArea, totalArea)

  const turnout: Turnout = {
    total_units: input.entries.length, total_area: fromCenti(totalArea), cast_units: counted.length, cast_area: fromCenti(castArea),
    percent: percent(castArea, totalArea), quorum_reached: held,
  }

  const questions = [...input.questions].sort((a, b) => a.order - b.order).map((q): QuestionResult => {
    const options = [...q.options].sort((a, b) => a.order - b.order).map((o) => {
      const voted = counted.filter((b) => b.optionIds.includes(o.id))
      const area = voted.reduce((s, b) => s + areaOf.get(b.unitId)!, 0)
      return { option_id: o.id, text: o.text, kind: o.kind, units: voted.length, area, percent: percent(area, castArea) }
    })
    const supporting = options.filter((o) => o.kind === 'FOR' || o.kind === 'CHOICE')
    const winners = held ? supporting.filter((o) => passes(o.area, castArea, input.threshold)) : []
    return {
      question_id: q.id, order: q.order, text: q.text, type: q.type,
      options: options.map((o) => ({ ...o, area: fromCenti(o.area) })),
      adopted: held ? winners.length > 0 : null,
      adopted_option_ids: q.type === 'YES_NO' ? [] : winners.map((o) => o.option_id),
    }
  })

  const paper = counted.filter((b) => b.channel === 'PAPER')
  const paperArea = paper.reduce((s, b) => s + areaOf.get(b.unitId)!, 0)
  const paperShare = castArea === 0 ? 0 : paperArea / castArea
  return {
    turnout,
    questions,
    paper: {
      units: paper.length, area: fromCenti(paperArea), percent_of_cast: percent(paperArea, castArea),
      note: paperShare > PAPER_SHARE_NOTE ? `Бумажными бюллетенями, внесёнными председателем, подано ${percent(paperArea, castArea)}% голосов по площади` : null,
    },
  }
}

/** Доля помещения в общей площади: 6 знаков, как в Ballot.weight */
export function weightOf(area: number, totalArea: number): number {
  return totalArea === 0 ? 0 : Math.round((centi(area) / centi(totalArea)) * 1_000_000) / 1_000_000
}
