import { useState, type ReactNode } from 'react'
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { LucideIcon } from 'lucide-react-native'
import { Check, CircleAlert } from 'lucide-react-native'
import { color, font, MAX_WIDTH, radius, space, TOUCH } from '../theme'

/*
 * UI-кит приложения жильца. Правила те же, что в кабинете (CLAUDE.md): без рамок и теней,
 * без подъёма при наведении, без капса с разрядкой. Нажатие — лёгкое сжатие.
 */

/* ───────── экран ───────── */

export function Screen({ children, scroll = true, refreshing, onRefresh, bottomInset = 0 }: {
  children: ReactNode; scroll?: boolean; refreshing?: boolean; onRefresh?: () => void; bottomInset?: number
}) {
  const body = <View style={[styles.column, { paddingBottom: space.xxl + bottomInset }]}>{children}</View>
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={color.brand600} /> : undefined}
        >
          {body}
        </ScrollView>
      ) : body}
    </SafeAreaView>
  )
}

/* ───────── текст ───────── */

export function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <Text accessibilityRole="header" style={styles.title}>{children}</Text>
      {sub ? <Text style={styles.sub}>{sub}</Text> : null}
    </View>
  )
}

export function H2({ children }: { children: ReactNode }) {
  return <Text accessibilityRole="header" style={styles.h2}>{children}</Text>
}

export function T({ children, tone = 'ink', size = 15, weight = 'body', style, numberOfLines }: {
  children: ReactNode; tone?: 'ink' | 'ink2' | 'ink3' | 'brand' | 'danger' | 'warning' | 'white'; size?: number
  weight?: keyof typeof font; style?: TextStyle; numberOfLines?: number
}) {
  const c = { ink: color.ink, ink2: color.ink2, ink3: color.ink3, brand: color.brand700, danger: color.danger, warning: color.warning, white: color.white }[tone]
  return <Text numberOfLines={numberOfLines} style={[{ color: c, fontSize: size, lineHeight: Math.round(size * 1.4), fontFamily: font[weight] }, style]}>{children}</Text>
}

/* ───────── кнопки ───────── */

export function Button({ children, onPress, variant = 'solid', icon: Icon, loading, disabled, style }: {
  children: ReactNode; onPress?: () => void; variant?: 'solid' | 'soft' | 'ghost' | 'danger'
  icon?: LucideIcon; loading?: boolean; disabled?: boolean; style?: ViewStyle
}) {
  const off = disabled || loading
  const bg = { solid: color.brand600, soft: color.surface2, ghost: 'transparent', danger: color.dangerSoft }[variant]
  const fg = { solid: color.white, soft: color.ink, ghost: color.ink2, danger: color.danger }[variant]
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: off ? 0.55 : 1, transform: [{ scale: pressed && !off ? 0.975 : 1 }] }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : Icon ? <Icon size={18} strokeWidth={2.1} color={fg} /> : null}
      <Text style={[styles.buttonText, { color: fg }]}>{children}</Text>
    </Pressable>
  )
}

/* ───────── поля: метка всегда над полем ───────── */

/** В браузере у поля своя рамка фокуса; у нас фокус — смена тона, как в кабинете */
export const noWebOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : null

export function Field({ label, hint, error, ...input }: TextInputProps & { label: string; hint?: string; error?: string }) {
  const [focused, setFocused] = useState(false)
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={color.ink3}
        {...input}
        onFocus={(e) => { setFocused(true); input.onFocus?.(e) }}
        onBlur={(e) => { setFocused(false); input.onBlur?.(e) }}
        style={[styles.input, noWebOutline, focused && { backgroundColor: color.brand50 }, error ? { backgroundColor: color.dangerSoft } : null, input.style]}
      />
      {error ? <T size={13} tone="danger">{error}</T> : hint ? <T size={13} tone="ink2">{hint}</T> : null}
    </View>
  )
}

/* ───────── блоки ───────── */

export function Card({ children, tone = 'surface', style }: { children: ReactNode; tone?: 'surface' | 'brand' | 'warning'; style?: ViewStyle }) {
  const bg = { surface: color.surface, brand: color.brand50, warning: color.warningSoft }[tone]
  return <View style={[styles.card, { backgroundColor: bg }, style]}>{children}</View>
}

