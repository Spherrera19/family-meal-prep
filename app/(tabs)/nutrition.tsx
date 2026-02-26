import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
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
import { useNutritionHistory, type DailyMacros } from '@/hooks/useNutritionHistory'
import { useUserProfile, type UserProfile } from '@/hooks/useUserProfile'
import { useWeightLog } from '@/hooks/useWeightLog'

// ─── Theme ────────────────────────────────────────────────────────────────────

const LIGHT = { bg: '#f8fafc', card: '#fff',    text: '#0f172a', muted: '#94a3b8', border: '#e2e8f0' }
const DARK  = { bg: '#0f172a', card: '#1e293b', text: '#f1f5f9', muted: '#64748b', border: '#334155' }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toKey(d: Date) { return d.toISOString().split('T')[0] }

function getDateRange(period: 'week' | 'month' | 'all'): { start: string; end: string } {
  const end   = new Date()
  const start = new Date()
  if (period === 'week')  start.setDate(end.getDate() - 6)
  if (period === 'month') start.setDate(end.getDate() - 29)
  if (period === 'all')   start.setFullYear(end.getFullYear() - 2)
  return { start: toKey(start), end: toKey(end) }
}

function avg(arr: number[]): number {
  if (!arr.length) return 0
  return Math.round(arr.reduce((s, v) => s + v, 0) / arr.length)
}

// ─── Bar chart ────────────────────────────────────────────────────────────────

const SCREEN_W = Dimensions.get('window').width

type BarChartProps = {
  data: DailyMacros[]
  goalCalories: number
  period: 'week' | 'month' | 'all'
  c: typeof LIGHT
  onSelect: (d: DailyMacros | null) => void
  selected: DailyMacros | null
}

function BarChart({ data, goalCalories, period, c, onSelect, selected }: BarChartProps) {
  const chartH  = 120
  const barW    = period === 'week' ? 32 : period === 'month' ? 8 : 6
  const gap     = period === 'week' ? 6 : 3
  const maxCal  = Math.max(goalCalories, ...data.map(d => d.calories), 1)

  const bars = useMemo(() => {
    if (period !== 'all') return data
    // Weekly averages for all-time
    const weeks = new Map<string, DailyMacros[]>()
    for (const d of data) {
      const dt = new Date(d.date)
      const mon = new Date(dt)
      mon.setDate(dt.getDate() - ((dt.getDay() + 6) % 7))
      const key = toKey(mon)
      if (!weeks.has(key)) weeks.set(key, [])
      weeks.get(key)!.push(d)
    }
    return Array.from(weeks.entries()).map(([date, days]) => ({
      date,
      calories:  avg(days.map(d => d.calories)),
      protein_g: avg(days.map(d => d.protein_g)),
      carbs_g:   avg(days.map(d => d.carbs_g)),
      fat_g:     avg(days.map(d => d.fat_g)),
    }))
  }, [data, period])

  if (!bars.length) {
    return (
      <View style={[styles.chartEmpty, { height: chartH }]}>
        <Text style={[styles.chartEmptyText, { color: c.muted }]}>No data for this period</Text>
      </View>
    )
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap }}>
      {bars.map(bar => {
        const pct = bar.calories / maxCal
        const h   = Math.max(pct * chartH, 2)
        const isSel = selected?.date === bar.date
        const label = period === 'week'
          ? new Date(bar.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })
          : new Date(bar.date + 'T12:00:00').getDate().toString()
        return (
          <TouchableOpacity
            key={bar.date}
            onPress={() => onSelect(isSel ? null : bar)}
            style={[styles.barWrap, { width: barW, height: chartH + 24 }]}
            activeOpacity={0.7}
          >
            <View style={[styles.barBg, { height: chartH, backgroundColor: c.border }]}>
              <View style={[
                styles.barFill,
                { height: h, backgroundColor: isSel ? '#10b981' : bar.calories >= goalCalories ? '#10b981' : '#2563eb' },
              ]} />
            </View>
            {period === 'week' && (
              <Text style={[styles.barLabel, { color: c.muted }]}>{label}</Text>
            )}
          </TouchableOpacity>
        )
      })}
    </ScrollView>
  )
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ logs, unit, c }: { logs: Array<{ date: string; weight: number }>; unit: string; c: typeof LIGHT }) {
  const W = SCREEN_W - 48
  const H = 48
  if (logs.length < 2) return null

  const weights = [...logs].reverse().map(l => l.weight)
  const minW = Math.min(...weights)
  const maxW = Math.max(...weights)
  const range = maxW - minW || 1

  const pts = weights.map((w, i) => ({
    x: (i / (weights.length - 1)) * W,
    y: H - ((w - minW) / range) * H,
  }))

  return (
    <View style={{ height: H, width: W, marginVertical: 8 }}>
      {pts.slice(1).map((pt, i) => {
        const prev = pts[i]
        const dx = pt.x - prev.x
        const dy = pt.y - prev.y
        const len = Math.sqrt(dx * dx + dy * dy)
        const angle = Math.atan2(dy, dx) * (180 / Math.PI)
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: prev.x,
              top: prev.y,
              width: len,
              height: 2,
              backgroundColor: '#2563eb',
              transformOrigin: 'left center',
              transform: [{ rotate: `${angle}deg` }],
            }}
          />
        )
      })}
      {pts.map((pt, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: pt.x - 3,
            top: pt.y - 3,
            width: 6, height: 6,
            borderRadius: 3,
            backgroundColor: '#2563eb',
          }}
        />
      ))}
      <Text style={[styles.sparkMin, { color: c.muted }]}>{minW}{unit}</Text>
      <Text style={[styles.sparkMax, { color: c.muted }]}>{maxW}{unit}</Text>
    </View>
  )
}

