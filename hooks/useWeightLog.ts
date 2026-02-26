import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

export type WeightLog = {
  id: string
  date: string
  weight: number
  unit: string
}

export function useWeightLog() {
  const { session } = useAuth()
  const [logs, setLogs] = useState<WeightLog[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchLogs = useCallback(async (startDate?: string, endDate?: string) => {
    if (!session) return
    setLoading(true)
    setError(null)

    let query = supabase
      .from('weight_logs')
      .select('id, date, weight, unit')
      .order('date', { ascending: false })
      .limit(10)

    if (startDate) query = query.gte('date', startDate)
    if (endDate)   query = query.lte('date', endDate)

    const { data, error } = await query
    if (error) setError(error.message)
    else setLogs((data as WeightLog[]) ?? [])
    setLoading(false)
  }, [session])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  async function logWeight(date: string, weight: number, unit: string) {
    if (!session) return
    setError(null)

    const { data, error } = await supabase
      .from('weight_logs')
      .upsert(
        { user_id: session.user.id, date, weight, unit },
        { onConflict: 'user_id,date' }
      )
      .select('id, date, weight, unit')
      .single()

    if (error) { setError(error.message); return }
    const newLog = data as WeightLog
    setLogs(prev => {
      const filtered = prev.filter(l => l.date !== date)
      return [newLog, ...filtered].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10)
    })
  }

  async function deleteLog(id: string) {
    setLogs(prev => prev.filter(l => l.id !== id))
    const { error } = await supabase.from('weight_logs').delete().eq('id', id)
    if (error) {
      const msg = error.message
      await fetchLogs()  // restore state (fetchLogs clears error internally)
      setError(msg)      // re-set error so it persists for the user
    }
  }

  return { logs, loading, error, logWeight, deleteLog, fetchLogs }
}
