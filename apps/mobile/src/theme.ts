import { Platform } from 'react-native'

/**
 * Токены приложения жильца. Те же, что в веб-кабинете (apps/web/src/index.css) и прототипе:
 * без рамок и теней, глубина — тональными слоями canvas → surface → surface-2 → surface-3.
 */
export const color = {
  canvas: '#e7ebe8',
  surface: '#ffffff',
  surface2: '#f4f7f5',
  surface3: '#eaf0ec',
  ink: '#0f1711',
  ink2: '#5a6b5f',
  ink3: '#93a398',
  brand50: '#edf7ef',
  brand100: '#d8eedf',
  brand500: '#2e9e5b',
  brand600: '#1f6b3f',
  brand700: '#185231',
  brand800: '#123d25',
  danger: '#dc2626',
  dangerSoft: '#fdeceb',
  warning: '#b45309',
  warningSoft: '#fdf4e7',
  white: '#ffffff',
} as const

/** Manrope — заголовки и цифры, Onest — текст. Загружаются в корневом макете */
export const font = {
  display: 'Manrope_800ExtraBold',
  displayBold: 'Manrope_700Bold',
  body: 'Onest_400Regular',
  medium: 'Onest_500Medium',
  semibold: 'Onest_600SemiBold',
} as const

export const radius = { sm: 14, md: 18, lg: 22, xl: 26, pill: 999 } as const
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const

/** Минимальная зона нажатия: 44 pt по HIG, 48 dp по Material — берём большее */
export const TOUCH = 48

/** Веб-сборка — инструмент разработки: держим ширину телефона, а не растягиваем на монитор */
export const MAX_WIDTH = Platform.OS === 'web' ? 480 : undefined

/** Высота плавающего таб-бара с отступом: экраны вкладок добавляют её снизу, чтобы последний блок не прятался */
export const TAB_BAR_SPACE = 88
