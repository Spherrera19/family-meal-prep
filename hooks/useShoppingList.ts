import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

export type ShoppingItem = {
  id: string
  name: string
  quantity?: string
  checked: boolean
  added_by: string | null
}

type ItemRow = {
  id: string
  name: string
  quantity: string | null
  checked: boolean
  added_by: string | null
}

function rowToItem(row: ItemRow): ShoppingItem {
  return { ...row, quantity: row.quantity ?? undefined }
}

export function useShoppingList(familyId: string | null) {
  const { session } = useAuth()
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initial fetch
  useEffect(() => {
    if (!familyId || !session) return
    setLoading(true)

    supabase
      .from('shopping_items')
      .select('id, name, quantity, checked, added_by')
      .eq('family_id', familyId)
      .order('created_at')
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setItems((data as ItemRow[]).map(rowToItem))
        setLoading(false)
      })
  }, [familyId, session])

  // Real-time subscription
  useEffect(() => {
    if (!familyId) return

    const channel = supabase
      .channel(`shopping:${familyId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'shopping_items', filter: `family_id=eq.${familyId}` },
        ({ new: row }) => {
          setItems(prev => {
            if (prev.some(i => i.id === (row as ItemRow).id)) return prev
            return [...prev, rowToItem(row as ItemRow)]
          })
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'shopping_items', filter: `family_id=eq.${familyId}` },
        ({ new: row }) => {
          setItems(prev => prev.map(i => i.id === (row as ItemRow).id ? rowToItem(row as ItemRow) : i))
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'shopping_items', filter: `family_id=eq.${familyId}` },
        ({ old: row }) => {
          setItems(prev => prev.filter(i => i.id !== (row as { id: string }).id))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [familyId])

  async function addItem(name: string, quantity?: string) {
    if (!session || !familyId || !name.trim()) return
    setError(null)

    const { error } = await supabase.from('shopping_items').insert({
      family_id: familyId,
      name: name.trim(),
      quantity: quantity?.trim() || null,
      added_by: session.user.id,
    })
    if (error) setError(error.message)
    // Real-time INSERT event updates state automatically
  }

  async function toggleItem(id: string, checked: boolean) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, checked } : i))
    const { error } = await supabase
      .from('shopping_items')
      .update({ checked })
      .eq('id', id)
    if (error) {
      setError(error.message)
      setItems(prev => prev.map(i => i.id === id ? { ...i, checked: !checked } : i))
    }
  }

  async function deleteItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
    const { error } = await supabase.from('shopping_items').delete().eq('id', id)
    if (error) setError(error.message)
    // Real-time DELETE event also fires; duplicate filter in INSERT handler guards against doubles
  }

  async function clearChecked() {
    const checkedIds = items.filter(i => i.checked).map(i => i.id)
    if (!checkedIds.length) return
    setItems(prev => prev.filter(i => !i.checked))
    const { error } = await supabase
      .from('shopping_items')
      .delete()
      .in('id', checkedIds)
    if (error) setError(error.message)
  }

  return { items, loading, error, addItem, toggleItem, deleteItem, clearChecked }
}
