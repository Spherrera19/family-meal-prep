import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

export type Family = {
  id: string
  name: string
  invite_code: string
}

export function useFamily() {
  const { session } = useAuth()
  const [family, setFamily] = useState<Family | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchFamily = useCallback(async () => {
    if (!session) return
    setLoading(true)
    setError(null)

    const { data, error } = await supabase
      .from('family_members')
      .select('families (id, name, invite_code)')
      .eq('user_id', session.user.id)
      .maybeSingle()

    if (error) {
      setError(error.message)
    } else {
      setFamily((data?.families as unknown as Family) ?? null)
    }
    setLoading(false)
  }, [session])

  useEffect(() => { fetchFamily() }, [fetchFamily])

  async function createFamily(name: string): Promise<void> {
    if (!session) return
    setError(null)

    const { data, error } = await supabase.rpc('create_family', { family_name: name })
    if (error) { setError(error.message); return }
    setFamily(data as Family)
  }

  async function joinFamily(code: string): Promise<void> {
    if (!session) return
    setError(null)

    const { data: famId, error } = await supabase
      .rpc('join_family_by_code', { code: code.trim().toUpperCase() })

    if (error) { setError(error.message); return }

    // Fetch the family details now that we're a member
    const { data: fam, error: fetchErr } = await supabase
      .from('families')
      .select('id, name, invite_code')
      .eq('id', famId)
      .single()

    if (fetchErr) { setError(fetchErr.message); return }

    setFamily(fam as Family)
  }

  return { family, loading, error, createFamily, joinFamily }
}
