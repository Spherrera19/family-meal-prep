/**
 * Unit tests for hooks/useMealPlan.ts
 *
 * Covers:
 *   - rowsToWeekPlan (via fetchWeek behaviour)
 *   - fetchWeek: no-op when no session, correct query params, success, error
 *   - saveMeal: update path (existing meal), insert path (new meal), error handling
 *   - deleteMeal: no-op when meal absent, delete + state removal, error handling
 */

import { renderHook, act, waitFor } from '@testing-library/react-native'
import { useMealPlan } from '../useMealPlan'

// ---------------------------------------------------------------------------
// Supabase chainable mock
//
// Strategy: `supabase.from` returns a fresh builder object on every call.
// The builder exposes all the intermediate chain methods (returning `this`)
// and a small set of terminal jest.fn()s that tests override per scenario.
// We store references to the terminal fns so tests can set their resolved
// values without needing to navigate the chain themselves.
// ---------------------------------------------------------------------------

// Terminal mock functions — tests call .mockResolvedValue() on these directly.
let mockLteResolve: jest.Mock       // terminal for fetchWeek chain
let mockEqResolve: jest.Mock        // terminal for update/delete chains
let mockSingleResolve: jest.Mock    // terminal for insert chain

function makeQueryBuilder() {
  // A chainable builder: every non-terminal method returns `this`.
  const builder: Record<string, jest.Mock> = {}

  const returnSelf = jest.fn().mockReturnThis()

  builder.select = jest.fn().mockImplementation(function (this: typeof builder) {
    // After select we may chain: .gte (fetchWeek) OR .single (insert)
    return {
      gte:    jest.fn().mockReturnValue({ lte: mockLteResolve }),
      single: mockSingleResolve,
    }
  })

  builder.update = jest.fn().mockReturnValue({
    eq: mockEqResolve,
  })

  builder.insert = jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      single: mockSingleResolve,
    }),
  })

  builder.delete = jest.fn().mockReturnValue({
    eq: mockEqResolve,
  })

  return builder
}

// The top-level `from` mock — returns a fresh builder each call.
const mockFrom = jest.fn()

jest.mock('@/lib/supabase', () => ({
  supabase: {
    // Delegate to the outer mockFrom so we can track calls.
    get from() { return mockFrom },
  },
}))

// ---------------------------------------------------------------------------
// Mock: @/context/AuthContext
// ---------------------------------------------------------------------------

const mockSession = {
  user:         { id: 'user-abc' },
  access_token: 'tok-abc',
}

const mockUseAuth = jest.fn()

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const START = '2024-01-01'
const END   = '2024-01-07'

function makeMealRow(overrides: Partial<{
  id: string
  date: string
  meal_type: string
  name: string
  note: string | null
  recipe_id: string | null
}> = {}) {
  return {
    id:        'meal-1',
    date:      '2024-01-01',
    meal_type: 'breakfast',
    name:      'Oatmeal',
    note:      null,
    recipe_id: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Recreate terminal mocks fresh for every test so implementations don't leak.
  mockLteResolve    = jest.fn()
  mockEqResolve     = jest.fn()
  mockSingleResolve = jest.fn()

  // Default: authenticated session
  mockUseAuth.mockReturnValue({ session: mockSession })

  // Default: from() returns a builder; fetchWeek lte resolves with empty data
  mockFrom.mockImplementation(() => makeQueryBuilder())
  mockLteResolve.mockResolvedValue({ data: [], error: null })
})

