/**
 * Unit tests for utils/nutrition.ts
 *
 * Covers:
 *   - getDayNutrition: empty dayPlan returns zero totals
 *   - getDayNutrition: meals with no recipe_id return zero totals
 *   - getDayNutrition: correctly sums macros from matched recipes
 *   - getDayNutrition: skips meals whose recipe_id has no matching recipe
 *   - getDayNutrition: treats null/undefined macro fields as 0
 *   - getDayNutrition: correctly handles a mix of matched, unmatched, and no-recipe_id meals
 */

import { getDayNutrition, MacroTotals } from '../nutrition'
import type { DayPlan } from '@/hooks/useMealPlan'
import type { Recipe } from '@/hooks/useRecipes'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeMeal(overrides: { id?: string; name?: string; recipe_id?: string } = {}) {
  return {
    id:        overrides.id        ?? 'meal-1',
    name:      overrides.name      ?? 'Oatmeal',
    recipe_id: overrides.recipe_id,
  }
}

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id:           overrides.id           ?? 'recipe-1',
    title:        overrides.title        ?? 'Default Recipe',
    ingredients:  overrides.ingredients  ?? [],
    instructions: overrides.instructions ?? [],
    created_at:   overrides.created_at   ?? '2024-01-01T00:00:00Z',
    calories:     overrides.calories,
    protein_g:    overrides.protein_g,
    carbs_g:      overrides.carbs_g,
    fat_g:        overrides.fat_g,
    ...overrides,
  }
}

const ZERO_TOTALS: MacroTotals = {
  calories:        0,
  protein_g:       0,
  carbs_g:         0,
  fat_g:           0,
  fiber_g:         0,
  sugar_g:         0,
  sodium_mg:       0,
  saturated_fat_g: 0,
}

// ---------------------------------------------------------------------------
// Tests: getDayNutrition
// ---------------------------------------------------------------------------

