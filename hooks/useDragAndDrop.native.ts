import { useCallback, useRef, useState } from 'react'
import {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { Gesture } from 'react-native-gesture-handler'
import type { Recipe } from './useRecipes'

type Rect = { x: number; y: number; w: number; h: number }

// Card dimensions — must match styles.recipeChip / recipeThumb in index.tsx
const CARD_W = 100
const CARD_H = 110 // image (70) + title area (~40)

export function useDragAndDrop(onDrop: (type: string, recipe: Recipe) => void) {
  const onDropRef = useRef(onDrop)
  onDropRef.current = onDrop

  const dragX       = useSharedValue(0)
  const dragY       = useSharedValue(0)
  const dragScale   = useSharedValue(1)
  const dragOpacity = useSharedValue(0)
  const isActive    = useSharedValue(false)

  // Screen view offset — set once on layout, read inside worklets
  const screenX = useSharedValue(0)
  const screenY = useSharedValue(0)

  const draggedRef  = useRef<Recipe | null>(null)
  const slotRects   = useRef<Record<string, Rect>>({})
  const slotViewRef = useRef<Record<string, any>>({})

  const [draggedRecipe, setDraggedRecipe] = useState<Recipe | null>(null)
  const [hoveredSlot,   setHoveredSlot]   = useState<string | null>(null)

  // Called from index.tsx onLayout to calibrate absolute → relative conversion
  const setScreenOffset = useCallback((pageX: number, pageY: number) => {
    screenX.value = pageX
    screenY.value = pageY
  }, [])

  // ── JS-thread helpers (never called directly inside worklets) ─────────────

  const jsBegin = useCallback((recipe: Recipe) => {
    draggedRef.current = recipe
    setDraggedRecipe(recipe)
  }, [])

  const jsUpdate = useCallback((px: number, py: number) => {
    let found: string | null = null
    for (const [type, r] of Object.entries(slotRects.current)) {
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) { found = type; break }
    }
    setHoveredSlot(found)
  }, [])

  const jsEnd = useCallback((px: number, py: number) => {
    let found: string | null = null
    for (const [type, r] of Object.entries(slotRects.current)) {
      if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) { found = type; break }
    }
    if (found && draggedRef.current) onDropRef.current(found, draggedRef.current)
    draggedRef.current = null
    setDraggedRecipe(null)
    setHoveredSlot(null)
  }, [])

  const jsCancel = useCallback(() => {
    draggedRef.current = null
    setDraggedRecipe(null)
    setHoveredSlot(null)
  }, [])

  // ── Slot measurement ──────────────────────────────────────────────────────

  const measureSlot = useCallback((type: string, ref: any) => {
    if (!ref) return
    ref.measure((_x: number, _y: number, w: number, h: number, pageX: number, pageY: number) => {
      slotRects.current[type] = { x: pageX, y: pageY, w, h }
    })
  }, [])

  // ── Gesture factory ───────────────────────────────────────────────────────

  const makeDragGesture = useCallback((recipe: Recipe) => {
    return Gesture.Pan()
      .activateAfterLongPress(200)
      .activeOffsetY([-10, 10])
      .onBegin((e) => {
        'worklet'
        isActive.value = true
        // Position card so finger is at the center of the image area
        dragX.value = e.absoluteX - screenX.value - CARD_W / 2
        dragY.value = e.absoluteY - screenY.value - CARD_H / 4
        dragScale.value   = withSpring(1.08, { damping: 15 })
        dragOpacity.value = withTiming(1, { duration: 120 })
        runOnJS(jsBegin)(recipe)
      })
      .onUpdate((e) => {
        'worklet'
        dragX.value = e.absoluteX - screenX.value - CARD_W / 2
        dragY.value = e.absoluteY - screenY.value - CARD_H / 4
        runOnJS(jsUpdate)(e.absoluteX, e.absoluteY)
      })
      .onEnd((e) => {
        'worklet'
        isActive.value    = false
        dragOpacity.value = withTiming(0, { duration: 200 })
        dragScale.value   = withSpring(1, { damping: 15 })
        runOnJS(jsEnd)(e.absoluteX, e.absoluteY)
      })
      .onFinalize(() => {
        'worklet'
        if (isActive.value) {
          isActive.value    = false
          dragOpacity.value = withTiming(0, { duration: 100 })
          dragScale.value   = withSpring(1)
          runOnJS(jsCancel)()
        }
      })
  }, [jsBegin, jsUpdate, jsEnd, jsCancel])

  const overlayStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: dragX.value },
      { translateY: dragY.value },
      { scale: dragScale.value },
    ],
    opacity: dragOpacity.value,
  }))

  return {
    draggedRecipe, hoveredSlot, overlayStyle,
    slotViewRef, measureSlot, makeDragGesture, setScreenOffset,
  }
}
