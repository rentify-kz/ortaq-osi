import { useState } from 'react'
import { Text, TextInput, View, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useMutation } from '@tanstack/react-query'
import { Building2, MessageSquareText } from 'lucide-react-native'
import { normalizeKzPhone } from '@ortaq/shared'
import { api } from '../lib/api'
import { formatPhoneDigits } from '../lib/format'
import { color, font, radius, space, TOUCH } from '../theme'
import { Button, ErrorNote, IconBadge, noWebOutline, Screen, T, Title } from '../ui/kit'

/** Вход и регистрация жильца одним экраном: номер → код из SMS (docs/04 §5.3) */
export default function SignIn() {
  const [digits, setDigits] = useState('')
  const phone = normalizeKzPhone(digits)
  const request = useMutation({
    mutationFn: () => api('/auth/otp/request', { method: 'POST', body: { phone } }),
    onSuccess: () => router.push({ pathname: '/code', params: { phone: phone! } }),
  })

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <IconBadge icon={Building2} tone="brand" />
        <Text style={{ fontFamily: font.display, fontSize: 20, color: color.ink }}>Ortaq</Text>
      </View>
      <View style={{ flex: 1, justifyContent: 'center', gap: space.xl }}>
        <Title sub="Пришлём код в SMS. Пароль не нужен">Вход по номеру телефона</Title>
        <View style={{ gap: 6 }}>
          <Text style={styles.label}>Номер телефона</Text>
          <View style={styles.phone}>
            <Text style={styles.prefix}>+7</Text>
            <TextInput
              accessibilityLabel="Номер телефона"
              value={formatPhoneDigits(digits)}
              onChangeText={(v) => setDigits(v.replace(/\D/g, '').replace(/^[78](?=\d{10})/, '').slice(0, 10))}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              autoComplete="tel"
              placeholder="707 123 45 67"
              placeholderTextColor={color.ink3}
              autoFocus
              style={[styles.phoneInput, noWebOutline]}
              onSubmitEditing={() => phone && request.mutate()}
            />
          </View>
          {digits.length === 10 && !phone && <T size={13} tone="danger">Нужен мобильный номер Казахстана</T>}
        </View>
        <ErrorNote>{request.error?.message}</ErrorNote>
        <Button icon={MessageSquareText} loading={request.isPending} disabled={!phone} onPress={() => request.mutate()}>Получить код</Button>
        <T size={13} tone="ink2">Продолжая, вы соглашаетесь получать SMS с кодом входа. Номер виден только председателю вашего дома</T>
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  label: { fontFamily: font.semibold, fontSize: 13.5, color: color.ink },
  phone: { flexDirection: 'row', alignItems: 'center', minHeight: TOUCH + 8, borderRadius: radius.sm, backgroundColor: color.surface, paddingLeft: space.lg },
  prefix: { fontFamily: font.displayBold, fontSize: 19, color: color.ink2, marginRight: space.sm },
  phoneInput: { flex: 1, minHeight: TOUCH + 8, fontFamily: font.displayBold, fontSize: 19, letterSpacing: 0.5, color: color.ink, paddingRight: space.lg },
})
