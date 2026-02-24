import { type ReactNode } from 'react'
import { View, type ViewStyle } from 'react-native'

export function GestureRoot({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={style}>{children}</View>
}
