import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native'
import Animated from 'react-native-reanimated'
import { FontAwesome } from '@expo/vector-icons'
import { useMealPlan } from '@/hooks/useMealPlan'
import { useRecipes, type Recipe } from '@/hooks/useRecipes'
import { useFamily } from '@/hooks/useFamily'
import { useDragAndDrop } from '@/hooks/useDragAndDrop'
import { useUserProfile } from '@/hooks/useUserProfile'
import { getDayNutrition } from '@/utils/nutrition'
import { DragGestureWrap } from '@/components/DragGestureWrap'

// ─── Slot config & helpers ────────────────────────────────────────────────────

type SlotConfig = { type: string; label: string; icon: string; color: string; light: string }

// Context-driven icon + colour based on slot name
function getSlotStyle(name: string): { icon: string; color: string; light: string } {
  const t = name.toLowerCase()
  if (t.includes('breakfast'))                          return { icon: '🌅', color: '#f59e0b', light: '#fef3c7' }
  if (t.includes('lunch'))                              return { icon: '☀️',  color: '#10b981', light: '#d1fae5' }
  if (t.includes('dinner') || t.includes('supper'))    return { icon: '🌙', color: '#6366f1', light: '#ede9fe' }
  if (t.includes('brunch'))                            return { icon: '🥞', color: '#f97316', light: '#ffedd5' }
  if (t.includes('morning'))                           return { icon: '🌄', color: '#f59e0b', light: '#fef3c7' }
  if (t.includes('afternoon'))                         return { icon: '🌤️', color: '#10b981', light: '#d1fae5' }
  if (t.includes('evening') || t.includes('night'))   return { icon: '🌆', color: '#6366f1', light: '#ede9fe' }
  if (t.includes('snack'))                             return { icon: '🍎', color: '#ec4899', light: '#fce7f3' }
  if (t.includes('dessert') || t.includes('sweet'))   return { icon: '🍰', color: '#f97316', light: '#ffedd5' }
  if (t.includes('coffee') || t.includes('cafe'))     return { icon: '☕', color: '#92400e', light: '#fef3c7' }
  if (t.includes('tea'))                               return { icon: '🍵', color: '#10b981', light: '#d1fae5' }
  if (t.includes('drink') || t.includes('smoothie') || t.includes('juice')) return { icon: '🥤', color: '#0ea5e9', light: '#e0f2fe' }
  if (t.includes('soup') || t.includes('stew'))       return { icon: '🍲', color: '#f97316', light: '#ffedd5' }
  if (t.includes('salad'))                             return { icon: '🥗', color: '#10b981', light: '#d1fae5' }
  if (t.includes('protein') || t.includes('meat'))    return { icon: '🥩', color: '#ef4444', light: '#fee2e2' }
  if (t.includes('fish') || t.includes('seafood'))    return { icon: '🐟', color: '#0ea5e9', light: '#e0f2fe' }
  if (t.includes('veggie') || t.includes('vegan'))    return { icon: '🥦', color: '#10b981', light: '#d1fae5' }
  if (t.includes('pizza'))                             return { icon: '🍕', color: '#ef4444', light: '#fee2e2' }
  if (t.includes('burger') || t.includes('sandwich')) return { icon: '🥪', color: '#f59e0b', light: '#fef3c7' }
  if (t.includes('pasta') || t.includes('noodle'))    return { icon: '🍝', color: '#f97316', light: '#ffedd5' }
  if (t.includes('taco') || t.includes('mexican'))    return { icon: '🌮', color: '#ec4899', light: '#fce7f3' }
  if (t.includes('curry'))                             return { icon: '🍛', color: '#f59e0b', light: '#fef3c7' }
  // fallback — derive a consistent colour from the name
  const PALETTE = [
    { color: '#ec4899', light: '#fce7f3' }, { color: '#0ea5e9', light: '#e0f2fe' },
    { color: '#f97316', light: '#ffedd5' }, { color: '#14b8a6', light: '#ccfbf1' },
    { color: '#8b5cf6', light: '#f3e8ff' },
  ]
  const col = PALETTE[name.charCodeAt(0) % PALETTE.length]
  return { icon: '🍽️', color: col.color, light: col.light }
}

