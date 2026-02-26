import React from 'react'
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native'
import { BlurView } from 'expo-blur'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { FontAwesome } from '@expo/vector-icons'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { useColorScheme } from '@/components/useColorScheme'
import { getTheme } from '@/constants/theme'

// Icon and label for each route in the tab navigator
const ROUTE_META: Record<string, { icon: React.ComponentProps<typeof FontAwesome>['name']; label: string }> = {
  index:     { icon: 'calendar',      label: 'Meal Plan' },
  shopping:  { icon: 'shopping-cart', label: 'Shopping'  },
  two:       { icon: 'book',          label: 'Recipes'   },
  nutrition: { icon: 'heartbeat',     label: 'Nutrition' },
  settings:  { icon: 'cog',          label: 'Settings'  },
}

export function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()
  const colorScheme = useColorScheme()
  const c = getTheme(colorScheme)
  const isDark = colorScheme === 'dark'

  return (
    // outerWrapper matches screen background so the pill appears to float
    <View style={[styles.outerWrapper, {
      paddingBottom: (insets.bottom || 8) + 4,
      backgroundColor: c.bg,
    }]}>
      {/* shadow host — BlurView can't carry shadow on some platforms */}
      <View style={[styles.shadowHost, {
        shadowColor: isDark ? '#000' : '#64748b',
      }]}>
        <BlurView
          tint={isDark ? 'dark' : 'light'}
          intensity={85}
          style={[styles.pill, { borderColor: c.border }]}
        >
          {state.routes.map((route, index) => {
            const isFocused = state.index === index
            const meta = ROUTE_META[route.name]
            const iconName = meta?.icon ?? 'circle'
            const label = meta?.label ?? route.name
            const color = isFocused ? c.accent : c.muted

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              })
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name)
              }
            }

            const onLongPress = () => {
              navigation.emit({ type: 'tabLongPress', target: route.key })
            }

            return (
              <TouchableOpacity
                key={route.key}
                onPress={onPress}
                onLongPress={onLongPress}
                style={styles.tab}
                accessibilityRole="button"
                accessibilityState={{ selected: isFocused }}
                accessibilityLabel={`${label} tab`}
              >
                <FontAwesome name={iconName} size={20} color={color} />
                <Text style={[styles.label, { color }]}>{label}</Text>
                {isFocused && (
                  <View style={[styles.activeDot, { backgroundColor: c.accent }]} />
                )}
              </TouchableOpacity>
            )
          })}
        </BlurView>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  outerWrapper: {
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  shadowHost: {
    borderRadius: 22,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  pill: {
    flexDirection: 'row',
    height: 64,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
    paddingBottom: 8,
    gap: 3,
  },
  label: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  activeDot: {
    position: 'absolute',
    bottom: 6,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
})
