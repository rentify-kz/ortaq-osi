import { describe, expect, it } from 'vitest'
import { passes, quorumReached, tally, weightOf, type SnapshotEntry, type TallyQuestion } from './tally'

const entries: SnapshotEntry[] = [
  { unit_id: 'u1', number: '1', area: 120, weight: 0, voters: ['a'] },
  { unit_id: 'u2', number: '2', area: 60, weight: 0, voters: ['b'] },
  { unit_id: 'u3', number: '3', area: 60, weight: 0, voters: ['c'] },
  { unit_id: 'u4', number: '4', area: 60.1, weight: 0, voters: ['d'] },
]
const yesNo: TallyQuestion = {
  id: 'q1', order: 1, text: 'Заменить лифт?', type: 'YES_NO',
  options: [{ id: 'for', order: 1, text: 'За', kind: 'FOR' }, { id: 'against', order: 2, text: 'Против', kind: 'AGAINST' }, { id: 'abstain', order: 3, text: 'Воздержался', kind: 'ABSTAIN' }],
}

describe('passes', () => {
  it('requires strictly more than half for a simple majority', () => {
    expect(passes(50, 100, 'SIMPLE_MAJORITY')).toBe(false)
    expect(passes(50.01, 100, 'SIMPLE_MAJORITY')).toBe(true)
  })

  it('accepts exactly two thirds and rejects anything below', () => {
    expect(passes(200, 300, 'TWO_THIRDS')).toBe(true)
    expect(passes(199, 300, 'TWO_THIRDS')).toBe(false)
  })

  it('never passes with nothing cast', () => {
    expect(passes(0, 0, 'SIMPLE_MAJORITY')).toBe(false)
  })
})

describe('quorumReached', () => {
  it('needs more than half of the area, not half', () => {
    expect(quorumReached(50, 100)).toBe(false)
    expect(quorumReached(51, 100)).toBe(true)
  })
})

describe('tally', () => {
  it('weighs ballots by area, not one per owner', () => {
    const t = tally({
      entries, threshold: 'SIMPLE_MAJORITY', questions: [yesNo],
      ballots: [{ unitId: 'u1', channel: 'ELECTRONIC', optionIds: ['for'] }, { unitId: 'u2', channel: 'ELECTRONIC', optionIds: ['against'] }, { unitId: 'u3', channel: 'ELECTRONIC', optionIds: ['against'] }],
    })
    expect(t.turnout).toMatchObject({ cast_units: 3, cast_area: 240, total_area: 300.1, quorum_reached: true })
    expect(t.questions[0]!.options.map((o) => o.area)).toEqual([120, 120, 0])
    // Ровно половина «за» — не большинство
    expect(t.questions[0]!.adopted).toBe(false)
  })

  it('counts abstentions in the denominator so they make adoption harder', () => {
    const t = tally({
      entries, threshold: 'SIMPLE_MAJORITY', questions: [yesNo],
      ballots: [{ unitId: 'u2', channel: 'ELECTRONIC', optionIds: ['for'] }, { unitId: 'u3', channel: 'ELECTRONIC', optionIds: ['for'] }, { unitId: 'u1', channel: 'ELECTRONIC', optionIds: ['abstain'] }],
    })
    expect(t.questions[0]!.adopted).toBe(false)
    expect(t.questions[0]!.options[0]!.percent).toBe(50)
  })

  it('reports no decision at all without a quorum', () => {
    const t = tally({ entries, threshold: 'SIMPLE_MAJORITY', questions: [yesNo], ballots: [{ unitId: 'u1', channel: 'ELECTRONIC', optionIds: ['for'] }] })
    expect(t.turnout.quorum_reached).toBe(false)
    expect(t.questions[0]!.adopted).toBeNull()
  })

  it('ignores a ballot for a unit missing from the snapshot', () => {
    const t = tally({ entries, threshold: 'SIMPLE_MAJORITY', questions: [yesNo], ballots: [{ unitId: 'ghost', channel: 'ELECTRONIC', optionIds: ['for'] }] })
    expect(t.turnout.cast_units).toBe(0)
  })

  it('adopts a choice option only if it alone reaches the threshold', () => {
    const q: TallyQuestion = {
      id: 'q2', order: 1, text: 'Подрядчик', type: 'SINGLE_CHOICE',
      options: [{ id: 'x', order: 1, text: 'X', kind: 'CHOICE' }, { id: 'y', order: 2, text: 'Y', kind: 'CHOICE' }, { id: 'ab', order: 3, text: 'Воздержался', kind: 'ABSTAIN' }],
    }
    const t = tally({
      entries, threshold: 'TWO_THIRDS', questions: [q],
      ballots: [{ unitId: 'u1', channel: 'ELECTRONIC', optionIds: ['x'] }, { unitId: 'u2', channel: 'PAPER', optionIds: ['x'] }, { unitId: 'u3', channel: 'ELECTRONIC', optionIds: ['y'] }],
    })
    expect(t.questions[0]!.adopted_option_ids).toEqual(['x'])
    expect(t.paper).toMatchObject({ units: 1, area: 60, percent_of_cast: 25, note: null })
  })

  it('notes in the protocol when paper ballots exceed 30% of the cast area', () => {
    const t = tally({
      entries, threshold: 'SIMPLE_MAJORITY', questions: [yesNo],
      ballots: [{ unitId: 'u1', channel: 'PAPER', optionIds: ['for'] }, { unitId: 'u2', channel: 'ELECTRONIC', optionIds: ['for'] }],
    })
    expect(t.paper.note).toContain('66.67%')
  })

  it('sums hundredths exactly where floating point would drift', () => {
    const many: SnapshotEntry[] = Array.from({ length: 1000 }, (_, i) => ({ unit_id: `u${i}`, number: String(i), area: 0.1, weight: 0, voters: [] }))
    const t = tally({ entries: many, threshold: 'SIMPLE_MAJORITY', questions: [], ballots: many.map((e) => ({ unitId: e.unit_id, channel: 'ELECTRONIC' as const, optionIds: [] })) })
    expect(t.turnout.total_area).toBe(100)
    expect(t.turnout.percent).toBe(100)
  })
})

describe('weightOf', () => {
  it('gives a 62.4 m² unit of 8420.5 m² a weight of 0.741%', () => {
    expect(weightOf(62.4, 8420.5)).toBe(0.00741)
  })
})
