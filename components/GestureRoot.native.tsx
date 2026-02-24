import { type ReactNode } from 'react'
import { type ViewStyle } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'

export function GestureRoot({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <GestureHandlerRootView style={style}>{children}</GestureHandlerRootView>
}
