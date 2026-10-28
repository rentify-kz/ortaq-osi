import { ActivityIndicator, View } from 'react-native'
import { Redirect } from 'expo-router'
import { useHouses, useMe, useSession } from '../lib/session'
import { color } from '../theme'
import { ErrorNote } from '../ui/kit'

/**
 * Развилка при запуске: вход → имя → дом → приложение. Каждый шаг онбординга
 * можно прервать и продолжить позже: состояние берётся с сервера, а не из памяти.
 */
export default function Entry() {
  const { status, pendingInvite } = useSession()
  const me = useMe()
  const houses = useHouses()

  if (status === 'signedOut') return <Redirect href="/sign-in" />
  if (status === 'loading' || me.isPending || houses.isPending) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.canvas }}><ActivityIndicator color={color.brand600} /></View>
  }
  if (me.isError || houses.isError) {
    return <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: color.canvas }}><ErrorNote>{(me.error ?? houses.error)?.message}</ErrorNote></View>
  }
  if (!me.data.full_name) return <Redirect href="/name" />
  if (pendingInvite) return <Redirect href={{ pathname: '/join/[token]', params: { token: pendingInvite } }} />
  if (houses.data.length === 0) return <Redirect href="/join" />
  return <Redirect href="/home" />
}
