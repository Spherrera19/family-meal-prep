import { useCallback, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { MacroTotals } from '@/utils/nutrition'

export type DailyMacros = MacroTotals & { date: string }

export function useNutritionHistory() {
  const { session } = useAuth()
  const [dailyTotals, setDailyTotals] = useState<DailyMacros[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async (startDate: string, endDate: string) => {
    if (!session) return
    setLoading(true)
    setError(null)

    const { data, error } = await supabase
      .from('meal_plans')
      .select('date, recipes(calories, protein_g, carbs_g, fat_g)')
      .gte('date', startDate)
      .lte('date', endDate)

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // Group by date and sum macros
    const byDate = new Map<string, MacroTotals>()
    for (const row of (data as any[]) ?? []) {
      const dateStr: string = row.date
      if (!byDate.has(dateStr)) {
        byDate.set(dateStr, { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 })
      }
      const totals = byDate.get(dateStr)!
      const r = row.recipes
      if (r) {
        totals.calories  += r.calories  ?? 0
        totals.protein_g += r.protein_g ?? 0
        totals.carbs_g   += r.carbs_g   ?? 0
        totals.fat_g     += r.fat_g     ?? 0
      }
    }

    const result: DailyMacros[] = Array.from(byDate.entries())
      .map(([date, totals]) => ({ date, ...totals }))
      .sort((a, b) => a.date.localeCompare(b.date))

    setDailyTotals(result)
    setLoading(false)
  }, [session])

  return { dailyTotals, loading, error, fetch }
}
