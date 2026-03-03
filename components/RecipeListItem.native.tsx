import React, { useMemo } from 'react'
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native'
import Animated, {
  FadeInDown,
  FadeOut,
  LinearTransition,
} from 'react-native-reanimated'
import { GestureDetector } from 'react-native-gesture-handler'
import type { Recipe } from '@/hooks/useRecipes'
import type { AppTheme } from '@/constants/theme'

const CHIP_W = 115

type Props = {
  recipe: Recipe
  isArmed: boolean
  isDragging: boolean
  onTap: () => void
  onRemove?: () => void  // unused on native; drag-to-trash handles removal
  makeDragGesture: (r: Recipe) => any
  c: AppTheme
}

export const RecipeListItem = React.memo(function RecipeListItem({
  recipe, isArmed, isDragging, onTap, makeDragGesture, c,
}: Props) {
  const dragGesture = useMemo(
    () => makeDragGesture(recipe),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recipe.id, makeDragGesture],
  )

  const chipStyle = [
    styles.chip,
    { backgroundColor: c.bg, borderColor: (isArmed || isDragging) ? '#2563eb' : c.border },
    (isArmed || isDragging) && styles.chipArmed,
    isDragging && { opacity: 0.4 },
  ]

  return (
    <GestureDetector gesture={dragGesture}>
      <Animated.View
        entering={FadeInDown.duration(220)}
        exiting={FadeOut.duration(180)}
        layout={LinearTransition.springify()}
        style={styles.outer}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onTap}
          style={chipStyle}
        >
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
        </TouchableOpacity>
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
})
