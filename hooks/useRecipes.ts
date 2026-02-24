import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Recipe = {
  id: string
  title: string
  description?: string
  source_url?: string
  image_url?: string
  ingredients: string[]
  instructions: string[]
  servings?: string
  prep_time?: string
  cook_time?: string
  created_at: string
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useRecipes(familyId: string | null) {
  const { session } = useAuth()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchRecipes = useCallback(async () => {
    if (!session) return
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('recipes')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setRecipes(data as Recipe[])
    setLoading(false)
  }, [session])

  useEffect(() => { fetchRecipes() }, [fetchRecipes])

  // Call the edge function then save the result
  async function importRecipe(url: string): Promise<Recipe | null> {
    if (!session) return null
    setImporting(true)
    setError(null)

    // 1. Parse via edge function
    const fnUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/parse-recipe`
    const fnRes = await fetch(fnUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    const resText = await fnRes.text()
    let parsed: any
    try { parsed = JSON.parse(resText) } catch { parsed = { error: resText } }
    if (!fnRes.ok || parsed?.error) {
      setError(parsed?.error ?? `HTTP ${fnRes.status}`)
      setImporting(false)
      return null
    }

    // 2. Save to database
    const { data: saved, error: dbError } = await supabase
      .from('recipes')
      .insert({
        user_id:      session.user.id,
        family_id:    familyId ?? null,
        title:        parsed.title,
        description:  parsed.description,
        source_url:   parsed.source_url,
        image_url:    parsed.image_url,
        ingredients:  parsed.ingredients,
        instructions: parsed.instructions,
        servings:     parsed.servings,
        prep_time:    parsed.prep_time,
        cook_time:    parsed.cook_time,
      })
      .select('*')
      .single()

    if (dbError) {
      setError(dbError.message)
      setImporting(false)
      return null
    }

    const recipe = saved as Recipe
    setRecipes(prev => [recipe, ...prev])
    setImporting(false)
    return recipe
  }

  async function deleteRecipe(id: string) {
    setRecipes(prev => prev.filter(r => r.id !== id))
    const { error } = await supabase.from('recipes').delete().eq('id', id)
    if (error) { setError(error.message); fetchRecipes() }
  }

  async function addIngredientsToShoppingList(recipe: Recipe): Promise<number> {
    if (!session || !familyId) return 0
    if (!recipe.ingredients.length) return 0

    const rows = recipe.ingredients.map(ingredient => ({
      family_id: familyId,
      name:      ingredient,
      added_by:  session.user.id,
    }))

    // Insert all, ignoring duplicates via the unique index
    const { data, error } = await supabase
      .from('shopping_items')
      .upsert(rows, { onConflict: 'family_id,name', ignoreDuplicates: true })
      .select('id')

    if (error) { setError(error.message); return 0 }
    return data?.length ?? 0
  }

  return { recipes, loading, importing, error, importRecipe, deleteRecipe, addIngredientsToShoppingList }
}