afterEach(() => {
  jest.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Tests: initial state
// ---------------------------------------------------------------------------

describe('useMealPlan — initial state', () => {
  it('starts with an empty plan, not saving, and no error', async () => {
    const { result } = renderHook(() => useMealPlan(START, END))

    // Before any async effect flushes these values hold their defaults
    expect(result.current.plan).toEqual({})
    expect(result.current.saving).toBe(false)
    expect(result.current.error).toBeNull()

    // Let the auto-triggered fetchWeek complete so it doesn't leak into other tests
    await waitFor(() => expect(result.current.loading).toBe(false))
  })
})

// ---------------------------------------------------------------------------
// Tests: fetchWeek
// ---------------------------------------------------------------------------

describe('useMealPlan — fetchWeek', () => {
  it('does nothing when there is no session', async () => {
    mockUseAuth.mockReturnValue({ session: null })

    const { result } = renderHook(() => useMealPlan(START, END))
    await act(async () => {})

    expect(mockFrom).not.toHaveBeenCalled()
    expect(result.current.plan).toEqual({})
    expect(result.current.loading).toBe(false)
  })

  it('queries meal_plans with the correct date range', async () => {
    // We need to capture the builder to assert on its methods
    let capturedBuilder: ReturnType<typeof makeQueryBuilder> | undefined
    mockFrom.mockImplementation(() => {
      capturedBuilder = makeQueryBuilder()
      return capturedBuilder
    })

    renderHook(() => useMealPlan(START, END))
    await waitFor(() => expect(mockLteResolve).toHaveBeenCalledTimes(1))

    expect(mockFrom).toHaveBeenCalledWith('meal_plans')
    expect(capturedBuilder!.select).toHaveBeenCalledWith('id, date, meal_type, name, note, recipe_id')
    // gte and lte are chained inside the builder — verify via call args on the terminal
    expect(mockLteResolve).toHaveBeenCalledWith('date', END)
  })

  it('sets plan state when the query succeeds with rows', async () => {
    const rows = [
      makeMealRow({ date: '2024-01-01', meal_type: 'breakfast', name: 'Oatmeal' }),
      makeMealRow({ id: 'meal-2', date: '2024-01-01', meal_type: 'lunch', name: 'Salad' }),
      makeMealRow({ id: 'meal-3', date: '2024-01-02', meal_type: 'dinner', name: 'Pasta', note: 'al dente', recipe_id: 'rec-1' }),
    ]
    mockLteResolve.mockResolvedValue({ data: rows, error: null })

    const { result } = renderHook(() => useMealPlan(START, END))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.plan).toEqual({
      '2024-01-01': {
        breakfast: { id: 'meal-1', name: 'Oatmeal', note: undefined, recipe_id: undefined },
        lunch:     { id: 'meal-2', name: 'Salad',   note: undefined, recipe_id: undefined },
      },
      '2024-01-02': {
        dinner: { id: 'meal-3', name: 'Pasta', note: 'al dente', recipe_id: 'rec-1' },
      },
    })
  })

  it('converts null note and recipe_id to undefined in the plan', async () => {
    const rows = [makeMealRow({ note: null, recipe_id: null })]
    mockLteResolve.mockResolvedValue({ data: rows, error: null })

    const { result } = renderHook(() => useMealPlan(START, END))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const meal = result.current.plan['2024-01-01']['breakfast']
    expect(meal.note).toBeUndefined()
    expect(meal.recipe_id).toBeUndefined()
  })

  it('sets error state and leaves plan empty when the query fails', async () => {
    mockLteResolve.mockResolvedValue({ data: null, error: { message: 'DB unavailable' } })

    const { result } = renderHook(() => useMealPlan(START, END))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBe('DB unavailable')
    expect(result.current.plan).toEqual({})
  })

  it('sets loading to true during the fetch and false after it resolves', async () => {
    let resolveQuery!: (v: unknown) => void
    mockLteResolve.mockReturnValue(new Promise(res => { resolveQuery = res }))

    const { result } = renderHook(() => useMealPlan(START, END))
    await waitFor(() => expect(result.current.loading).toBe(true))

    await act(async () => { resolveQuery({ data: [], error: null }) })

    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  it('handles an empty rows array and produces an empty plan', async () => {
    mockLteResolve.mockResolvedValue({ data: [], error: null })

    const { result } = renderHook(() => useMealPlan(START, END))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.plan).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// Tests: rowsToWeekPlan (exercised through fetchWeek)
// ---------------------------------------------------------------------------

describe('useMealPlan — rowsToWeekPlan (via fetchWeek)', () => {
  it('groups multiple meal types on the same date under one date key', async () => {
    const rows = [
      makeMealRow({ id: 'a', date: '2024-01-03', meal_type: 'breakfast', name: 'Toast' }),
      makeMealRow({ id: 'b', date: '2024-01-03', meal_type: 'dinner',    name: 'Steak' }),
    ]
    mockLteResolve.mockResolvedValue({ data: rows, error: null })

    const { result } = renderHook(() => useMealPlan(START, END))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(Object.keys(result.current.plan)).toEqual(['2024-01-03'])
    expect(Object.keys(result.current.plan['2024-01-03'])).toEqual(['breakfast', 'dinner'])
  })

  it('handles meals spanning multiple dates independently', async () => {
    const rows = [
      makeMealRow({ id: 'a', date: '2024-01-01', meal_type: 'lunch', name: 'Wrap' }),
      makeMealRow({ id: 'b', date: '2024-01-05', meal_type: 'lunch', name: 'Soup' }),
    ]
    mockLteResolve.mockResolvedValue({ data: rows, error: null })

    const { result } = renderHook(() => useMealPlan(START, END))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.plan['2024-01-01']['lunch'].name).toBe('Wrap')
    expect(result.current.plan['2024-01-05']['lunch'].name).toBe('Soup')
  })
})

// ---------------------------------------------------------------------------
// Tests: saveMeal (update path — meal already exists in plan)
// ---------------------------------------------------------------------------

describe('useMealPlan — saveMeal (update existing meal)', () => {
  /** Render the hook with one meal already loaded in the plan. */
  async function renderWithExistingMeal() {
    const existingRow = makeMealRow({ id: 'meal-99', name: 'Old Name', note: 'old note', recipe_id: null })
    mockLteResolve.mockResolvedValue({ data: [existingRow], error: null })

    const { result } = renderHook(() => useMealPlan(START, END))
    await waitFor(() => expect(result.current.loading).toBe(false))
    return result
  }

  it('calls supabase update with the new name, note, and recipe_id', async () => {
    mockEqResolve.mockResolvedValue({ error: null })
    const result = await renderWithExistingMeal()

    let capturedUpdateArgs: unknown
    const builder = makeQueryBuilder()
    const origUpdate = builder.update
    builder.update = jest.fn().mockImplementation((...args: unknown[]) => {
      capturedUpdateArgs = args[0]
      return { eq: mockEqResolve }
    })
    mockFrom.mockImplementationOnce(() => builder)

    await act(async () => {
      await result.current.saveMeal('2024-01-01', 'breakfast', 'New Name', 'new note', 'rec-5')
    })

    expect(capturedUpdateArgs).toEqual({ name: 'New Name', note: 'new note', recipe_id: 'rec-5' })
    expect(mockEqResolve).toHaveBeenCalledWith('id', 'meal-99')
  })

  it('stores null for note when an empty string is passed', async () => {
    mockEqResolve.mockResolvedValue({ error: null })
    const result = await renderWithExistingMeal()

    let capturedArgs: unknown
    const builder = makeQueryBuilder()
    builder.update = jest.fn().mockImplementation((...args: unknown[]) => {
      capturedArgs = args[0]
      return { eq: mockEqResolve }
    })
    mockFrom.mockImplementationOnce(() => builder)

    await act(async () => {
      await result.current.saveMeal('2024-01-01', 'breakfast', 'New Name', '')
    })

    expect((capturedArgs as Record<string, unknown>).note).toBeNull()
  })

  it('stores null for recipe_id when recipeId is undefined', async () => {
    mockEqResolve.mockResolvedValue({ error: null })
    const result = await renderWithExistingMeal()

    let capturedArgs: unknown
    const builder = makeQueryBuilder()
    builder.update = jest.fn().mockImplementation((...args: unknown[]) => {
      capturedArgs = args[0]
      return { eq: mockEqResolve }
    })
    mockFrom.mockImplementationOnce(() => builder)

    await act(async () => {
      await result.current.saveMeal('2024-01-01', 'breakfast', 'New Name', 'a note')
    })

    expect((capturedArgs as Record<string, unknown>).recipe_id).toBeNull()
  })

  it('updates local plan state after a successful update', async () => {
    mockEqResolve.mockResolvedValue({ error: null })
    mockFrom.mockImplementation(() => makeQueryBuilder())
    const result = await renderWithExistingMeal()

    await act(async () => {
      await result.current.saveMeal('2024-01-01', 'breakfast', 'Updated Meal', 'updated note', 'rec-7')
    })

    expect(result.current.plan['2024-01-01']['breakfast']).toMatchObject({
      id:        'meal-99',
      name:      'Updated Meal',
      note:      'updated note',
      recipe_id: 'rec-7',
    })
  })

  it('sets error and does not update plan state when update fails', async () => {
    mockEqResolve.mockResolvedValue({ error: { message: 'Update failed' } })
    mockFrom.mockImplementation(() => makeQueryBuilder())
    const result = await renderWithExistingMeal()

    await act(async () => {
      await result.current.saveMeal('2024-01-01', 'breakfast', 'New Name')
    })

    expect(result.current.error).toBe('Update failed')
    expect(result.current.plan['2024-01-01']['breakfast'].name).toBe('Old Name')
  })

  it('resets saving to false after a failed update', async () => {
    mockEqResolve.mockResolvedValue({ error: { message: 'oops' } })
    mockFrom.mockImplementation(() => makeQueryBuilder())
    const result = await renderWithExistingMeal()

    await act(async () => {
      await result.current.saveMeal('2024-01-01', 'breakfast', 'X')
    })

    expect(result.current.saving).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Tests: saveMeal (insert path — meal does not yet exist)
// ---------------------------------------------------------------------------

describe('useMealPlan — saveMeal (insert new meal)', () => {
  const newRow = {
    id:        'meal-new',
    date:      '2024-01-03',
    meal_type: 'dinner',
    name:      'Tacos',
    note:      null,
    recipe_id: null,
  }

  beforeEach(() => {
    // fetchWeek returns empty so the plan has no existing entry
    mockLteResolve.mockResolvedValue({ data: [], error: null })
    // Default: insert succeeds
    mockSingleResolve.mockResolvedValue({ data: newRow, error: null })
  })

  it('calls supabase insert with user_id, date, meal_type, name, note, recipe_id', async () => {
    const { result } = renderHook(() => useMealPlan(START, END))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let capturedInsertArgs: unknown
    const builder = makeQueryBuilder()
    builder.insert = jest.fn().mockImplementation((...args: unknown[]) => {
      capturedInsertArgs = args[0]
      return { select: jest.fn().mockReturnValue({ single: mockSingleResolve }) }
    })
    mockFrom.mockImplementationOnce(() => builder)

    await act(async () => {
      await result.current.saveMeal('2024-01-03', 'dinner', 'Tacos')
    })

    expect(capturedInsertArgs).toEqual({
      user_id:   'user-abc',
      date:      '2024-01-03',
      meal_type: 'dinner',
      name:      'Tacos',
      note:      null,
      recipe_id: null,
    })
  })

  it('prepends the new meal into local plan state after a successful insert', async () => {
    const { result } = renderHook(() => useMealPlan(START, END))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.saveMeal('2024-01-03', 'dinner', 'Tacos')
    })

    expect(result.current.plan['2024-01-03']['dinner']).toEqual({
      id:        'meal-new',
      name:      'Tacos',
      note:      undefined,
      recipe_id: undefined,
    })
  })

  it('maps null note and recipe_id from the DB row to undefined in the plan', async () => {
    const { result } = renderHook(() => useMealPlan(START, END))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.saveMeal('2024-01-03', 'dinner', 'Tacos')
    })

    const meal = result.current.plan['2024-01-03']['dinner']
    expect(meal.note).toBeUndefined()
    expect(meal.recipe_id).toBeUndefined()
  })

  it('passes the note and recipe_id through to the insert payload', async () => {
    mockSingleResolve.mockResolvedValue({
      data: { ...newRow, note: 'spicy', recipe_id: 'rec-2' },
      error: null,
    })

    const { result } = renderHook(() => useMealPlan(START, END))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let capturedInsertArgs: unknown
    const builder = makeQueryBuilder()
    builder.insert = jest.fn().mockImplementation((...args: unknown[]) => {
      capturedInsertArgs = args[0]
      return { select: jest.fn().mockReturnValue({ single: mockSingleResolve }) }
    })
    mockFrom.mockImplementationOnce(() => builder)

    await act(async () => {
      await result.current.saveMeal('2024-01-03', 'dinner', 'Tacos', 'spicy', 'rec-2')
    })

    expect((capturedInsertArgs as Record<string, unknown>).note).toBe('spicy')
    expect((capturedInsertArgs as Record<string, unknown>).recipe_id).toBe('rec-2')
  })

  it('sets error and does not add the meal to the plan when insert fails', async () => {
    mockSingleResolve.mockResolvedValue({ data: null, error: { message: 'Insert failed' } })

    const { result } = renderHook(() => useMealPlan(START, END))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.saveMeal('2024-01-03', 'dinner', 'Tacos')
    })

    expect(result.current.error).toBe('Insert failed')
    expect(result.current.plan['2024-01-03']).toBeUndefined()
  })

  it('resets saving to false after a failed insert', async () => {
    mockSingleResolve.mockResolvedValue({ data: null, error: { message: 'oops' } })

    const { result } = renderHook(() => useMealPlan(START, END))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.saveMeal('2024-01-03', 'dinner', 'Tacos')
    })

    expect(result.current.saving).toBe(false)
  })

  it('does nothing when there is no session', async () => {
    mockUseAuth.mockReturnValue({ session: null })

    const { result } = renderHook(() => useMealPlan(START, END))
    await act(async () => {})

    // fromCallCount before saveMeal
    const fromCallsBefore = mockFrom.mock.calls.length

    await act(async () => {
      await result.current.saveMeal('2024-01-03', 'dinner', 'Tacos')
    })

    // No new calls to from() should have been made
    expect(mockFrom.mock.calls.length).toBe(fromCallsBefore)
  })
})

// ---------------------------------------------------------------------------
// Tests: deleteMeal
// ---------------------------------------------------------------------------

describe('useMealPlan — deleteMeal', () => {
  /** Render the hook with a single meal on 2024-01-04 lunch. */
  async function renderWithMeal() {
    const row = makeMealRow({ id: 'meal-del', date: '2024-01-04', meal_type: 'lunch', name: 'Wrap' })
    mockLteResolve.mockResolvedValue({ data: [row], error: null })

    const { result } = renderHook(() => useMealPlan(START, END))
    await waitFor(() => expect(result.current.loading).toBe(false))
    return result
  }

  it('does nothing when the specified meal does not exist in the plan', async () => {
    const result = await renderWithMeal()
    const fromCallsBefore = mockFrom.mock.calls.length

    await act(async () => {
      await result.current.deleteMeal('2024-01-04', 'breakfast') // only lunch exists
    })

    expect(mockFrom.mock.calls.length).toBe(fromCallsBefore)
  })

  it('calls supabase delete with the correct meal id', async () => {
    mockEqResolve.mockResolvedValue({ error: null })
    const result = await renderWithMeal()

    let capturedEqArgs: unknown
    const builder = makeQueryBuilder()
    builder.delete = jest.fn().mockReturnValue({
      eq: jest.fn().mockImplementation((...args: unknown[]) => {
        capturedEqArgs = args
        return mockEqResolve(...args)
      }),
    })
    mockFrom.mockImplementationOnce(() => builder)

    await act(async () => {
      await result.current.deleteMeal('2024-01-04', 'lunch')
    })

    expect(capturedEqArgs).toEqual(['id', 'meal-del'])
  })

  it('removes the meal from the local plan state on success', async () => {
    mockEqResolve.mockResolvedValue({ error: null })
    mockFrom.mockImplementation(() => makeQueryBuilder())
    const result = await renderWithMeal()

    await act(async () => {
      await result.current.deleteMeal('2024-01-04', 'lunch')
    })

    expect(result.current.plan['2024-01-04']['lunch']).toBeUndefined()
  })

  it('keeps other meal types on the same date when one is deleted', async () => {
    const rows = [
      makeMealRow({ id: 'meal-a', date: '2024-01-04', meal_type: 'breakfast', name: 'Toast' }),
      makeMealRow({ id: 'meal-b', date: '2024-01-04', meal_type: 'lunch',     name: 'Wrap' }),
    ]
    mockLteResolve.mockResolvedValue({ data: rows, error: null })
    mockEqResolve.mockResolvedValue({ error: null })

    const { result } = renderHook(() => useMealPlan(START, END))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.deleteMeal('2024-01-04', 'lunch')
    })

    expect(result.current.plan['2024-01-04']['breakfast']).toBeDefined()
    expect(result.current.plan['2024-01-04']['lunch']).toBeUndefined()
  })

  it('sets error when the delete query fails', async () => {
    mockEqResolve.mockResolvedValue({ error: { message: 'Delete failed' } })
    mockFrom.mockImplementation(() => makeQueryBuilder())
    const result = await renderWithMeal()

    await act(async () => {
      await result.current.deleteMeal('2024-01-04', 'lunch')
    })

    expect(result.current.error).toBe('Delete failed')
  })

  it('does not remove the meal from the plan when the delete fails', async () => {
    mockEqResolve.mockResolvedValue({ error: { message: 'Delete failed' } })
    mockFrom.mockImplementation(() => makeQueryBuilder())
    const result = await renderWithMeal()

    await act(async () => {
      await result.current.deleteMeal('2024-01-04', 'lunch')
    })

    expect(result.current.plan['2024-01-04']['lunch']).toBeDefined()
  })

  it('resets saving to false after a failed delete', async () => {
    mockEqResolve.mockResolvedValue({ error: { message: 'oops' } })
    mockFrom.mockImplementation(() => makeQueryBuilder())
    const result = await renderWithMeal()

    await act(async () => {
      await result.current.deleteMeal('2024-01-04', 'lunch')
    })

    expect(result.current.saving).toBe(false)
  })
})
