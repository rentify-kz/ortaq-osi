import { Linking, Platform } from 'react-native'

/** eGov mobile — отдельное приложение. В веб-сборке его заменяет страница-заглушка: открываем её в новой вкладке, чтобы не потерять эту */
export function openEgov(url: string) {
  if (Platform.OS === 'web') {
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  void Linking.openURL(url)
}
