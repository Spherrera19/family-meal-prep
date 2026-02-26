import React from 'react'
import { Tabs } from 'expo-router'
import { useColorScheme } from '@/components/useColorScheme'
import { useClientOnlyValue } from '@/components/useClientOnlyValue'
import { getTheme } from '@/constants/theme'
import { CustomTabBar } from '@/components/CustomTabBar'

export default function TabLayout() {
  const colorScheme = useColorScheme()
  const c = getTheme(colorScheme)
  const showHeader = useClientOnlyValue(false, true)

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: showHeader,
        headerStyle: { backgroundColor: c.card },
        headerShadowVisible: false,
        headerTitleStyle: {
          color: c.text,
          fontWeight: '600',
          fontSize: 17,
        },
        headerTintColor: c.accent,
      }}
    >
      <Tabs.Screen name="index"     options={{ title: 'Meal Plan'  }} />
      <Tabs.Screen name="shopping"  options={{ title: 'Shopping'   }} />
      <Tabs.Screen name="two"       options={{ title: 'Recipes'    }} />
      <Tabs.Screen name="nutrition" options={{ title: 'Nutrition'  }} />
      <Tabs.Screen name="settings"  options={{ title: 'Settings'   }} />
    </Tabs>
  )
}
