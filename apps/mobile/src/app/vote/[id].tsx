import { useState } from 'react'
import { Linking, Platform, Pressable, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, BadgeCheck, ExternalLink, FileSignature, Paperclip, Scale } from 'lucide-react-native'
import {
  DECISION_LABEL, THRESHOLD_LABEL,
  type BallotSigningView, type ProtocolView, type VoteResults, type VoteView,
} from '@ortaq/shared'
import { api, ApiError } from '../../lib/api'
import { openEgov } from '../../lib/egov'
import { when } from '../../lib/format'
import { useHouse, useMe } from '../../lib/session'
import { color, radius, space } from '../../theme'
import { Button, Card, CheckRow, ErrorNote, H2, Screen, Segmented, Skeleton, T, Tag, Title } from '../../ui/kit'
import { left, m2, pct, VOTE_STATUS } from '../../ui/votes'

type Cast = { status: 'CAST'; unit_number: string; cast_at: string; area: number; weight_percent: number }

function openUrl(url: string) {
  if (Platform.OS === 'web') window.open(url, '_blank', 'noopener,noreferrer')
  else void Linking.openURL(url)
}

/**
 * Голосование для жильца (docs/05 §5.4): повестка, материалы, выбор, подпись бюллетеня ЭЦП
 * в eGov mobile. Вес голоса показан явно — по площади, а не «один человек — один голос».
 */
export default function VoteScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>()
  const house = useHouse()
  const q = useQuery({ queryKey: ['house', house?.id, 'vote', id], queryFn: () => api<VoteView>(`/houses/${house!.id}/votes/${id}`), enabled: !!house })
  if (!house || q.isPending) return <Screen><Skeleton rows={6} /></Screen>
  if (!q.data) return <Screen><ErrorNote>{q.error?.message}</ErrorNote></Screen>
  const v = q.data
  const t = v.turnout
  return (
    <Screen refreshing={q.isRefetching} onRefresh={() => void q.refetch()}>
      <View style={{ alignItems: 'flex-start' }}><Button variant="soft" icon={ArrowLeft} onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))}>Назад</Button></View>
      <Title sub={DECISION_LABEL[v.decision_type]}>{v.title}</Title>

      {v.status === 'NOTICE_SENT' && <Card><T>Голосование начнётся {when(v.starts_at!)} и продлится до {when(v.ends_at!)}</T></Card>}
      {v.status === 'CANCELLED' && <Card tone="warning"><T>Голосование отменено. Причина: {v.cancel_reason}</T></Card>}
      {t && (
        <Card>
          <T size={13.5} tone="ink2">{v.status === 'ACTIVE' ? `До окончания: ${left(v.ends_at!)}` : VOTE_STATUS[v.status]}</T>
          <T size={22} weight="display">Проголосовало {pct(t.percent)}</T>
          <View style={{ height: 10, borderRadius: radius.pill, backgroundColor: color.surface2, overflow: 'hidden' }}>
            <View style={{ width: `${Math.min(100, t.percent)}%`, height: '100%', backgroundColor: t.quorum_reached ? color.brand600 : color.warning }} />
          </View>
          <T size={13.5} tone="ink2">{t.quorum_reached ? 'Кворум есть' : 'Для кворума нужно больше 50% площади дома'} · {t.cast_units} из {t.total_units} помещений</T>
        </Card>
      )}

      {v.description && <T tone="ink2">{v.description}</T>}
      {v.materials.length > 0 && <Materials houseId={house.id} vote={v} />}
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
        <Scale size={18} color={color.brand700} />
        <T size={14} tone="brand" style={{ flex: 1 }}>Требуется {THRESHOLD_LABEL[v.threshold]} от участвующих по площади ({DECISION_LABEL[v.decision_type].toLowerCase()})</T>
      </View>

      {v.status === 'ACTIVE' ? <Ballot houseId={house.id} vote={v} /> : <Agenda vote={v} />}
      {(v.status === 'CLOSED' || v.status === 'CANCELLED' || (v.status === 'ACTIVE' && v.results_visible_during)) && <Results houseId={house.id} vote={v} />}
      {v.protocol && <Protocol houseId={house.id} vote={v} />}
    </Screen>
  )
}

