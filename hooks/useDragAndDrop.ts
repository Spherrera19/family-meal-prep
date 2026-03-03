import { useRef, useState } from 'react'
import { useSharedValue } from 'react-native-reanimated'
import type { Recipe } from './useRecipes'

// Web stub — no gesture handler, no drag overlay
export function useDragAndDrop(_onDrop: (type: string, recipe: Recipe) => void, _scrollRef?: any) {
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null) // eslint-disable-line @typescript-eslint/no-unused-vars
  const scrollOffset = useSharedValue(0)

  return {
    draggedRecipe:   null as Recipe | null,
    hoveredSlot,
    overlayStyle:    {} as any,
    slotViewRef:     useRef<Record<string, any>>({}),
    measureSlot:     (_type: string, _ref: any) => {},
    makeDragGesture: (_recipe: Recipe) => ({} as any),
    setScreenOffset: (_x: number, _y: number) => {},
    scrollOffset,
  }
}
