# Unit Test Writer — Agent Memory

See `patterns.md` for detailed patterns and solutions.

## Key Facts

- **Test runner**: `jest-expo` preset (v54), `@testing-library/react-native` (v13), Jest 29
- **Run tests**: `npm test` or `npx jest hooks/__tests__/`
- **Config files**: `jest.config.js` and `babel.config.js` at project root (created)
- **Path alias**: `@/` maps to `<rootDir>/` — handled automatically by `jest-expo` reading `tsconfig.json`
- **Test location**: `hooks/__tests__/` (e.g., `useMealPlan.test.ts`, `useRecipes.test.ts`)

## Critical Patterns

1. **`jest.clearAllMocks()` clears mockReturnValue implementations** — always recreate mock fns in `beforeEach`, never rely on module-scope `.mockReturnValue()` surviving between tests.
2. **Chainable Supabase builder** — use a factory function (`makeQueryBuilder()`) called inside `mockFrom.mockImplementation()` in `beforeEach`. Store terminal `jest.fn()`s (e.g. `mockLteResolve`, `mockSingleResolve`) as `let` variables, recreated in `beforeEach`.
3. **`supabase.from` mock via `globalThis` holder** — for modules that import `supabase` statically, use a holder pattern: factory sets `(globalThis as any).__supabaseMockHolder__.fn = mockFrom` in `beforeEach`; the `jest.mock()` factory delegates via that holder.
4. **`deleteRecipe` error path** — `fetchRecipes()` immediately calls `setError(null)`, so the delete error is cleared by the refetch. Assert on call counts instead of error state after a delete-fail refetch.

## Verified Supabase Query Shapes in This Codebase

| Hook | Table | Chain |
|------|-------|-------|
| `useMealPlan.fetchWeek` | `meal_plans` | `.from().select().gte().lte()` |
| `useMealPlan.saveMeal` (update) | `meal_plans` | `.from().update({}).eq('id',id)` |
| `useMealPlan.saveMeal` (insert) | `meal_plans` | `.from().insert({}).select().single()` |
| `useMealPlan.deleteMeal` | `meal_plans` | `.from().delete().eq('id',id)` |
| `useRecipes.fetchRecipes` | `recipes` | `.from().select('*').order()` |
| `useRecipes.importRecipe` / `saveManualRecipe` | `recipes` | `.from().insert({}).select('*').single()` |
| `useRecipes.deleteRecipe` | `recipes` | `.from().delete().eq('id',id)` |
| `useRecipes.addIngredientsToShoppingList` | `shopping_items` | `.from().upsert([],opts).select('id')` |
