import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

// ─── Types ────────────────────────────────────────────────────────────────────

export type MealType = string   // any string — 'breakfast' | 'lunch' | 'dinner' | custom

export type Meal = {
  id: string
  name: string
  note?: string
}

export type DayPlan = Record<string, Meal>
export type WeekPlan = Record<string, DayPlan> // key: "YYYY-MM-DD"

type MealRow = {
  id: string
  date: string
  meal_type: string
  name: string
  note: string | null
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function rowsToWeekPlan(rows: MealRow[]): WeekPlan {
  const plan: WeekPlan = {}
  for (const row of rows) {
    if (!plan[row.date]) plan[row.date] = {}
    plan[row.date][row.meal_type] = {
      id: row.id,
      name: row.name,
      note: row.note ?? undefined,
    }
  }
  return plan
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMealPlan(startDate: string, endDate: string) {
  const { session } = useAuth()
  const [plan, setPlan] = useState<WeekPlan>({})
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchWeek = useCallback(async () => {
    if (!session) return
    setLoading(true)
    setError(null)

    const { data, error } = await supabase
      .from('meal_plans')
      .select('id, date, meal_type, name, note')
      .gte('date', startDate)
      .lte('date', endDate)

    if (error) {
      setError(error.message)
    } else {
      setPlan(rowsToWeekPlan(data as MealRow[]))
    }
    setLoading(false)
  }, [session, startDate, endDate])

  useEffect(() => { fetchWeek() }, [fetchWeek])

  async function saveMeal(date: string, type: MealType, name: string, note?: string) {
    if (!session) return
    setSaving(true)
    setError(null)

    const existing = plan[date]?.[type]

    if (existing) {
      const { error } = await supabase
        .from('meal_plans')
        .update({ name, note: note || null })
        .eq('id', existing.id)

      if (error) { setError(error.message); setSaving(false); return }

      setPlan(prev => ({
        ...prev,
        [date]: { ...prev[date], [type]: { ...existing, name, note } },
      }))
    } else {
      const { data, error } = await supabase
        .from('meal_plans')
        .insert({ user_id: session.user.id, date, meal_type: type, name, note: note || null })
        .select('id, date, meal_type, name, note')
        .single()

      if (error) { setError(error.message); setSaving(false); return }

      const row = data as MealRow
      setPlan(prev => ({
        ...prev,
        [date]: {
          ...prev[date],
          [type]: { id: row.id, name: row.name, note: row.note ?? undefined },
        },
      }))
    }
    setSaving(false)
  }

  async function deleteMeal(date: string, type: MealType) {
    const existing = plan[date]?.[type]
    if (!existing) return
    setSaving(true)
    setError(null)

    const { error } = await supabase
      .from('meal_plans')
      .delete()
      .eq('id', existing.id)

    if (error) { setError(error.message); setSaving(false); return }

    setPlan(prev => {
      const updated = { ...prev[date] }
      delete updated[type]
      return { ...prev, [date]: updated }
    })
    setSaving(false)
  }

  return { plan, loading, saving, error, saveMeal, deleteMeal }
}