function Materials({ houseId, vote }: { houseId: string; vote: VoteView }) {
  const open = useMutation({ mutationFn: async (fileId: string) => openUrl((await api<{ url: string }>(`/houses/${houseId}/files/${fileId}/download-url`)).url) })
  return (
    <View style={{ gap: space.sm }}>
      <H2>Материалы</H2>
      {vote.materials.map((m, i) => (
        <Button key={m.id} variant="soft" icon={Paperclip} loading={open.isPending && open.variables === m.id} onPress={() => open.mutate(m.id)}>
          {`Материал ${i + 1} · ${m.mime_type === 'application/pdf' ? 'PDF' : 'фото'}`}
        </Button>
      ))}
      <ErrorNote>{open.error?.message}</ErrorNote>
    </View>
  )
}

function Agenda({ vote }: { vote: VoteView }) {
  return (
    <View style={{ gap: space.md }}>
      {vote.questions.map((q) => (
        <Card key={q.id}>
          <T size={13.5} tone="ink2">Вопрос {q.order}</T>
          <T weight="semibold">{q.text}</T>
          <T size={14} tone="ink2">{q.options.map((o) => o.text).join(' · ')}</T>
        </Card>
      ))}
    </View>
  )
}

/** Бюллетень: выбор → «Подписать и отправить» → eGov mobile → «Готово». Подпись забирает и проверяет сервер */
function Ballot({ houseId, vote }: { houseId: string; vote: VoteView }) {
  const qc = useQueryClient()
  // Начатое подписание живёт в адресе: если ОС выгрузит приложение, пока жилец в eGov, «Готово» сработает
  const params = useLocalSearchParams<{ s?: string; link?: string }>()
  const open = vote.my_units.filter((u) => u.can_vote)
  const [unitId, setUnitId] = useState(open[0]?.unit_id ?? '')
  const [answers, setAnswers] = useState<Record<string, string[]>>({})
  const [cast, setCast] = useState<Cast | null>(null)
  const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['house', houseId, 'vote', vote.id] }), qc.invalidateQueries({ queryKey: ['house', houseId, 'votes'] })])

  const start = useMutation({
    mutationFn: () => api<BallotSigningView>(`/houses/${houseId}/votes/${vote.id}/ballot/start`, {
      method: 'POST', body: { unit_id: unitId, answers: vote.questions.map((q) => ({ question_id: q.id, option_ids: answers[q.id] ?? [] })) },
    }),
    onSuccess: (s) => { router.setParams({ s: s.signing_id, link: s.deeplink }); openEgov(s.deeplink) },
  })
  const complete = useMutation({
    mutationFn: () => api<Cast | { status: 'PENDING' }>(`/houses/${houseId}/votes/${vote.id}/ballot/complete`, { method: 'POST', body: { signing_id: params.s } }),
    onSuccess: async (r) => {
      if (r.status === 'CAST') { setCast(r); router.setParams({ s: undefined, link: undefined }); await refresh() }
    },
  })
  const pick = (qid: string, oid: string, multi: boolean, abstain: boolean) => setAnswers((a) => {
    if (!multi) return { ...a, [qid]: [oid] }
    const cur = a[qid] ?? []
    const isAbstain = (id: string) => vote.questions.find((x) => x.id === qid)!.options.find((o) => o.id === id)?.kind === 'ABSTAIN'
    return { ...a, [qid]: cur.includes(oid) ? cur.filter((x) => x !== oid) : abstain ? [oid] : [...cur.filter((x) => !isAbstain(x)), oid] }
  })
  const done = vote.my_units.filter((u) => u.ballot)
  const answered = vote.questions.every((q) => (answers[q.id]?.length ?? 0) > 0)
  const unit = open.find((x) => x.unit_id === unitId)

  if (cast) {
    return (
      <Card tone="brand">
        <BadgeCheck size={28} color={color.brand600} />
        <H2>Ваш голос учтён</H2>
        <T>{when(cast.cast_at)} · помещение №{cast.unit_number}</T>
        <T tone="ink2">Вес голоса: {pct(cast.weight_percent)} (по площади {m2(cast.area)}). Подписано ЭЦП — изменить голос нельзя</T>
      </Card>
    )
  }

  return (
    <View style={{ gap: space.md }}>
      {done.map((u) => (
        <Card key={u.unit_id} tone="brand">
          <T weight="semibold">Голос за помещение №{u.number} учтён</T>
          <T size={14} tone="ink2">{when(u.ballot!.cast_at)} · вес {pct(u.weight_percent)} (по площади {m2(u.area)}){u.ballot!.channel === 'PAPER' ? ' · бумажный бюллетень' : ' · подписано ЭЦП'}</T>
        </Card>
      ))}
      {vote.my_units.filter((u) => !u.can_vote && !u.ballot).map((u) => (
        <Card key={u.unit_id}><T size={14} tone="ink2">Помещение №{u.number}: {u.reason}</T></Card>
      ))}
      {vote.my_units.length === 0 && <Card><T tone="ink2">Голосовать может собственник помещения с подтверждённой собственностью. Вы видите повестку и ход голосования</T></Card>}

      {!unit ? <Agenda vote={vote} /> : (
        <>
          {open.length > 1 && <Segmented label="Помещение" value={unitId} onChange={setUnitId} options={open.map((u) => ({ v: u.unit_id, label: `№${u.number}` }))} />}
          <T size={14} tone="ink2">Ваш голос весит {pct(unit.weight_percent)} — по площади помещения №{unit.number}, {m2(unit.area)}. Так считает закон: вес голоса пропорционален площади</T>
          {vote.questions.map((q) => (
            <Card key={q.id}>
              <T size={13.5} tone="ink2">Вопрос {q.order}{q.type === 'MULTI_CHOICE' ? ' · можно несколько вариантов' : ''}</T>
              <T weight="semibold">{q.text}</T>
              {q.options.map((o) => {
                const on = (answers[q.id] ?? []).includes(o.id)
                return q.type === 'MULTI_CHOICE' ? (
                  <CheckRow key={o.id} checked={on} onChange={() => pick(q.id, o.id, true, o.kind === 'ABSTAIN')}><T>{o.text}</T></CheckRow>
                ) : (
                  <Pressable key={o.id} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => pick(q.id, o.id, false, false)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48, borderRadius: radius.md, paddingHorizontal: space.md, backgroundColor: on ? color.brand50 : color.surface2 }}>
                    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? color.brand600 : color.ink3, alignItems: 'center', justifyContent: 'center' }}>
                      {on && <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: color.brand600 }} />}
                    </View>
                    <T>{o.text}</T>
                  </Pressable>
                )
              })}
            </Card>
          ))}
          <ErrorNote>{start.error?.message ?? (complete.error instanceof ApiError ? complete.error.message : null)}</ErrorNote>
          {params.s ? (
            <Card>
              <T>Подпишите бюллетень в eGov mobile своей ЭЦП и вернитесь сюда</T>
              {complete.data?.status === 'PENDING' && <T size={14} tone="warning">Подпись ещё не получена. Завершите подписание в eGov mobile</T>}
              <Button loading={complete.isPending} onPress={() => complete.mutate()}>Готово, бюллетень подписан</Button>
              <Button variant="soft" icon={ExternalLink} onPress={() => openEgov(params.link!)}>Открыть eGov mobile снова</Button>
            </Card>
          ) : (
            <Button icon={FileSignature} loading={start.isPending} disabled={!answered} onPress={() => start.mutate()}>Подписать и отправить</Button>
          )}
          <T size={12.5} tone="ink3">Бюллетень подписывается ЭЦП и юридически значим: изменить голос после подписи нельзя</T>
        </>
      )}
    </View>
  )
}

