import { type ReactNode } from 'react'
import { GestureDetector, type ComposedGesture, type GestureType } from 'react-native-gesture-handler'

export function DragGestureWrap({ gesture, children }: { gesture: GestureType | ComposedGesture; children: ReactNode }) {
  return <GestureDetector gesture={gesture}>{children}</GestureDetector>
}
