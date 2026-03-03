import React, { useEffect, useMemo } from 'react'
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native'
import Animated, {
  FadeInDown,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  runOnJS,
} from 'react-native-reanimated'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import * as Haptics from 'expo-haptics'
import type { Recipe } from '@/hooks/useRecipes'
import type { AppTheme } from '@/constants/theme'

const CHIP_W = 100

type Props = {
  recipe: Recipe
  isArmed: boolean
  isDragging: boolean
  isEditingDeck: boolean
  onTap: () => void
  onDelete: () => void
  onLongPress: () => void
  makeDragGesture: (r: Recipe) => any
  c: AppTheme
}

export const RecipeListItem = React.memo(function RecipeListItem({
  recipe, isArmed, isDragging, isEditingDeck, onTap, onDelete, onLongPress, makeDragGesture, c,
}: Props) {
  const dragGesture = useMemo(
    () => makeDragGesture(recipe),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recipe.id, makeDragGesture],
  )

  const fireHapticAndEdit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    onLongPress()
  }

  const longPress = useMemo(
    () => Gesture.LongPress()
      .minDuration(500)
      .onActivated(() => {
        'worklet'
        runOnJS(fireHapticAndEdit)()
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onLongPress],
  )

  // In edit mode use a disabled gesture so GestureDetector stays mounted
  // (keeps Animated.View stable — prevents spurious entering animations)
  const noopGesture = useMemo(() => Gesture.Tap().enabled(false), [])
  const composedGesture = useMemo(
    () => Gesture.Race(longPress, dragGesture),
    [longPress, dragGesture],
  )

  const jiggle = useSharedValue(0)

  useEffect(() => {
    if (isEditingDeck) {
      jiggle.value = withRepeat(
        withSequence(
          withTiming(-2, { duration: 80 }),
          withTiming(2,  { duration: 80 }),
          withTiming(0,  { duration: 80 }),
        ),
        -1,
      )
    } else {
      jiggle.value = withTiming(0, { duration: 100 })
    }
  }, [isEditingDeck, jiggle])

  const jiggleStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${jiggle.value}deg` }],
  }))

  const chipStyle = [
    styles.chip,
    { backgroundColor: c.bg, borderColor: (isArmed || isDragging) ? '#2563eb' : c.border },
    (isArmed || isDragging) && styles.chipArmed,
    isDragging && { opacity: 0.4 },
  ]

  const chipContent = (
    <>
      {recipe.image_url
        ? <Image source={{ uri: recipe.image_url }} style={styles.thumb} />
        : (
          <View style={[styles.thumbPlaceholder, { backgroundColor: c.border }]}>
            <Text style={{ fontSize: 20 }}>🍽️</Text>
          </View>
        )
      }
      <Text style={[styles.title, { color: c.text }]} numberOfLines={3}>
        {recipe.title}
      </Text>
      {(isArmed || isDragging) && <View style={styles.armedDot} />}
    </>
  )

  return (
    <GestureDetector gesture={isEditingDeck ? noopGesture : composedGesture}>
      <Animated.View
        entering={FadeInDown.duration(220)}
        exiting={FadeOut.duration(180)}
        style={[styles.outer, jiggleStyle]}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={isEditingDeck ? undefined : onTap}
          style={chipStyle}
        >
          {chipContent}
        </TouchableOpacity>
        {isEditingDeck && (
          <TouchableOpacity
            onPress={onDelete}
            style={styles.xBadge}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <Text style={styles.xBadgeText}>×</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    </GestureDetector>
  )
})

const styles = StyleSheet.create({
  outer:            { width: CHIP_W },
  chip:             { width: CHIP_W, borderRadius: 12, borderWidth: 1.5, overflow: 'hidden', alignItems: 'center' },
  chipArmed:        { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  thumb:            { width: CHIP_W, height: 70 },
  thumbPlaceholder: { width: CHIP_W, height: 70, justifyContent: 'center', alignItems: 'center' },
  title:            { fontSize: 11, fontWeight: '600', padding: 6, textAlign: 'center', lineHeight: 15, flexShrink: 1 },
  armedDot:         { position: 'absolute', top: 6, right: 6, width: 10, height: 10, borderRadius: 5, backgroundColor: '#2563eb', borderWidth: 2, borderColor: '#fff' },
  xBadge:           { position: 'absolute', top: -6, left: -6, width: 22, height: 22, borderRadius: 11, backgroundColor: '#ef4444', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  xBadgeText:       { color: '#fff', fontSize: 16, fontWeight: '700', lineHeight: 20, marginTop: -1 },
})