describe('getDayNutrition', () => {
  describe('zero-total cases', () => {
    it('returns zero totals when dayPlan is empty', () => {
      const result = getDayNutrition({}, [makeRecipe()])
      expect(result).toEqual(ZERO_TOTALS)
    })

    it('returns zero totals when recipes array is empty', () => {
      const dayPlan: DayPlan = {
        breakfast: makeMeal({ recipe_id: 'recipe-1' }),
      }
      const result = getDayNutrition(dayPlan, [])
      expect(result).toEqual(ZERO_TOTALS)
    })

    it('returns zero totals when no meals have a recipe_id', () => {
      const dayPlan: DayPlan = {
        breakfast: makeMeal({ id: 'meal-a', name: 'Toast' }),
        lunch:     makeMeal({ id: 'meal-b', name: 'Salad' }),
      }
      const result = getDayNutrition(dayPlan, [makeRecipe()])
      expect(result).toEqual(ZERO_TOTALS)
    })

    it('returns zero totals when both dayPlan and recipes are empty', () => {
      const result = getDayNutrition({}, [])
      expect(result).toEqual(ZERO_TOTALS)
    })
  })

  describe('happy path — macro summation', () => {
    it('returns the macros of a single matched recipe', () => {
      const recipe = makeRecipe({
        id:        'recipe-1',
        calories:  500,
        protein_g: 30,
        carbs_g:   60,
        fat_g:     15,
      })
      const dayPlan: DayPlan = {
        breakfast: makeMeal({ recipe_id: 'recipe-1' }),
      }

      const result = getDayNutrition(dayPlan, [recipe])

      expect(result).toEqual({
        calories:        500,
        protein_g:       30,
        carbs_g:         60,
        fat_g:           15,
        fiber_g:         0,
        sugar_g:         0,
        sodium_mg:       0,
        saturated_fat_g: 0,
      })
    })

    it('sums macros across multiple meals that each have a matched recipe', () => {
      const breakfast = makeRecipe({
        id: 'recipe-b', calories: 300, protein_g: 20, carbs_g: 40, fat_g: 8,
      })
      const lunch = makeRecipe({
        id: 'recipe-l', calories: 600, protein_g: 35, carbs_g: 70, fat_g: 18,
      })
      const dinner = makeRecipe({
        id: 'recipe-d', calories: 800, protein_g: 50, carbs_g: 90, fat_g: 25,
      })
      const dayPlan: DayPlan = {
        breakfast: makeMeal({ id: 'meal-b', recipe_id: 'recipe-b' }),
        lunch:     makeMeal({ id: 'meal-l', recipe_id: 'recipe-l' }),
        dinner:    makeMeal({ id: 'meal-d', recipe_id: 'recipe-d' }),
      }

      const result = getDayNutrition(dayPlan, [breakfast, lunch, dinner])

      expect(result).toEqual({
        calories:        1700,
        protein_g:       105,
        carbs_g:         200,
        fat_g:           51,
        fiber_g:         0,
        sugar_g:         0,
        sodium_mg:       0,
        saturated_fat_g: 0,
      })
    })
  })

  describe('skipping non-matching meals', () => {
    it('skips a meal whose recipe_id does not match any recipe', () => {
      const recipe = makeRecipe({
        id:        'recipe-1',
        calories:  400,
        protein_g: 25,
        carbs_g:   50,
        fat_g:     10,
      })
      const dayPlan: DayPlan = {
        breakfast: makeMeal({ id: 'meal-a', recipe_id: 'recipe-1' }),
        lunch:     makeMeal({ id: 'meal-b', recipe_id: 'recipe-DOES-NOT-EXIST' }),
      }

      const result = getDayNutrition(dayPlan, [recipe])

      // Only the breakfast recipe contributes
      expect(result).toEqual({
        calories:        400,
        protein_g:       25,
        carbs_g:         50,
        fat_g:           10,
        fiber_g:         0,
        sugar_g:         0,
        sodium_mg:       0,
        saturated_fat_g: 0,
      })
    })

    it('skips a meal with no recipe_id even when matching recipes exist', () => {
      const recipe = makeRecipe({
        id:        'recipe-1',
        calories:  400,
        protein_g: 25,
        carbs_g:   50,
        fat_g:     10,
      })
      const dayPlan: DayPlan = {
        breakfast: makeMeal({ id: 'meal-a', recipe_id: 'recipe-1' }),
        lunch:     makeMeal({ id: 'meal-b' }),  // no recipe_id
      }

      const result = getDayNutrition(dayPlan, [recipe])

      expect(result).toEqual({
        calories:        400,
        protein_g:       25,
        carbs_g:         50,
        fat_g:           10,
        fiber_g:         0,
        sugar_g:         0,
        sodium_mg:       0,
        saturated_fat_g: 0,
      })
    })
  })

  describe('null and undefined macro fields', () => {
    it('treats null macro fields on a recipe as 0', () => {
      // Cast is needed because the Recipe type uses optional (?) not null,
      // but the DB may return null at runtime — the source handles this with ?? 0.
      const recipe = makeRecipe({
        id:        'recipe-1',
        calories:  null as unknown as number,
        protein_g: null as unknown as number,
        carbs_g:   null as unknown as number,
        fat_g:     null as unknown as number,
      })
      const dayPlan: DayPlan = {
        breakfast: makeMeal({ recipe_id: 'recipe-1' }),
      }

      const result = getDayNutrition(dayPlan, [recipe])

      expect(result).toEqual(ZERO_TOTALS)
    })

    it('treats undefined macro fields on a recipe as 0', () => {
      // Recipe fields calories/protein_g/carbs_g/fat_g are all optional
      const recipe = makeRecipe({ id: 'recipe-1' }) // macros intentionally omitted
      const dayPlan: DayPlan = {
        breakfast: makeMeal({ recipe_id: 'recipe-1' }),
      }

      const result = getDayNutrition(dayPlan, [recipe])

      expect(result).toEqual(ZERO_TOTALS)
    })

    it('handles a mix of defined and undefined macro fields, treating undefined as 0', () => {
      const recipe = makeRecipe({
        id:        'recipe-1',
        calories:  200,
        // protein_g, carbs_g, fat_g intentionally omitted
      })
      const dayPlan: DayPlan = {
        breakfast: makeMeal({ recipe_id: 'recipe-1' }),
      }

      const result = getDayNutrition(dayPlan, [recipe])

      expect(result).toEqual({
        calories:        200,
        protein_g:       0,
        carbs_g:         0,
        fat_g:           0,
        fiber_g:         0,
        sugar_g:         0,
        sodium_mg:       0,
        saturated_fat_g: 0,
      })
    })
  })

  describe('mixed dayPlan scenarios', () => {
    it('correctly aggregates when some meals match, some are unmatched, and some have no recipe_id', () => {
      const recipeA = makeRecipe({
        id:        'recipe-a',
        calories:  300,
        protein_g: 20,
        carbs_g:   40,
        fat_g:     8,
      })
      const recipeB = makeRecipe({
        id:        'recipe-b',
        calories:  500,
        protein_g: 40,
        carbs_g:   55,
        fat_g:     12,
      })
      const dayPlan: DayPlan = {
        breakfast: makeMeal({ id: 'meal-1', recipe_id: 'recipe-a' }),          // matched
        lunch:     makeMeal({ id: 'meal-2', recipe_id: 'recipe-b' }),          // matched
        snack:     makeMeal({ id: 'meal-3', recipe_id: 'recipe-MISSING' }),    // unmatched
        dinner:    makeMeal({ id: 'meal-4' }),                                 // no recipe_id
      }

      const result = getDayNutrition(dayPlan, [recipeA, recipeB])

      expect(result).toEqual({
        calories:        800,  // 300 + 500
        protein_g:       60,   // 20 + 40
        carbs_g:         95,   // 40 + 55
        fat_g:           20,   // 8 + 12
        fiber_g:         0,
        sugar_g:         0,
        sodium_mg:       0,
        saturated_fat_g: 0,
      })
    })
  })
})
