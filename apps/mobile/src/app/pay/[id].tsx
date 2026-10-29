import { useState } from 'react'
import { Linking, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Camera, ExternalLink, Image as ImageIcon, Send } from 'lucide-react-native'
import type { ChargeView, PaymentLinkView, PaymentView } from '@ortaq/shared'
import { api, ApiError } from '../../lib/api'
import { CHARGE_TYPE, money, month } from '../../lib/labels'
import { useHouse } from '../../lib/session'
import { pickPhotos, takePhoto, uploadPhoto, type Picked } from '../../lib/upload'
import { space } from '../../theme'
import { Button, Card, ErrorNote, Field, H2, Screen, Skeleton, T, Title } from '../../ui/kit'
import { LocalPhotos } from '../../ui/photos'

type Mine = { charges: ChargeView[] }

/**
 * Оплата начисления (docs/10 §5): Kaspi по ссылке ОСИ, затем чек. Сумму и номер операции сервер
 * прочитает из чека сам; если не смог — попросит ввести. Решение принимает председатель.
 */
export default function Pay() {
  const { id = '' } = useLocalSearchParams<{ id: string }>()
  const house = useHouse()
  const qc = useQueryClient()
  const [photo, setPhoto] = useState<Picked | null>(null)
  const [amount, setAmount] = useState('')
  const [ref, setRef] = useState('')
  const mine = qc.getQueryData<Mine>(['house', house?.id, 'my-charges'])
  const charge = mine?.charges.find((c) => c.id === id)
  const link = useQuery({ queryKey: ['house', house?.id, 'pay-link', id], queryFn: () => api<PaymentLinkView>(`/houses/${house!.id}/charges/${id}/payment-link`), enabled: !!house, retry: false })
  const pick = useMutation({ mutationFn: async (camera: boolean) => (camera ? takePhoto() : (await pickPhotos(1))[0] ?? null), onSuccess: (p) => p && setPhoto(p) })
  const send = useMutation({
    mutationFn: async () => {
      const fileId = await uploadPhoto(house!.id, photo!, 'PAYMENT_RECEIPT')
      const n = Number(amount.replace(/\s/g, '').replace(',', '.'))
      return api<PaymentView>(`/houses/${house!.id}/charges/${id}/payments`, {
        method: 'POST', body: { file_id: fileId, ...(n > 0 && { amount: n }), ...(ref.trim() && { external_ref: ref.trim() }) },
      })
    },
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: ['house', house?.id, 'my-payments'] }), qc.invalidateQueries({ queryKey: ['house', house?.id, 'my-charges'] })]),
  })
  const fields = send.error instanceof ApiError ? send.error.fields : {}
  const left = charge ? charge.amount - charge.paid_amount : link.data?.amount ?? 0

  if (!house) return <Screen><Skeleton rows={3} /></Screen>
  if (send.data) {
    return (
      <Screen>
        <Title sub="Председатель сверит чек с поступлением на счёт и зачтёт оплату. Придёт уведомление">Чек отправлен</Title>
        <Button onPress={() => router.replace('/payments')}>К оплатам</Button>
      </Screen>
    )
  }
  return (
    <Screen>
      <View style={{ alignItems: 'flex-start' }}><Button variant="soft" icon={ArrowLeft} onPress={() => (router.canGoBack() ? router.back() : router.replace('/payments'))}>Назад</Button></View>
      <Title sub={charge ? `${month(charge.period)} · помещение №${charge.unit.number}` : undefined}>{charge ? CHARGE_TYPE[charge.type] ?? charge.title : 'Оплата'}</Title>
      <Card>
        <T size={13.5} tone="ink2">К оплате</T>
        <T size={30} weight="display">{money(left)}</T>
        {charge && <T size={13.5} tone="ink2">{charge.basis.kind === 'PER_SQM' ? `${charge.basis.area} м² × ${money(charge.basis.rate)}` : 'фиксированная сумма'}{charge.paid_amount > 0 ? ` · уже оплачено ${money(charge.paid_amount)}` : ''}</T>}
      </Card>

      <H2>1. Оплатите в Kaspi</H2>
      {link.isPending ? <Skeleton rows={1} /> : link.data ? (
        <Card>
          <T size={14.5}>Получатель: {link.data.recipient_name}</T>
          <T size={13.5} tone="ink2">Укажите сумму {money(link.data.amount)} и назначение «{link.data.purpose}»</T>
          <Button icon={ExternalLink} onPress={() => void Linking.openURL(link.data!.pay_url)}>Открыть Kaspi</Button>
        </Card>
      ) : <ErrorNote>{link.error?.message}</ErrorNote>}

      <H2>2. Загрузите чек</H2>
      <T size={13.5} tone="ink2">Скриншот или фото чека из Kaspi. Номер операции в чеке защищает от путаницы с чужими оплатами</T>
      {photo ? <LocalPhotos uris={[photo.uri]} onRemove={() => setPhoto(null)} /> : (
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button variant="soft" icon={ImageIcon} loading={pick.isPending && pick.variables === false} onPress={() => pick.mutate(false)} style={{ flex: 1 }}>Из галереи</Button>
          <Button variant="soft" icon={Camera} loading={pick.isPending && pick.variables === true} onPress={() => pick.mutate(true)} style={{ flex: 1 }}>Снять</Button>
        </View>
      )}
      <Field label="Сумма, ₸" hint="Можно не заполнять — прочитаем из чека" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={String(left)} error={fields.amount} />
      <Field label="Номер операции" hint="Из чека: «№ квитанции»" value={ref} onChangeText={setRef} autoCapitalize="characters" error={fields.external_ref} />
      <ErrorNote>{(pick.error ?? (send.error && !Object.keys(fields).length ? send.error : null))?.message}</ErrorNote>
      <Button icon={Send} loading={send.isPending} disabled={!photo} onPress={() => send.mutate()}>Отправить чек</Button>
    </Screen>
  )
}
