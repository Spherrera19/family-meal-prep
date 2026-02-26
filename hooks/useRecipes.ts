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
  calories?: number
  protein_g?: number
  carbs_g?: number
  fat_g?: number
  fiber_g?: number
  sugar_g?: number
  sodium_mg?: number
  saturated_fat_g?: number
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
    const { data: parsed, error: fnError } = await supabase.functions.invoke('parse-recipe', {
      body: { url },
    })
    if (fnError || parsed?.error) {
      setError(parsed?.error ?? fnError?.message ?? 'Failed to parse recipe')
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
        calories:        parsed.calories        ?? null,
        protein_g:       parsed.protein_g       ?? null,
        carbs_g:         parsed.carbs_g         ?? null,
        fat_g:           parsed.fat_g           ?? null,
        fiber_g:         parsed.fiber_g         ?? null,
        sugar_g:         parsed.sugar_g         ?? null,
        sodium_mg:       parsed.sodium_mg       ?? null,
        saturated_fat_g: parsed.saturated_fat_g ?? null,
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

  async function saveManualRecipe(fields: {
    title: string
    image_url?: string
    ingredients: string[]
    instructions: string[]
    servings?: string
    prep_time?: string
    cook_time?: string
    calories?: number
    protein_g?: number
    carbs_g?: number
    fat_g?: number
    fiber_g?: number
    sugar_g?: number
    sodium_mg?: number
    saturated_fat_g?: number
  }): Promise<Recipe | null> {
    if (!session) return null
    setError(null)

    const { data: saved, error: dbError } = await supabase
      .from('recipes')
      .insert({
        user_id:      session.user.id,
        family_id:    familyId ?? null,
        title:        fields.title,
        image_url:    fields.image_url ?? null,
        ingredients:  fields.ingredients,
        instructions: fields.instructions,
        servings:     fields.servings ?? null,
        prep_time:    fields.prep_time ?? null,
        cook_time:    fields.cook_time ?? null,
        calories:        fields.calories        ?? null,
        protein_g:       fields.protein_g       ?? null,
        carbs_g:         fields.carbs_g         ?? null,
        fat_g:           fields.fat_g           ?? null,
        fiber_g:         fields.fiber_g         ?? null,
        sugar_g:         fields.sugar_g         ?? null,
        sodium_mg:       fields.sodium_mg       ?? null,
        saturated_fat_g: fields.saturated_fat_g ?? null,
      })
      .select('*')
      .single()

    if (dbError) { setError(dbError.message); return null }
    const recipe = saved as Recipe
    setRecipes(prev => [recipe, ...prev])
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

  return { recipes, loading, importing, error, importRecipe, saveManualRecipe, deleteRecipe, addIngredientsToShoppingList }
}
