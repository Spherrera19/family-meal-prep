import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

export type UserProfile = {
  daily_calories: number
  daily_protein_g: number
  daily_carbs_g: number
  daily_fat_g: number
  weight_unit: 'lbs' | 'kg'
}

const DEFAULTS: UserProfile = {
  daily_calories: 2000,
  daily_protein_g: 150,
  daily_carbs_g: 250,
  daily_fat_g: 65,
  weight_unit: 'lbs',
}

export function useUserProfile() {
  const { session } = useAuth()
  const [profile, setProfile] = useState<UserProfile>(DEFAULTS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchProfile = useCallback(async () => {
    if (!session) return
    setLoading(true)
    setError(null)

    const { data, error } = await supabase
      .from('user_profiles')
      .select('daily_calories, daily_protein_g, daily_carbs_g, daily_fat_g, weight_unit')
      .eq('id', session.user.id)
      .single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found — first-time user, use defaults
      setError(error.message)
    } else if (data) {
      setProfile({
        daily_calories:  data.daily_calories ?? DEFAULTS.daily_calories,
        daily_protein_g: data.daily_protein_g ?? DEFAULTS.daily_protein_g,
        daily_carbs_g:   data.daily_carbs_g ?? DEFAULTS.daily_carbs_g,
        daily_fat_g:     data.daily_fat_g ?? DEFAULTS.daily_fat_g,
        weight_unit:     (data.weight_unit as 'lbs' | 'kg') ?? DEFAULTS.weight_unit,
      })
    }
    setLoading(false)
  }, [session])

  useEffect(() => { fetchProfile() }, [fetchProfile])

  async function saveProfile(updates: Partial<UserProfile>) {
    if (!session) return
    setError(null)

    const newProfile = { ...profile, ...updates }
    const { error } = await supabase
      .from('user_profiles')
      .upsert({
        id:              session.user.id,
        daily_calories:  newProfile.daily_calories,
        daily_protein_g: newProfile.daily_protein_g,
        daily_carbs_g:   newProfile.daily_carbs_g,
        daily_fat_g:     newProfile.daily_fat_g,
        weight_unit:     newProfile.weight_unit,
        updated_at:      new Date().toISOString(),
      })

    if (error) { setError(error.message); return }
    setProfile(newProfile)
  }

  return { profile, loading, error, saveProfile }
}