function makeSlot(type: string): SlotConfig {
  const style = getSlotStyle(type)
  return { type, label: type.charAt(0).toUpperCase() + type.slice(1), ...style }
}

// Templates shown in the "add slot" modal
const TEMPLATES: SlotConfig[] = [
  'breakfast', 'lunch', 'dinner', 'brunch',
  'morning snack', 'afternoon snack', 'dessert', 'coffee',
].map(makeSlot)

const DEFAULT_SLOTS = TEMPLATES.slice(0, 3) // breakfast, lunch, dinner

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DAY_LABELS  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

function toKey(d: Date) { return d.toISOString().split('T')[0] }
function getWeekDates(anchor: Date): Date[] {
  const mon = new Date(anchor)
  const day = mon.getDay()
  mon.setDate(mon.getDate() + (day === 0 ? -6 : 1 - day))
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d })
}

// ─── Theme ────────────────────────────────────────────────────────────────────

const LIGHT = { bg: '#f8fafc', card: '#fff',    text: '#0f172a', muted: '#94a3b8', border: '#e2e8f0' }
const DARK  = { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', muted: '#64748b', border: '#334155' }

// ─── RecipeChip — memoised to avoid recreating gesture every render ───────────

type ChipProps = {
  recipe: Recipe
  isArmed: boolean
  isDragging: boolean
  onTap: () => void
  makeDragGesture: (r: Recipe) => any
  c: typeof LIGHT
}

const RecipeChip = React.memo(function RecipeChip({ recipe, isArmed, isDragging, onTap, makeDragGesture, c }: ChipProps) {
  // Gesture is stable as long as recipe.id and makeDragGesture don't change
  const gesture = useMemo(() => makeDragGesture(recipe), [recipe.id, makeDragGesture])
  return (
    <DragGestureWrap gesture={gesture}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onTap}
        style={[
          styles.recipeChip,
          { backgroundColor: c.bg, borderColor: (isArmed || isDragging) ? '#2563eb' : c.border },
          (isArmed || isDragging) && styles.recipeChipArmed,
          isDragging && { opacity: 0.4 },
        ]}
      >
        {recipe.image_url
          ? <Image source={{ uri: recipe.image_url }} style={styles.recipeThumb} />
          : <View style={[styles.recipeThumbPlaceholder, { backgroundColor: c.border }]}><Text style={{ fontSize: 20 }}>🍽️</Text></View>
        }
        <Text style={[styles.recipeChipTitle, { color: c.text }]} numberOfLines={2}>{recipe.title}</Text>
        {(isArmed || isDragging) && <View style={styles.armedDot} />}
      </TouchableOpacity>
    </DragGestureWrap>
  )
})

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function MealPlanScreen() {
  const c = useColorScheme() === 'dark' ? DARK : LIGHT

  const today = new Date()
  const [weekAnchor, setWeekAnchor]     = useState(today)
  const [selectedDate, setSelectedDate] = useState(today)

  const weekDates   = getWeekDates(weekAnchor)
  const startDate   = toKey(weekDates[0])
  const endDate     = toKey(weekDates[6])
  const selectedKey = toKey(selectedDate)

  // Keep selectedKey in a ref so drag callbacks always see the current day
  const selectedKeyRef = useRef(selectedKey)
  useEffect(() => { selectedKeyRef.current = selectedKey }, [selectedKey])

  const { plan, loading, saving, error, saveMeal, deleteMeal } = useMealPlan(startDate, endDate)
  const { family }  = useFamily()
  const { recipes } = useRecipes(family?.id ?? null)
  const { profile } = useUserProfile()

  // Fully-customisable slot list — start with defaults, user can delete any
  const [slots, setSlots] = useState<SlotConfig[]>(DEFAULT_SLOTS)

  // Arm-and-place (web + native tap fallback)
  const [armedRecipe, setArmedRecipe] = useState<Recipe | null>(null)

  // Modals
  const [mealModal,   setMealModal]   = useState(false)
  const [editingSlot, setEditingSlot] = useState<string | null>(null)
  const [mealInput,   setMealInput]   = useState('')
  const [noteInput,   setNoteInput]   = useState('')
  const [slotModal,   setSlotModal]   = useState(false)
  const [slotInput,   setSlotInput]   = useState('')

  const dayPlan = plan[selectedKey] ?? {}

  // Sync: if the DB has meals for slot types not currently visible, reveal them
  useEffect(() => {
    setSlots(prev => {
      const existing = new Set(prev.map(s => s.type))
      const extras   = Object.keys(dayPlan).filter(t => !existing.has(t))
      if (!extras.length) return prev
      return [...prev, ...extras.map(makeSlot)]
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, plan])

  // Native drag-and-drop
  const handleDrop = useCallback((type: string, recipe: Recipe) => {
    saveMeal(selectedKeyRef.current, type, recipe.title)
  }, [saveMeal])

  const { draggedRecipe, hoveredSlot, overlayStyle, slotViewRef, measureSlot, makeDragGesture, setScreenOffset } =
    useDragAndDrop(handleDrop)

  // ── Week ──────────────────────────────────────────────────────────────────

  function shiftWeek(delta: number) {
    const next = new Date(weekAnchor)
    next.setDate(next.getDate() + delta * 7)
    setWeekAnchor(next)
  }

  // ── Slot actions ──────────────────────────────────────────────────────────

  function openMealModal(type: string) {
    setEditingSlot(type)
    setMealInput(dayPlan[type]?.name ?? '')
    setNoteInput(dayPlan[type]?.note ?? '')
    setMealModal(true)
  }

  async function saveManual() {
    if (!editingSlot || !mealInput.trim()) return
    await saveMeal(selectedKey, editingSlot, mealInput.trim(), noteInput.trim() || undefined)
    setMealModal(false)
  }

  async function removeSlot(type: string) {
    if (dayPlan[type]) await deleteMeal(selectedKey, type)
    setSlots(prev => prev.filter(s => s.type !== type))
  }

  function addSlot(slot: SlotConfig) {
    if (slots.some(s => s.type === slot.type)) return
    setSlots(prev => [...prev, slot])
    setSlotModal(false)
  }

  function addCustomSlot() {
    const name = slotInput.trim().toLowerCase()
    if (!name) return
    addSlot(makeSlot(name))
    setSlotInput('')
  }

  function handleSlotPress(type: string) {
    if (armedRecipe) {
      saveMeal(selectedKey, type, armedRecipe.title)
      setArmedRecipe(null)
    } else {
      openMealModal(type)
    }
  }

  // Templates not already in the slot list
  const availableTemplates = TEMPLATES.filter(t => !slots.some(s => s.type === t.type))

  const weekLabel = (() => {
    const f = weekDates[0], l = weekDates[6]
    return f.getMonth() === l.getMonth()
      ? `${MONTH_NAMES[f.getMonth()]} ${f.getFullYear()}`
      : `${MONTH_NAMES[f.getMonth()]} – ${MONTH_NAMES[l.getMonth()]} ${l.getFullYear()}`
  })()

  const selectedDayLabel = selectedDate.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  return (
    <View
      style={[styles.screen, { backgroundColor: c.bg }]}
      ref={(r: any) => {
        if (r) r.measure(
          (_x: number, _y: number, _w: number, _h: number, pageX: number, pageY: number) =>
            setScreenOffset(pageX, pageY)
        )
      }}
    >

      {/* ── Week navigator ─────────────────────────────────────────── */}
      <View style={[styles.weekNav, { backgroundColor: c.card, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => shiftWeek(-1)} style={styles.navBtn}>
          <FontAwesome name="chevron-left" size={14} color={c.muted} />
        </TouchableOpacity>
        <Text style={[styles.weekLabel, { color: c.text }]}>{weekLabel}</Text>
        <TouchableOpacity onPress={() => shiftWeek(1)} style={styles.navBtn}>
          <FontAwesome name="chevron-right" size={14} color={c.muted} />
        </TouchableOpacity>
      </View>

      {/* ── Day strip ──────────────────────────────────────────────── */}
      <View style={[styles.dayStrip, { backgroundColor: c.card, borderBottomColor: c.border }]}>
        {weekDates.map((date, i) => {
          const key = toKey(date), isSel = key === selectedKey, isToday = key === toKey(today)
          const hasMeals = !!plan[key] && Object.keys(plan[key]).length > 0
          return (
            <TouchableOpacity
              key={key}
              onPress={() => { setSelectedDate(date); setArmedRecipe(null) }}
              style={[styles.dayItem, isSel && { backgroundColor: '#2563eb', borderRadius: 12 }]}
            >
              <Text style={[styles.dayName, { color: isSel ? '#fff' : c.muted }]}>{DAY_LABELS[i]}</Text>
              <Text style={[styles.dayNum,  { color: isSel ? '#fff' : isToday ? '#2563eb' : c.text }]}>{date.getDate()}</Text>
              {hasMeals && <View style={[styles.dot, { backgroundColor: isSel ? '#fff' : '#2563eb' }]} />}
            </TouchableOpacity>
          )
        })}
      </View>

      {/* ── Day header ─────────────────────────────────────────────── */}
      <View style={styles.dayHeader}>
        <Text style={[styles.dayHeaderText, { color: c.text }]}>{selectedDayLabel}</Text>
        {selectedKey === toKey(today) && (
          <View style={styles.todayBadge}><Text style={styles.todayBadgeText}>Today</Text></View>
        )}
        {loading && <ActivityIndicator size="small" color="#2563eb" style={{ marginLeft: 8 }} />}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {/* ── Daily macro summary bar ─────────────────────────────────── */}
      {(() => {
        const dayNutrition = getDayNutrition(dayPlan, recipes)
        const hasData = dayNutrition.calories > 0 || dayNutrition.protein_g > 0
        const macros = [
          { label: 'Cal',     icon: '🔥', value: dayNutrition.calories,  goal: profile.daily_calories,  unit: '' },
          { label: 'Protein', icon: '💪', value: dayNutrition.protein_g, goal: profile.daily_protein_g, unit: 'g' },
          { label: 'Carbs',   icon: '🌾', value: dayNutrition.carbs_g,   goal: profile.daily_carbs_g,   unit: 'g' },
          { label: 'Fat',     icon: '🫙', value: dayNutrition.fat_g,     goal: profile.daily_fat_g,     unit: 'g' },
        ]
        return (
          <View style={[styles.macroBar, { backgroundColor: c.card, borderBottomColor: c.border }]}>
            {macros.map(m => {
              const pct = m.goal > 0 ? Math.min(m.value / m.goal, 1) : 0
              return (
                <View key={m.label} style={styles.macroCard}>
                  <Text style={styles.macroIcon}>{m.icon}</Text>
                  <Text style={[styles.macroLabel, { color: c.muted }]}>{m.label}</Text>
                  <Text style={[styles.macroValue, { color: c.text }]}>
                    {hasData ? `${m.value}${m.unit}` : '–'}
                    {hasData ? <Text style={[styles.macroGoal, { color: c.muted }]}>/{m.goal}{m.unit}</Text> : null}
                  </Text>
                  <View style={[styles.macroBarBg, { backgroundColor: c.border }]}>
                    <View style={[styles.macroBarFill, { width: `${pct * 100}%` as any, backgroundColor: pct >= 1 ? '#10b981' : '#2563eb' }]} />
                  </View>
                </View>
              )
            })}
          </View>
        )
      })()}

      {/* ── Armed banner ───────────────────────────────────────────── */}
      {armedRecipe && (
        <View style={styles.armedBanner}>
          <FontAwesome name="hand-o-up" size={14} color="#fff" />
          <Text style={styles.armedText} numberOfLines={1}>Tap a slot · "{armedRecipe.title}"</Text>
          <TouchableOpacity onPress={() => setArmedRecipe(null)}>
            <FontAwesome name="times" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Meal slots ─────────────────────────────────────────────── */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.slotsContainer} showsVerticalScrollIndicator={false}>
        {slots.map(slot => {
          const meal      = dayPlan[slot.type]
          const isHovered = hoveredSlot === slot.type
          const isArmed   = !!armedRecipe
          return (
            <TouchableOpacity
              key={slot.type}
              activeOpacity={0.8}
              onPress={() => handleSlotPress(slot.type)}
              ref={r => { slotViewRef.current[slot.type] = r }}
              onLayout={() => measureSlot(slot.type, slotViewRef.current[slot.type])}
              style={[
                styles.slotCard,
                { backgroundColor: isHovered ? '#eff6ff' : c.card,
                  borderColor: (isHovered || (isArmed && !meal)) ? '#2563eb' : c.border },
                (isHovered || (isArmed && !meal)) && styles.slotHighlight,
              ]}
            >
              <View style={styles.slotHeader}>
                <View style={[styles.slotBadge, { backgroundColor: slot.light }]}>
                  <Text style={styles.slotIcon}>{slot.icon}</Text>
                  <Text style={[styles.slotLabel, { color: slot.color }]}>{slot.label}</Text>
                </View>
                <View style={styles.slotActions}>
                  <TouchableOpacity onPress={e => { e.stopPropagation?.(); openMealModal(slot.type) }} style={styles.iconBtn}>
                    <FontAwesome name={meal ? 'pencil' : 'plus'} size={13} color={meal ? c.muted : '#2563eb'} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={e => { e.stopPropagation?.(); removeSlot(slot.type) }} style={styles.iconBtn}>
                    <FontAwesome name="trash-o" size={13} color={c.muted} />
                  </TouchableOpacity>
                </View>
              </View>
              {meal ? (
                <View>
                  <Text style={[styles.mealName, { color: c.text }]}>{meal.name}</Text>
                  {meal.note ? <Text style={[styles.mealNote, { color: c.muted }]}>{meal.note}</Text> : null}
                  {(() => {
                    if (!meal.recipe_id) return null
                    const r = recipes.find(rc => rc.id === meal.recipe_id)
                    if (!r || (r.calories == null && r.protein_g == null && r.carbs_g == null && r.fat_g == null)) return null
                    return (
                      <Text style={[styles.mealMacros, { color: c.muted }]}>
                        {r.calories != null ? `🔥 ${r.calories} cal  ` : ''}
                        {r.protein_g != null ? `💪 ${r.protein_g}g  ` : ''}
                        {r.carbs_g != null ? `🌾 ${r.carbs_g}g  ` : ''}
                        {r.fat_g != null ? `🫙 ${r.fat_g}g` : ''}
                      </Text>
                    )
                  })()}
                </View>
              ) : (
                <Text style={[styles.emptySlot, { color: (isHovered || isArmed) ? '#2563eb' : c.muted }]}>
                  {isHovered ? '↓ Drop here' : isArmed ? '↑ Tap to place' : `+ Add ${slot.label.toLowerCase()}`}
                </Text>
              )}
            </TouchableOpacity>
          )
        })}

        <TouchableOpacity style={[styles.addSlotBtn, { borderColor: c.border }]} onPress={() => setSlotModal(true)}>
          <FontAwesome name="plus" size={13} color={c.muted} />
          <Text style={[styles.addSlotText, { color: c.muted }]}>Add meal or snack</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Recipe tray ────────────────────────────────────────────── */}
      <View style={[styles.tray, { backgroundColor: c.card, borderTopColor: c.border }]}>
        <View style={styles.trayHeader}>
          <Text style={[styles.trayTitle, { color: c.muted }]}>RECIPES</Text>
          <Text style={[styles.trayHint, { color: c.muted }]}>
            {Platform.OS !== 'web' ? 'hold & drag · or tap to arm' : 'tap to arm · then tap a slot'}
          </Text>
        </View>
        {recipes.length === 0 ? (
          <View style={styles.trayEmpty}>
            <Text style={[styles.trayEmptyText, { color: c.muted }]}>Import recipes from the Recipes tab.</Text>
          </View>
        ) : (
          <FlatList
            horizontal
            data={recipes}
            keyExtractor={r => r.id}
            contentContainerStyle={styles.trayList}
            showsHorizontalScrollIndicator={false}
            scrollEnabled={!draggedRecipe}
            renderItem={({ item: recipe }) => (
              <RecipeChip
                recipe={recipe}
                isArmed={armedRecipe?.id === recipe.id}
                isDragging={draggedRecipe?.id === recipe.id}
                onTap={() => setArmedRecipe(prev => prev?.id === recipe.id ? null : recipe)}
                makeDragGesture={makeDragGesture}
                c={c}
              />
            )}
          />
        )}
      </View>

      {/* ── Drag overlay (native only) ──────────────────────────────── */}
      {Platform.OS !== 'web' && draggedRecipe && (
        <Animated.View style={[styles.dragOverlay, overlayStyle]} pointerEvents="none">
          {draggedRecipe.image_url
            ? <Image source={{ uri: draggedRecipe.image_url }} style={styles.recipeThumb} />
            : <View style={[styles.recipeThumbPlaceholder, { backgroundColor: '#e2e8f0' }]}><Text style={{ fontSize: 20 }}>🍽️</Text></View>
          }
          <Text style={[styles.recipeChipTitle, { color: c.text }]} numberOfLines={2}>{draggedRecipe.title}</Text>
        </Animated.View>
      )}

      {/* ── Manual entry modal ─────────────────────────────────────── */}
      <Modal visible={mealModal} transparent animationType="slide" onRequestClose={() => setMealModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setMealModal(false)}>
          <Pressable style={[styles.modalSheet, { backgroundColor: c.card }]} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: c.text }]}>
              {dayPlan[editingSlot ?? ''] ? 'Edit' : 'Add'}{' '}
              {slots.find(s => s.type === editingSlot)?.label ?? editingSlot}
            </Text>
            <TextInput
              style={[styles.modalInput, { borderColor: c.border, color: c.text, backgroundColor: c.bg }]}
              placeholder="Meal name" placeholderTextColor={c.muted}
              value={mealInput} onChangeText={setMealInput} autoFocus
            />
            <TextInput
              style={[styles.modalInput, { borderColor: c.border, color: c.text, backgroundColor: c.bg }]}
              placeholder="Note (optional)" placeholderTextColor={c.muted}
              value={noteInput} onChangeText={setNoteInput}
            />
            <TouchableOpacity
              style={[styles.saveBtn, (!mealInput.trim() || saving) && { opacity: 0.4 }]}
              onPress={saveManual} disabled={!mealInput.trim() || saving}
            >
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save</Text>}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Add slot modal ─────────────────────────────────────────── */}
      <Modal visible={slotModal} transparent animationType="slide" onRequestClose={() => setSlotModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setSlotModal(false)}>
          <Pressable style={[styles.modalSheet, { backgroundColor: c.card }]} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: c.text }]}>Add meal or snack</Text>

            {/* Template quick-add */}
            {availableTemplates.length > 0 && (
              <>
                <Text style={[styles.slotSectionLabel, { color: c.muted }]}>QUICK ADD</Text>
                <View style={styles.templateGrid}>
                  {availableTemplates.map(t => (
                    <TouchableOpacity
                      key={t.type}
                      onPress={() => addSlot(t)}
                      style={[styles.templateBtn, { backgroundColor: t.light, borderColor: t.light }]}
                    >
                      <Text style={styles.templateIcon}>{t.icon}</Text>
                      <Text style={[styles.templateLabel, { color: t.color }]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Custom name */}
            <Text style={[styles.slotSectionLabel, { color: c.muted }]}>CUSTOM</Text>
            <TextInput
              style={[styles.modalInput, { borderColor: c.border, color: c.text, backgroundColor: c.bg }]}
              placeholder="e.g. Pre-workout, Second breakfast…"
              placeholderTextColor={c.muted}
              value={slotInput} onChangeText={setSlotInput}
              autoFocus={availableTemplates.length === 0}
              onSubmitEditing={addCustomSlot}
            />
            <TouchableOpacity
              style={[styles.saveBtn, !slotInput.trim() && { opacity: 0.4 }]}
              onPress={addCustomSlot} disabled={!slotInput.trim()}
            >
              <Text style={styles.saveBtnText}>Add slot</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen:   { flex: 1 },
  weekNav:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1 },
  navBtn:   { padding: 8 },
  weekLabel:{ fontSize: 15, fontWeight: '600' },

  dayStrip: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 8, paddingVertical: 10, borderBottomWidth: 1 },
  dayItem:  { alignItems: 'center', paddingVertical: 6, paddingHorizontal: 8, minWidth: 40 },
  dayName:  { fontSize: 11, fontWeight: '500', marginBottom: 4 },
  dayNum:   { fontSize: 16, fontWeight: '700' },
  dot:      { width: 4, height: 4, borderRadius: 2, marginTop: 3 },

  dayHeader:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 6 },
  dayHeaderText: { fontSize: 17, fontWeight: '700' },
  todayBadge:    { backgroundColor: '#dbeafe', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  todayBadgeText:{ color: '#2563eb', fontSize: 12, fontWeight: '600' },
  errorText:     { fontSize: 13, paddingHorizontal: 20, paddingBottom: 4, color: '#ef4444' },

  armedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#2563eb', paddingHorizontal: 16, paddingVertical: 10 },
  armedText:   { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },

  slotsContainer: { padding: 12, gap: 10, paddingBottom: 4 },
  slotCard:       { borderRadius: 14, borderWidth: 1.5, padding: 14 },
  slotHighlight:  { borderStyle: 'dashed' },
  slotHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  slotBadge:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  slotIcon:       { fontSize: 14 },
  slotLabel:      { fontSize: 13, fontWeight: '700' },
  slotActions:    { flexDirection: 'row', gap: 4 },
  iconBtn:        { padding: 6 },
  mealName:       { fontSize: 16, fontWeight: '600' },
  mealNote:       { fontSize: 13, marginTop: 2 },
  mealMacros:     { fontSize: 12, marginTop: 4 },
  emptySlot:      { fontSize: 14 },

  macroBar:     { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 8, paddingVertical: 8, gap: 6 },
  macroCard:    { flex: 1, alignItems: 'center', gap: 2 },
  macroIcon:    { fontSize: 14 },
  macroLabel:   { fontSize: 9, fontWeight: '600', letterSpacing: 0.5 },
  macroValue:   { fontSize: 11, fontWeight: '700' },
  macroGoal:    { fontSize: 10, fontWeight: '400' },
  macroBarBg:   { width: '100%', height: 3, borderRadius: 2, overflow: 'hidden' },
  macroBarFill: { height: 3, borderRadius: 2 },

  addSlotBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 14, paddingVertical: 14, marginBottom: 12 },
  addSlotText: { fontSize: 14, fontWeight: '500' },

  tray:          { borderTopWidth: 1, paddingTop: 10, paddingBottom: 12 },
  trayHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8 },
  trayTitle:     { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  trayHint:      { fontSize: 11 },
  trayEmpty:     { paddingHorizontal: 16, paddingBottom: 4 },
  trayEmptyText: { fontSize: 13 },
  trayList:      { paddingHorizontal: 12, gap: 10 },

  recipeChip:            { width: 100, borderRadius: 12, borderWidth: 1.5, overflow: 'hidden', alignItems: 'center' },
  recipeChipArmed:       { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  recipeThumb:           { width: 100, height: 70 },
  recipeThumbPlaceholder:{ width: 100, height: 70, justifyContent: 'center', alignItems: 'center' },
  recipeChipTitle:       { fontSize: 11, fontWeight: '600', padding: 6, textAlign: 'center', lineHeight: 15 },
  armedDot:              { position: 'absolute', top: 6, right: 6, width: 10, height: 10, borderRadius: 5, backgroundColor: '#2563eb', borderWidth: 2, borderColor: '#fff' },

  dragOverlay: { position: 'absolute', width: 100, borderRadius: 12, borderWidth: 2, borderColor: '#2563eb', backgroundColor: '#eff6ff', overflow: 'hidden', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 12 },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet:   { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, gap: 12 },
  modalHandle:  { width: 36, height: 4, borderRadius: 2, backgroundColor: '#cbd5e1', alignSelf: 'center', marginBottom: 8 },
  modalTitle:   { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  modalInput:   { borderWidth: 1, borderRadius: 10, padding: 14, fontSize: 16 },
  saveBtn:      { backgroundColor: '#2563eb', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 4 },
  saveBtnText:  { color: '#fff', fontSize: 16, fontWeight: '700' },

  slotSectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginTop: 4 },
  templateGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  templateBtn:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  templateIcon:     { fontSize: 16 },
  templateLabel:    { fontSize: 13, fontWeight: '600' },
})
