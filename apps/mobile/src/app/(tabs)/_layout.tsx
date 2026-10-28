import { forwardRef, type ComponentRef } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { TabList, TabSlot, TabTrigger, Tabs, type TabListProps, type TabTriggerSlotProps } from 'expo-router/ui'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Building2, House, UserRound, type LucideIcon } from 'lucide-react-native'
import { color, font, MAX_WIDTH, radius, space } from '../../theme'

type TabButtonProps = TabTriggerSlotProps & { icon: LucideIcon; label: string }

/** Активная вкладка — пилюля с подписью, остальные — иконки (как в прототипе) */
const TabButton = forwardRef<ComponentRef<typeof Pressable>, TabButtonProps>(function TabButton({ icon: Icon, label, isFocused, ...props }, ref) {
  return (
    <Pressable
      ref={ref}
      {...props}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!isFocused }}
      aria-selected={!!isFocused}
      style={({ pressed }) => [styles.tab, isFocused ? styles.tabActive : styles.tabIdle, { transform: [{ scale: pressed ? 0.975 : 1 }] }]}
    >
      <Icon size={21} strokeWidth={isFocused ? 2.2 : 1.9} color={isFocused ? color.white : color.ink2} />
      {isFocused && <Text style={styles.tabLabel}>{label}</Text>}
    </Pressable>
  )
})

/** Плавающая панель. Вкладки должны быть прямыми детьми TabList — так их находит навигатор */
function TabBar({ children, style, ...props }: TabListProps) {
  const insets = useSafeAreaInsets()
  return (
    <View {...props} style={StyleSheet.flatten([styles.barWrap, { paddingBottom: Math.max(insets.bottom, space.md) }, style])}>
      <View style={styles.bar}>{children}</View>
    </View>
  )
}

export default function TabsLayout() {
  return (
    <Tabs>
      <TabSlot style={{ flex: 1 }} />
      <TabList asChild>
        <TabBar>
          <TabTrigger name="home" href="/home" asChild><TabButton icon={House} label="Главная" /></TabTrigger>
          <TabTrigger name="house" href="/house" asChild><TabButton icon={Building2} label="Дом" /></TabTrigger>
          <TabTrigger name="profile" href="/profile" asChild><TabButton icon={UserRound} label="Профиль" /></TabTrigger>
        </TabBar>
      </TabList>
    </Tabs>
  )
}

const styles = StyleSheet.create({
  barWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: space.md, alignItems: 'center' },
  bar: {
    width: '100%', maxWidth: MAX_WIDTH, flexDirection: 'row', gap: space.xs, padding: 6, borderRadius: radius.pill,
    // Стеклянная подложка: полупрозрачная поверхность, без тени и рамки
    backgroundColor: 'rgba(255,255,255,0.92)',
  },
  tab: { height: 52, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  tabActive: { backgroundColor: color.brand600, paddingHorizontal: space.xl },
  tabIdle: { flex: 1 },
  tabLabel: { fontFamily: font.semibold, fontSize: 14.5, color: color.white },
})