// ─── Screen ───────────────────────────────────────────────────────────────────

type Period = 'week' | 'month' | 'all'

export default function NutritionScreen() {
  const c = useColorScheme() === 'dark' ? DARK : LIGHT
  const [period, setPeriod] = useState<Period>('week')
  const [selected, setSelected] = useState<DailyMacros | null>(null)

  const { dailyTotals, loading: histLoading, fetch } = useNutritionHistory()
  const { profile, loading: profLoading, saveProfile } = useUserProfile()
  const { logs, logWeight, deleteLog } = useWeightLog()

  // Goals modal
  const [goalsModal, setGoalsModal] = useState(false)
  const [goalCal,  setGoalCal]  = useState('')
  const [goalProt, setGoalProt] = useState('')
  const [goalCarb, setGoalCarb] = useState('')
  const [goalFat,  setGoalFat]  = useState('')

  // Weight input
  const [weightInput, setWeightInput] = useState('')
  const [weightUnit, setWeightUnit] = useState<'lbs' | 'kg'>('lbs')
  const [loggingWeight, setLoggingWeight] = useState(false)

  const range = useMemo(() => getDateRange(period), [period])

  const loadHistory = useCallback(() => {
    fetch(range.start, range.end)
  }, [fetch, range.start, range.end])

  useEffect(() => { loadHistory() }, [loadHistory])

  useEffect(() => {
    setWeightUnit(profile.weight_unit)
  }, [profile.weight_unit])

  // Period averages
  const avgCalories  = avg(dailyTotals.map(d => d.calories))
  const avgProtein   = avg(dailyTotals.map(d => d.protein_g))
  const avgCarbs     = avg(dailyTotals.map(d => d.carbs_g))
  const avgFat       = avg(dailyTotals.map(d => d.fat_g))

  function openGoalsModal() {
    setGoalCal(String(profile.daily_calories))
    setGoalProt(String(profile.daily_protein_g))
    setGoalCarb(String(profile.daily_carbs_g))
    setGoalFat(String(profile.daily_fat_g))
    setGoalsModal(true)
  }

  async function saveGoals() {
    await saveProfile({
      daily_calories:  parseInt(goalCal)  || profile.daily_calories,
      daily_protein_g: parseInt(goalProt) || profile.daily_protein_g,
      daily_carbs_g:   parseInt(goalCarb) || profile.daily_carbs_g,
      daily_fat_g:     parseInt(goalFat)  || profile.daily_fat_g,
    })
    setGoalsModal(false)
  }

  async function handleLogWeight() {
    const w = parseFloat(weightInput)
    if (isNaN(w) || w <= 0) return
    setLoggingWeight(true)
    await logWeight(toKey(new Date()), w, weightUnit)
    setWeightInput('')
    setLoggingWeight(false)
  }

  async function handleDeleteLog(id: string) {
    Alert.alert('Delete entry?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteLog(id) },
    ])
  }

  async function handleUnitToggle(unit: 'lbs' | 'kg') {
    setWeightUnit(unit)
    await saveProfile({ weight_unit: unit })
  }

  return (
    <ScrollView style={[styles.screen, { backgroundColor: c.bg }]} contentContainerStyle={styles.content}>

      {/* ── Period selector ─────────────────────────────────────────── */}
      <View style={[styles.segmented, { backgroundColor: c.border }]}>
        {(['week', 'month', 'all'] as Period[]).map(p => (
          <TouchableOpacity
            key={p}
            onPress={() => { setPeriod(p); setSelected(null) }}
            style={[styles.segment, period === p && { backgroundColor: c.card }]}
          >
            <Text style={[styles.segmentText, { color: period === p ? c.text : c.muted }]}>
              {p === 'week' ? 'Week' : p === 'month' ? 'Month' : 'All Time'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Macro history chart ─────────────────────────────────────── */}
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[styles.cardTitle, { color: c.text }]}>Calorie History</Text>
        {histLoading
          ? <ActivityIndicator color="#2563eb" style={{ height: 144 }} />
          : <BarChart
              data={dailyTotals}
              goalCalories={profile.daily_calories}
              period={period}
              c={c}
              onSelect={setSelected}
              selected={selected}
            />
        }

        {/* Selected day breakdown */}
        {selected && (
          <View style={[styles.selectedBreakdown, { borderTopColor: c.border }]}>
            <Text style={[styles.selectedDate, { color: c.muted }]}>
              {new Date(selected.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </Text>
            <View style={styles.breakdownRow}>
              {[
                { icon: '🔥', label: 'Cal',     v: selected.calories,  u: '' },
                { icon: '💪', label: 'Protein', v: selected.protein_g, u: 'g' },
                { icon: '🌾', label: 'Carbs',   v: selected.carbs_g,   u: 'g' },
                { icon: '🫙', label: 'Fat',     v: selected.fat_g,     u: 'g' },
              ].map(item => (
                <View key={item.label} style={styles.breakdownItem}>
                  <Text style={styles.breakdownIcon}>{item.icon}</Text>
                  <Text style={[styles.breakdownVal, { color: c.text }]}>{item.v}{item.u}</Text>
                  <Text style={[styles.breakdownLabel, { color: c.muted }]}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>

      {/* ── Period averages ─────────────────────────────────────────── */}
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[styles.cardTitle, { color: c.text }]}>Period Averages</Text>
        <View style={styles.avgRow}>
          {[
            { icon: '🔥', label: 'Calories', value: avgCalories, unit: '' },
            { icon: '💪', label: 'Protein',  value: avgProtein,  unit: 'g' },
            { icon: '🌾', label: 'Carbs',    value: avgCarbs,    unit: 'g' },
            { icon: '🫙', label: 'Fat',      value: avgFat,      unit: 'g' },
          ].map(item => (
            <View key={item.label} style={[styles.avgCard, { backgroundColor: c.bg, borderColor: c.border }]}>
              <Text style={styles.avgIcon}>{item.icon}</Text>
              <Text style={[styles.avgValue, { color: c.text }]}>{item.value}{item.unit}</Text>
              <Text style={[styles.avgLabel, { color: c.muted }]}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* ── Edit goals ─────────────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.goalsBtn, { borderColor: '#2563eb' }]}
        onPress={openGoalsModal}
      >
        <Text style={styles.goalsBtnText}>Edit Daily Goals</Text>
      </TouchableOpacity>

      {/* ── Weight tracking ─────────────────────────────────────────── */}
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[styles.cardTitle, { color: c.text }]}>Weight Tracking</Text>

        {/* Log weight row */}
        <View style={styles.weightInputRow}>
          <TextInput
            style={[styles.weightInput, { borderColor: c.border, color: c.text, backgroundColor: c.bg }]}
            placeholder="Weight"
            placeholderTextColor={c.muted}
            keyboardType="decimal-pad"
            value={weightInput}
            onChangeText={setWeightInput}
          />
          {/* Unit toggle */}
          <View style={[styles.unitToggle, { backgroundColor: c.border }]}>
            {(['lbs', 'kg'] as const).map(u => (
              <TouchableOpacity
                key={u}
                onPress={() => handleUnitToggle(u)}
                style={[styles.unitBtn, weightUnit === u && { backgroundColor: c.card }]}
              >
                <Text style={[styles.unitBtnText, { color: weightUnit === u ? c.text : c.muted }]}>{u}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.logWeightBtn, (!weightInput || loggingWeight) && { opacity: 0.4 }]}
            onPress={handleLogWeight}
            disabled={!weightInput || loggingWeight}
          >
            {loggingWeight
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.logWeightBtnText}>Log</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Sparkline */}
        {logs.length >= 2 && (
          <Sparkline logs={logs} unit={weightUnit} c={c} />
        )}

        {/* Recent entries */}
        {logs.length === 0
          ? <Text style={[styles.noLogsText, { color: c.muted }]}>No weight entries yet.</Text>
          : logs.map(log => (
            <View key={log.id} style={[styles.logRow, { borderBottomColor: c.border }]}>
              <Text style={[styles.logDate, { color: c.muted }]}>
                {new Date(log.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
              <Text style={[styles.logWeight, { color: c.text }]}>{log.weight} {log.unit}</Text>
              <TouchableOpacity onPress={() => handleDeleteLog(log.id)} style={styles.logDelete}>
                <Text style={{ color: '#ef4444', fontSize: 12 }}>Delete</Text>
              </TouchableOpacity>
            </View>
          ))
        }
      </View>

      {/* ── Edit Goals modal ─────────────────────────────────────────── */}
      <Modal visible={goalsModal} transparent animationType="slide" onRequestClose={() => setGoalsModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setGoalsModal(false)}>
          <Pressable style={[styles.modalSheet, { backgroundColor: c.card }]} onPress={() => {}}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: c.text }]}>Daily Macro Goals</Text>
            {[
              { label: 'Calories',   value: goalCal,  set: setGoalCal,  icon: '🔥' },
              { label: 'Protein (g)',value: goalProt, set: setGoalProt, icon: '💪' },
              { label: 'Carbs (g)',  value: goalCarb, set: setGoalCarb, icon: '🌾' },
              { label: 'Fat (g)',    value: goalFat,  set: setGoalFat,  icon: '🫙' },
            ].map(f => (
              <View key={f.label} style={styles.goalRow}>
                <Text style={styles.goalIcon}>{f.icon}</Text>
                <Text style={[styles.goalLabel, { color: c.text }]}>{f.label}</Text>
                <TextInput
                  style={[styles.goalInput, { borderColor: c.border, color: c.text, backgroundColor: c.bg }]}
                  keyboardType="number-pad"
                  value={f.value}
                  onChangeText={f.set}
                />
              </View>
            ))}
            <TouchableOpacity style={styles.saveBtn} onPress={saveGoals}>
              <Text style={styles.saveBtnText}>Save Goals</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

    </ScrollView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen:  { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 40 },

  segmented:    { flexDirection: 'row', borderRadius: 10, padding: 3, marginBottom: 4 },
  segment:      { flex: 1, borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  segmentText:  { fontSize: 13, fontWeight: '600' },

  card:      { borderRadius: 14, borderWidth: 1, padding: 16, gap: 12 },
  cardTitle: { fontSize: 15, fontWeight: '700' },

  chartEmpty:     { justifyContent: 'center', alignItems: 'center' },
  chartEmptyText: { fontSize: 14 },

  barWrap:  { alignItems: 'center', justifyContent: 'flex-end' },
  barBg:    { width: '100%', justifyContent: 'flex-end', borderRadius: 3, overflow: 'hidden' },
  barFill:  { width: '100%', borderRadius: 3 },
  barLabel: { fontSize: 9, marginTop: 4 },

  selectedBreakdown: { borderTopWidth: 1, paddingTop: 12, gap: 8 },
  selectedDate:      { fontSize: 12, fontWeight: '600' },
  breakdownRow:      { flexDirection: 'row', justifyContent: 'space-around' },
  breakdownItem:     { alignItems: 'center', gap: 2 },
  breakdownIcon:     { fontSize: 18 },
  breakdownVal:      { fontSize: 15, fontWeight: '700' },
  breakdownLabel:    { fontSize: 11 },

  avgRow:   { flexDirection: 'row', gap: 8 },
  avgCard:  { flex: 1, borderRadius: 10, borderWidth: 1, padding: 10, alignItems: 'center', gap: 4 },
  avgIcon:  { fontSize: 20 },
  avgValue: { fontSize: 16, fontWeight: '700' },
  avgLabel: { fontSize: 11 },

  goalsBtn:     { borderWidth: 1.5, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  goalsBtnText: { color: '#2563eb', fontSize: 15, fontWeight: '700' },

  weightInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  weightInput:    { flex: 1, borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 16 },
  unitToggle:     { flexDirection: 'row', borderRadius: 8, padding: 2 },
  unitBtn:        { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  unitBtnText:    { fontSize: 13, fontWeight: '600' },
  logWeightBtn:   { backgroundColor: '#2563eb', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  logWeightBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  sparkMin: { position: 'absolute', bottom: 0, left: 0, fontSize: 10 },
  sparkMax: { position: 'absolute', top: 0, left: 0, fontSize: 10 },

  noLogsText: { fontSize: 13, textAlign: 'center', paddingVertical: 8 },
  logRow:     { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1 },
  logDate:    { flex: 1, fontSize: 13 },
  logWeight:  { fontSize: 15, fontWeight: '600', marginRight: 12 },
  logDelete:  { padding: 4 },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet:   { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, gap: 12 },
  modalHandle:  { width: 36, height: 4, borderRadius: 2, backgroundColor: '#cbd5e1', alignSelf: 'center', marginBottom: 8 },
  modalTitle:   { fontSize: 20, fontWeight: '700', marginBottom: 4 },

  goalRow:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  goalIcon:  { fontSize: 18, width: 24 },
  goalLabel: { flex: 1, fontSize: 15, fontWeight: '500' },
  goalInput: { width: 90, borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 16, textAlign: 'right' },

  saveBtn:     { backgroundColor: '#2563eb', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 4 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