export function Tag({ children, tone = 'brand' }: { children: ReactNode; tone?: 'brand' | 'warn' | 'mute' }) {
  const bg = { brand: color.brand50, warn: color.warningSoft, mute: color.surface3 }[tone]
  const fg = { brand: color.brand700, warn: color.warning, mute: color.ink2 }[tone]
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontFamily: font.semibold, fontSize: 12.5 }}>{children}</Text>
    </View>
  )
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <View accessibilityRole="alert" style={styles.error}>
      <CircleAlert size={17} strokeWidth={2.2} color={color.danger} />
      <T size={14} tone="danger" style={{ flex: 1 }}>{children}</T>
    </View>
  )
}

export function Empty({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}><Icon size={20} strokeWidth={2} color={color.ink2} /></View>
      <T weight="semibold" style={{ textAlign: 'center' }}>{title}</T>
      <T size={13.5} tone="ink2" style={{ textAlign: 'center' }}>{text}</T>
    </View>
  )
}

/** Скелет на время загрузки: та же форма, что у данных */
export function Skeleton({ rows = 3, height = 64 }: { rows?: number; height?: number }) {
  return (
    <View accessibilityLabel="Загрузка" style={{ gap: space.sm }}>
      {Array.from({ length: rows }, (_, i) => <View key={i} style={{ height, borderRadius: radius.md, backgroundColor: color.surface3 }} />)}
    </View>
  )
}

export function IconBadge({ icon: Icon, tone = 'surface' }: { icon: LucideIcon; tone?: 'surface' | 'brand' }) {
  return (
    <View style={[styles.iconBadge, { backgroundColor: tone === 'brand' ? color.brand600 : color.surface2 }]}>
      <Icon size={20} strokeWidth={2} color={tone === 'brand' ? color.white : color.ink2} />
    </View>
  )
}

/* ───────── выбор ───────── */

export function Segmented<V extends string>({ value, onChange, options, label }: {
  value: V; onChange: (v: V) => void; options: { v: V; label: string }[]; label: string
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.segmented}>
      {options.map((o) => {
        const on = o.v === value
        return (
          <Pressable key={o.v} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => onChange(o.v)}
            style={[styles.segment, on && { backgroundColor: color.brand600 }]}>
            <Text style={{ fontFamily: font.semibold, fontSize: 14.5, color: on ? color.white : color.ink }}>{o.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/** Строка-флажок во всю ширину: попасть пальцем легче, чем в квадратик */
export function CheckRow({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onChange(!checked)} style={styles.checkRow}>
      <View style={[styles.box, checked && { backgroundColor: color.brand600 }]}>
        {checked && <Check size={15} strokeWidth={2.8} color={color.white} />}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  scroll: { flexGrow: 1 },
  column: { flexGrow: 1, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.lg },
  title: { fontFamily: font.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.6, color: color.ink },
  sub: { fontFamily: font.body, fontSize: 15, lineHeight: 21, color: color.ink2 },
  h2: { fontFamily: font.display, fontSize: 19, lineHeight: 24, letterSpacing: -0.2, color: color.ink },
  button: { minHeight: TOUCH, borderRadius: radius.pill, paddingHorizontal: space.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  buttonText: { fontFamily: font.semibold, fontSize: 15.5 },
  label: { fontFamily: font.semibold, fontSize: 13.5, color: color.ink },
  input: { minHeight: TOUCH + 4, borderRadius: radius.sm, backgroundColor: color.surface, paddingHorizontal: space.lg, fontFamily: font.body, fontSize: 16, color: color.ink },
  card: { borderRadius: radius.xl, padding: space.xl, gap: space.md },
  tag: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6 },
  error: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', borderRadius: radius.sm, backgroundColor: color.dangerSoft, paddingHorizontal: space.lg, paddingVertical: space.md },
  empty: { alignItems: 'center', gap: space.sm, borderRadius: radius.lg, backgroundColor: color.surface2, paddingHorizontal: space.xl, paddingVertical: space.xxl },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: color.surface },
  iconBadge: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  segmented: { flexDirection: 'row', borderRadius: radius.pill, backgroundColor: color.surface2, padding: 4 },
  segment: { flex: 1, minHeight: TOUCH - 4, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.md },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, minHeight: TOUCH, paddingVertical: space.sm },
  box: { width: 24, height: 24, marginTop: 1, borderRadius: 8, backgroundColor: color.surface3, alignItems: 'center', justifyContent: 'center' },
})
