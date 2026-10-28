import { useEffect, useRef, useState, type ComponentRef } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Tokens } from '../lib/api'
import { formatPhone } from '../lib/format'
import { useSession } from '../lib/session'
import { color, font, radius, space } from '../theme'
import { Button, ErrorNote, Screen, T, Title } from '../ui/kit'

const LENGTH = 6
const RESEND_S = 60

type Verified = Tokens & { is_new: boolean }

/** Шесть ячеек поверх одного поля: автоподстановка кода из SMS работает как обычно */
export default function Code() {
  const { phone = '' } = useLocalSearchParams<{ phone: string }>()
  const { signIn } = useSession()
  const qc = useQueryClient()
  const input = useRef<ComponentRef<typeof TextInput>>(null)
  const [code, setCode] = useState('')
  const [left, setLeft] = useState(RESEND_S)

  useEffect(() => {
    const t = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [])

  const verify = useMutation({
    mutationFn: (value: string) => api<Verified>('/auth/otp/verify', { method: 'POST', body: { phone, code: value } }),
    onSuccess: async (r) => {
      qc.clear()
      await signIn(r)
      router.replace('/')
    },
    onError: () => setCode(''),
  })
  const resend = useMutation({
    mutationFn: () => api('/auth/otp/request', { method: 'POST', body: { phone } }),
    onSuccess: () => { setLeft(RESEND_S); setCode('') },
  })

  const change = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, LENGTH)
    setCode(d)
    if (d.length === LENGTH) verify.mutate(d)
  }

  return (
    <Screen>
      <Title sub={`Отправили на ${formatPhone(phone)}`}>Код из SMS</Title>
      <Pressable onPress={() => input.current?.focus()} accessibilityLabel="Поле для кода" style={styles.cells}>
        {Array.from({ length: LENGTH }, (_, i) => (
          <View key={i} style={[styles.cell, i === code.length && styles.cellActive]}>
            <Text style={styles.digit}>{code[i] ?? ''}</Text>
          </View>
        ))}
        <TextInput
          ref={input}
          value={code}
          onChangeText={change}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          maxLength={LENGTH}
          autoFocus
          accessibilityLabel="Код из SMS, 6 цифр"
          style={styles.hidden}
        />
      </Pressable>
      <ErrorNote>{verify.error?.message ?? resend.error?.message}</ErrorNote>
      {verify.isPending && <T tone="ink2">Проверяем…</T>}
      <View style={{ gap: space.sm }}>
        <Button variant="soft" disabled={left > 0} loading={resend.isPending} onPress={() => resend.mutate()}>
          {left > 0 ? `Отправить снова через ${left} с` : 'Отправить код снова'}
        </Button>
        <Button variant="ghost" onPress={() => router.back()}>Другой номер</Button>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  cells: { flexDirection: 'row', gap: space.sm, justifyContent: 'space-between' },
  cell: { flex: 1, aspectRatio: 0.85, maxWidth: 56, borderRadius: radius.sm, backgroundColor: color.surface, alignItems: 'center', justifyContent: 'center' },
  cellActive: { backgroundColor: color.brand50 },
  digit: { fontFamily: font.display, fontSize: 26, color: color.ink },
  hidden: { position: 'absolute', opacity: 0, width: 1, height: 1 },
})
