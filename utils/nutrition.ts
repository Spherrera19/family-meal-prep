import type { DayPlan } from '@/hooks/useMealPlan'
import type { Recipe } from '@/hooks/useRecipes'

export type NutritionTotals = {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  sugar_g: number
  sodium_mg: number
  saturated_fat_g: number
}

// Backward-compatible alias — no existing callers break
export type MacroTotals = NutritionTotals

export function getDayNutrition(dayPlan: DayPlan, recipes: Recipe[]): NutritionTotals {
  const recipeMap = new Map<string, Recipe>(recipes.map(r => [r.id, r]))
  const totals: NutritionTotals = {
    calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
    fiber_g: 0, sugar_g: 0, sodium_mg: 0, saturated_fat_g: 0,
  }

  for (const meal of Object.values(dayPlan)) {
    if (!meal.recipe_id) continue
    const recipe = recipeMap.get(meal.recipe_id)
    if (!recipe) continue
    totals.calories        += recipe.calories        ?? 0
    totals.protein_g       += recipe.protein_g       ?? 0
    totals.carbs_g         += recipe.carbs_g         ?? 0
    totals.fat_g           += recipe.fat_g           ?? 0
    totals.fiber_g         += recipe.fiber_g         ?? 0
    totals.sugar_g         += recipe.sugar_g         ?? 0
    totals.sodium_mg       += recipe.sodium_mg       ?? 0
    totals.saturated_fat_g += recipe.saturated_fat_g ?? 0
  }

  return totals
}
