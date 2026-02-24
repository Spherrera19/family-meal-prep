import { useRef, useState } from 'react'
import type { Recipe } from './useRecipes'

// Web stub — no gesture handler, no drag overlay
export function useDragAndDrop(_onDrop: (type: string, recipe: Recipe) => void) {
  return {
    draggedRecipe:   null as Recipe | null,
    hoveredSlot:     null as string | null,
    overlayStyle:    {} as any,
    slotViewRef:     useRef<Record<string, any>>({}),
    measureSlot:     (_type: string, _ref: any) => {},
    makeDragGesture: (_recipe: Recipe) => ({} as any),
    setScreenOffset: (_x: number, _y: number) => {},
  }
}
