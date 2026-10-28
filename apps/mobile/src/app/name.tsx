import { useState } from 'react'
import { router } from 'expo-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight } from 'lucide-react-native'
import { api, ApiError } from '../lib/api'
import { Button, ErrorNote, Field, Screen, Title } from '../ui/kit'

/** Новый номер — новая учётка без имени: спрашиваем один раз, ЭЦП потом уточнит по сертификату */
export default function Name() {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const save = useMutation({
    mutationFn: () => api('/me', { method: 'PATCH', body: { full_name: name } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['me'] })
      router.replace('/')
    },
  })
  const fieldError = save.error instanceof ApiError ? save.error.fields.full_name : undefined
  return (
    <Screen>
      <Title sub="Так вас увидит председатель дома. После подтверждения через eGov имя возьмём из сертификата">Как вас зовут?</Title>
      <Field label="Фамилия и имя" value={name} onChangeText={setName} autoFocus autoComplete="name" textContentType="name"
        placeholder="Асанов Данияр" error={fieldError} returnKeyType="next" onSubmitEditing={() => save.mutate()} />
      <ErrorNote>{save.error && !fieldError ? save.error.message : null}</ErrorNote>
      <Button icon={ArrowRight} loading={save.isPending} disabled={name.trim().length < 3} onPress={() => save.mutate()}>Дальше</Button>
    </Screen>
  )
}
