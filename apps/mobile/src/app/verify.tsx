import { useState } from 'react'
import { Linking, Platform, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, CircleCheck, Clock, ExternalLink, ShieldCheck } from 'lucide-react-native'
import type { VerificationOutcome, VerificationStatusResponse } from '@ortaq/shared'
import { api, ApiError } from '../lib/api'
import { useHouse } from '../lib/session'
import { color, space } from '../theme'
import { Button, Card, ErrorNote, H2, IconBadge, Screen, T, Title } from '../ui/kit'

/** eGov mobile — отдельное приложение. В веб-сборке его заменяет страница-заглушка: открываем её в новой вкладке, чтобы не потерять эту */
function openEgov(url: string) {
  if (Platform.OS === 'web') {
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  void Linking.openURL(url)
}

type Started = { verification_id: string; qr_url: string; deeplink: string; expires_at: string }
type Result = Extract<VerificationStatusResponse['result'], { units: unknown }>

const OUTCOME: Record<VerificationOutcome, { text: string; done: boolean }> = {
  MATCHED: { text: 'Собственность подтверждена реестром — вы можете голосовать', done: true },
  MOVED: { text: 'В реестре вы записаны собственником этого помещения — подтверждено', done: true },
  NOT_IN_REGISTRY: { text: 'В реестре вас нет. Председатель проверит и подтвердит вручную', done: false },
  NAME_MISMATCH: { text: 'ФИО в реестре отличается от ЭЦП. Председатель проверит', done: false },
  TENANT: { text: 'Проживание нанимателя подтверждает председатель. Голос — у собственника', done: false },
}

/**
 * Подтверждение личности через eGov mobile (docs/04 §7). Жилец подписывает согласие своей ЭЦП
 * и нажимает «Готово». Результат сообщает сервер, проверив подпись сам: клиенту не верим.
 */
export default function Verify() {
  const qc = useQueryClient()
  const house = useHouse()
  // Начатая процедура живёт в адресе экрана: если ОС выгрузит приложение, пока жилец в eGov, «Готово» всё равно сработает
  const params = useLocalSearchParams<{ v?: string; link?: string }>()
  const started = params.v && params.link ? { verification_id: params.v, deeplink: params.link } : null
  const [result, setResult] = useState<Result | null>(null)

  const start = useMutation({
    mutationFn: () => api<Started>('/verification/start', { method: 'POST', body: house ? { house_id: house.id } : {} }),
    onSuccess: async (s) => {
      router.setParams({ v: s.verification_id, link: s.deeplink })
      openEgov(s.deeplink)
    },
  })
  const complete = useMutation({
    mutationFn: () => api<VerificationStatusResponse>(`/verification/${started!.verification_id}/complete`, { method: 'POST' }),
    onSuccess: async (r) => {
      if (r.result && 'units' in r.result) setResult(r.result)
      await Promise.all([qc.invalidateQueries({ queryKey: ['me'] }), qc.invalidateQueries({ queryKey: ['house'] })])
    },
  })
  // «Ещё не подписано» — не ошибка, а подсказка вернуться в eGov
  const notSigned = complete.error instanceof ApiError && complete.error.code === 'VERIFICATION_NOT_SIGNED'

  if (result) {
    return (
      <Screen>
        <IconBadge icon={BadgeCheck} tone="brand" />
        <Title sub={`ИИН ${result.iin_masked}. Согласие на обработку данных подписано вашей ЭЦП`}>{result.full_name}, личность подтверждена</Title>
        {result.units.length > 0 && (
          <Card>
            <H2>Ваши помещения</H2>
            {result.units.map((u) => (
              <View key={`${u.house_id}-${u.unit_number}`} style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
                {OUTCOME[u.outcome].done
                  ? <CircleCheck size={20} strokeWidth={2.2} color={color.brand600} />
                  : <Clock size={20} strokeWidth={2.2} color={color.warning} />}
                <View style={{ flex: 1 }}>
                  <T weight="semibold">кв. {u.unit_number}</T>
                  <T size={14} tone="ink2">{OUTCOME[u.outcome].text}</T>
                </View>
              </View>
            ))}
          </Card>
        )}
        <Button onPress={() => router.replace('/home')}>Готово</Button>
      </Screen>
    )
  }

  return (
    <Screen>
      <IconBadge icon={ShieldCheck} tone="brand" />
      <Title sub="Голосовать могут только собственники с подтверждённой личностью — так требует закон">Подтвердите личность через eGov mobile</Title>
      <Card>
        <Step n={1} text="Откроется eGov mobile с документом — согласием на обработку персональных данных" />
        <Step n={2} text="Подпишите его своей ЭЦП. Мы получим ИИН и ФИО из сертификата, больше ничего" />
        <Step n={3} text="Вернитесь сюда и нажмите «Готово»" />
      </Card>
      <ErrorNote>{start.error?.message ?? (!notSigned ? complete.error?.message : null)}</ErrorNote>
      {notSigned && <Card tone="warning"><T size={14}>Подпись ещё не пришла. Подпишите документ в eGov mobile и нажмите «Готово» снова</T></Card>}
      {started ? (
        <View style={{ gap: space.sm }}>
          <Button loading={complete.isPending} onPress={() => complete.mutate()}>Готово, документ подписан</Button>
          <Button variant="soft" icon={ExternalLink} onPress={() => openEgov(started.deeplink)}>Открыть eGov mobile снова</Button>
        </View>
      ) : (
        <Button icon={ExternalLink} loading={start.isPending} onPress={() => start.mutate()}>Открыть eGov mobile</Button>
      )}
      <Button variant="ghost" onPress={() => router.replace('/home')}>Сделаю позже</Button>
    </Screen>
  )
}

function Step({ n, text }: { n: number; text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: color.brand50, alignItems: 'center', justifyContent: 'center' }}>
        <T size={14} weight="displayBold" tone="brand">{n}</T>
      </View>
      <T size={14.5} style={{ flex: 1 }}>{text}</T>
    </View>
  )
}
