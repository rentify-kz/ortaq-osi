import { useEffect } from 'react'
import { Stack } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope'
import { Onest_400Regular, Onest_500Medium, Onest_600SemiBold } from '@expo-google-fonts/onest'
import { useFonts } from 'expo-font'
import { ApiError } from '../lib/api'
import { SessionProvider } from '../lib/session'
import { color } from '../theme'

void SplashScreen.preventAutoHideAsync()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 4xx — ответ, а не сбой: повторять бессмысленно
      retry: (count, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && count < 2,
    },
  },
})

export default function RootLayout() {
  const [loaded, failed] = useFonts({ Manrope_700Bold, Manrope_800ExtraBold, Onest_400Regular, Onest_500Medium, Onest_600SemiBold })

  useEffect(() => {
    // Шрифты не загрузились — показываем системные, но не держим заставку вечно
    if (loaded || failed) void SplashScreen.hideAsync()
  }, [loaded, failed])

  if (!loaded && !failed) return null
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.canvas } }} />
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}
