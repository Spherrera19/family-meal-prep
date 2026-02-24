import { useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native'
import { FontAwesome } from '@expo/vector-icons'
import { useMealPlan, type MealType } from '@/hooks/useMealPlan'

// ─── Constants ────────────────────────────────────────────────────────────────

const MEAL_SLOTS: { type: MealType; label: string; icon: string; color: string; light: string }[] = [
  { type: 'breakfast', label: 'Breakfast', icon: '🌅', color: '#f59e0b', light: '#fef3c7' },
  { type: 'lunch',     label: 'Lunch',     icon: '☀️',  color: '#10b981', light: '#d1fae5' },
  { type: 'dinner',    label: 'Dinner',    icon: '🌙',  color: '#6366f1', light: '#ede9fe' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toKey(date: Date) {
  return date.toISOString().split('T')[0]
}

function getWeekDates(anchor: Date): Date[] {
  const monday = new Date(anchor)
  const day = monday.getDay()
  const diff = (day === 0 ? -6 : 1 - day)
  monday.setDate(monday.getDate() + diff)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function MealPlanScreen() {
  const scheme = useColorScheme()
  const dark = scheme === 'dark'
  const c = dark ? DARK : LIGHT

  const today = new Date()
  const [weekAnchor, setWeekAnchor] = useState(today)
  const [selectedDate, setSelectedDate] = useState(today)

  const weekDates = getWeekDates(weekAnchor)
  const startDate = toKey(weekDates[0])
  const endDate   = toKey(weekDates[6])
  const { plan, loading, saving, error, saveMeal: save, deleteMeal } = useMealPlan(startDate, endDate)

  // Modal state
  const [modalVisible, setModalVisible] = useState(false)
  const [editingSlot, setEditingSlot] = useState<MealType | null>(null)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [mealInput, setMealInput] = useState('')
  const [noteInput, setNoteInput] = useState('')

  const selectedKey = toKey(selectedDate)
  const dayPlan = plan[selectedKey] ?? {}

  function shiftWeek(delta: number) {
    const next = new Date(weekAnchor)
    next.setDate(next.getDate() + delta * 7)
    setWeekAnchor(next)
  }

  function openAddModal(type: MealType) {
    const existing = dayPlan[type]
    setEditingSlot(type)
    setEditingKey(selectedKey)
    setMealInput(existing?.name ?? '')
    setNoteInput(existing?.note ?? '')
    setModalVisible(true)
  }

  async function saveMeal() {
    if (!editingSlot || !editingKey || !mealInput.trim()) return
    await save(editingKey, editingSlot, mealInput.trim(), noteInput.trim() || undefined)
    setModalVisible(false)
    setMealInput('')
    setNoteInput('')
  }

  async function removeMeal(type: MealType) {
    await deleteMeal(selectedKey, type)
  }

  const weekLabel = (() => {
    const first = weekDates[0]
    const last = weekDates[6]
    if (first.getMonth() === last.getMonth()) {
      return `${MONTH_NAMES[first.getMonth()]} ${first.getFullYear()}`
    }
    return `${MONTH_NAMES[first.getMonth()]} – ${MONTH_NAMES[last.getMonth()]} ${last.getFullYear()}`
  })()

  const selectedDayLabel = selectedDate.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      {/* ── Week navigator ── */}
      <View style={[styles.weekNav, { backgroundColor: c.card, borderBottomColor: c.border }]}>
        <TouchableOpacity onPress={() => shiftWeek(-1)} style={styles.navBtn}>
          <FontAwesome name="chevron-left" size={14} color={c.muted} />
        </TouchableOpacity>
        <Text style={[styles.weekLabel, { color: c.text }]}>{weekLabel}</Text>
        <TouchableOpacity onPress={() => shiftWeek(1)} style={styles.navBtn}>
          <FontAwesome name="chevron-right" size={14} color={c.muted} />
        </TouchableOpacity>
      </View>

      {/* ── Day strip ── */}
      <View style={[styles.dayStrip, { backgroundColor: c.card, borderBottomColor: c.border }]}>
        {weekDates.map((date, i) => {
          const key = toKey(date)
          const isSelected = key === selectedKey
          const isToday = key === toKey(today)
          const hasMeals = !!plan[key] && Object.keys(plan[key]).length > 0
          return (
            <TouchableOpacity
              key={key}
              onPress={() => setSelectedDate(date)}
              style={[styles.dayItem, isSelected && { backgroundColor: '#2563eb', borderRadius: 12 }]}
            >
              <Text style={[styles.dayName, { color: isSelected ? '#fff' : c.muted }]}>
                {DAY_LABELS[i]}
              </Text>
              <Text style={[styles.dayNum, { color: isSelected ? '#fff' : isToday ? '#2563eb' : c.text }]}>
                {date.getDate()}
              </Text>
              {hasMeals && (
                <View style={[styles.dot, { backgroundColor: isSelected ? '#fff' : '#2563eb' }]} />
              )}
            </TouchableOpacity>
          )
        })}
      </View>

      {/* ── Day label ── */}
      <View style={styles.dayHeader}>
        <Text style={[styles.dayHeaderText, { color: c.text }]}>{selectedDayLabel}</Text>
        {selectedKey === toKey(today) && (
          <View style={styles.todayBadge}>
            <Text style={styles.todayBadgeText}>Today</Text>
          </View>
        )}
        {loading && <ActivityIndicator size="small" color="#2563eb" style={{ marginLeft: 8 }} />}
      </View>
      {error && (
        <Text style={styles.errorText}>{error}</Text>
      )}

      {/* ── Meal slots ── */}
      <ScrollView contentContainerStyle={styles.meals} showsVerticalScrollIndicator={false}>
        {MEAL_SLOTS.map(slot => {
          const meal = dayPlan[slot.type]
          return (
            <View key={slot.type} style={[styles.slotCard, { backgroundColor: c.card, borderColor: c.border }]}>
              {/* Slot header */}
              <View style={styles.slotHeader}>
                <View style={[styles.slotBadge, { backgroundColor: slot.light }]}>
                  <Text style={styles.slotIcon}>{slot.icon}</Text>
                  <Text style={[styles.slotLabel, { color: slot.color }]}>{slot.label}</Text>
                </View>
                <TouchableOpacity onPress={() => openAddModal(slot.type)}>
                  <FontAwesome
                    name={meal ? 'pencil' : 'plus'}
                    size={14}
                    color={meal ? c.muted : '#2563eb'}
                  />
                </TouchableOpacity>
              </View>

              {/* Meal or empty state */}
              {meal ? (
                <View style={styles.mealRow}>
                  <View style={styles.mealInfo}>
                    <Text style={[styles.mealName, { color: c.text }]}>{meal.name}</Text>
                    {meal.note ? (
                      <Text style={[styles.mealNote, { color: c.muted }]}>{meal.note}</Text>
                    ) : null}
                  </View>
                  <TouchableOpacity onPress={() => removeMeal(slot.type)} style={styles.removeBtn}>
                    <FontAwesome name="trash-o" size={14} color={c.muted} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => openAddModal(slot.type)} style={styles.emptySlot}>
                  <Text style={[styles.emptyText, { color: c.muted }]}>+ Add {slot.label.toLowerCase()}</Text>
                </TouchableOpacity>
              )}
            </View>
          )
        })}

        {/* ── Summary strip ── */}
        <View style={[styles.summaryCard, { backgroundColor: c.card, borderColor: c.border }]}>
          <Text style={[styles.summaryTitle, { color: c.muted }]}>This week</Text>
          <View style={styles.summaryRow}>
            {weekDates.map(date => {
              const key = toKey(date)
              const count = Object.keys(plan[key] ?? {}).length
              return (
                <View key={key} style={styles.summaryItem}>
                  <View style={[
                    styles.summaryBar,
                    { height: 4 + count * 12, backgroundColor: count > 0 ? '#2563eb' : c.border }
                  ]} />
                  <Text style={[styles.summaryDay, { color: c.muted }]}>{DAY_LABELS[weekDates.indexOf(date)][0]}</Text>
                </View>
              )
            })}
          </View>
        </View>
      </ScrollView>

      {/* ── Add/Edit modal ── */}
      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <Pressable style={[styles.modalSheet, { backgroundColor: c.card }]} onPress={() => {}}>
            {editingSlot && (
              <>
                <View style={styles.modalHandle} />
                <Text style={[styles.modalTitle, { color: c.text }]}>
                  {dayPlan[editingSlot] ? 'Edit' : 'Add'}{' '}
                  {MEAL_SLOTS.find(s => s.type === editingSlot)?.label}
                </Text>
                <TextInput
                  style={[styles.modalInput, { borderColor: c.border, color: c.text, backgroundColor: c.bg }]}
                  placeholder="Meal name"
                  placeholderTextColor={c.muted}
                  value={mealInput}
                  onChangeText={setMealInput}
                  autoFocus
                />
                <TextInput
                  style={[styles.modalInput, { borderColor: c.border, color: c.text, backgroundColor: c.bg }]}
                  placeholder="Note (optional)"
                  placeholderTextColor={c.muted}
                  value={noteInput}
                  onChangeText={setNoteInput}
                />
                <TouchableOpacity
                  style={[styles.saveBtn, (!mealInput.trim() || saving) && { opacity: 0.4 }]}
                  onPress={saveMeal}
                  disabled={!mealInput.trim() || saving}
                >
                  {saving
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.saveBtnText}>Save</Text>
                  }
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

// ─── Theme ────────────────────────────────────────────────────────────────────

const LIGHT = { bg: '#f8fafc', card: '#fff', text: '#0f172a', muted: '#94a3b8', border: '#e2e8f0' }
const DARK  = { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', muted: '#64748b', border: '#334155' }

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },

  // Week nav
  weekNav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1,
  },
  navBtn: { padding: 8 },
  weekLabel: { fontSize: 15, fontWeight: '600' },

  // Day strip
  dayStrip: {
    flexDirection: 'row', justifyContent: 'space-around',
    paddingHorizontal: 8, paddingVertical: 10,
    borderBottomWidth: 1,
  },
  dayItem: { alignItems: 'center', paddingVertical: 6, paddingHorizontal: 8, minWidth: 40 },
  dayName: { fontSize: 11, fontWeight: '500', marginBottom: 4 },
  dayNum: { fontSize: 16, fontWeight: '700' },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 3 },

  // Day header
  dayHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8,
  },
  dayHeaderText: { fontSize: 18, fontWeight: '700' },
  todayBadge: { backgroundColor: '#dbeafe', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  todayBadgeText: { color: '#2563eb', fontSize: 12, fontWeight: '600' },

  errorText: { color: '#ef4444', fontSize: 13, paddingHorizontal: 20, paddingBottom: 4 },

  // Meals scroll
  meals: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },

  // Slot card
  slotCard: {
    borderRadius: 16, borderWidth: 1,
    padding: 16,
  },
  slotHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  slotBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  slotIcon: { fontSize: 14 },
  slotLabel: { fontSize: 13, fontWeight: '700' },

  // Meal content
  mealRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mealInfo: { flex: 1 },
  mealName: { fontSize: 16, fontWeight: '600' },
  mealNote: { fontSize: 13, marginTop: 2 },
  removeBtn: { padding: 6, marginLeft: 8 },

  emptySlot: { paddingVertical: 8 },
  emptyText: { fontSize: 15 },

  // Summary
  summaryCard: { borderRadius: 16, borderWidth: 1, padding: 16, marginTop: 4 },
  summaryTitle: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 44 },
  summaryItem: { alignItems: 'center', gap: 4, justifyContent: 'flex-end', height: '100%' },
  summaryBar: { width: 20, borderRadius: 4 },
  summaryDay: { fontSize: 11, fontWeight: '600' },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40, gap: 12,
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#cbd5e1', alignSelf: 'center', marginBottom: 8,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  modalInput: {
    borderWidth: 1, borderRadius: 10,
    padding: 14, fontSize: 16,
  },
  saveBtn: {
    backgroundColor: '#2563eb', borderRadius: 12,
    padding: 16, alignItems: 'center', marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