function Results({ houseId, vote }: { houseId: string; vote: VoteView }) {
  const q = useQuery({ queryKey: ['house', houseId, 'vote-results', vote.id], queryFn: () => api<VoteResults>(`/houses/${houseId}/votes/${vote.id}/results`) })
  if (!q.data || q.data.hidden) return null
  return (
    <View style={{ gap: space.md }}>
      <H2>{vote.status === 'ACTIVE' ? 'Ход голосования' : 'Итоги'}</H2>
      {q.data.questions.map((r) => (
        <Card key={r.question_id}>
          <T weight="semibold">{r.order}. {r.text}</T>
          {r.options.map((o) => (
            <View key={o.option_id} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
                <T size={14} style={{ flex: 1 }}>{o.text}</T>
                <T size={14} tone="ink2">{pct(o.percent)}</T>
              </View>
              <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: color.surface2, overflow: 'hidden' }}>
                <View style={{ width: `${o.percent}%`, height: '100%', backgroundColor: color.brand600 }} />
              </View>
            </View>
          ))}
          {vote.status === 'CLOSED' && (
            <View style={{ flexDirection: 'row' }}>
              <Tag tone={r.adopted ? 'brand' : r.adopted === null ? 'mute' : 'warn'}>{r.adopted ? 'Решение принято' : r.adopted === null ? 'Нет кворума' : 'Решение не принято'}</Tag>
            </View>
          )}
        </Card>
      ))}
    </View>
  )
}

/** Протокол: жильцам — опубликованный; секретарь подписывает его здесь же своей ЭЦП */
function Protocol({ houseId, vote }: { houseId: string; vote: VoteView }) {
  const qc = useQueryClient()
  const me = useMe()
  const key = ['house', houseId, 'protocol', vote.id]
  const q = useQuery({ queryKey: key, queryFn: () => api<ProtocolView>(`/houses/${houseId}/votes/${vote.id}/protocol`) })
  const [started, setStarted] = useState<BallotSigningView | null>(null)
  const start = useMutation({
    mutationFn: () => api<BallotSigningView>(`/houses/${houseId}/protocols/${q.data!.id}/sign`, { method: 'POST' }),
    onSuccess: (s) => { setStarted(s); openEgov(s.deeplink) },
  })
  const complete = useMutation({
    mutationFn: () => api<ProtocolView | { status: 'PENDING' }>(`/houses/${houseId}/protocols/${q.data!.id}/sign/complete`, { method: 'POST' }),
    onSuccess: async (r) => { if ('id' in r) { setStarted(null); await qc.invalidateQueries({ queryKey: key }) } },
  })
  if (!q.data) return null
  const p = q.data
  const secretary = p.secretary?.user_id === me.data?.id
  return (
    <Card>
      <H2>Протокол №{p.number}</H2>
      <T size={14} tone="ink2">
        {p.status === 'PUBLISHED' ? `Опубликован ${when(p.published_at!)}` : 'Ждёт подписей председателя и секретаря'}
        {p.content.held ? `. Кворум ${pct(p.content.quorum.percent)} — собрание правомочно` : `. Кворум ${pct(p.content.quorum.percent)} — собрание не состоялось`}
      </T>
      <T size={14}>Председатель: {p.signatures.chairman ? `${p.signatures.chairman.name}, ЭЦП` : 'не подписано'}</T>
      <T size={14}>Секретарь: {p.signatures.secretary ? `${p.signatures.secretary.name}, ЭЦП` : 'не подписано'}</T>
      {secretary && p.status === 'AWAITING_SIGNATURES' && !p.signatures.secretary && (
        started ? (
          <>
            {complete.data && !('id' in complete.data) && <T size={14} tone="warning">Подпись ещё не получена</T>}
            <Button loading={complete.isPending} onPress={() => complete.mutate()}>Готово, протокол подписан</Button>
            <Button variant="soft" icon={ExternalLink} onPress={() => openEgov(started.deeplink)}>Открыть eGov mobile снова</Button>
          </>
        ) : <Button icon={FileSignature} loading={start.isPending} onPress={() => start.mutate()}>Подписать как секретарь</Button>
      )}
      <ErrorNote>{(start.error ?? complete.error)?.message}</ErrorNote>
    </Card>
  )
}
