/**
 * Unit tests for hooks/useRecipes.ts
 *
 * Covers:
 *   - fetchRecipes: no-op when no session, fetches ordered list, sets error
 *   - importRecipe: no session guard, edge-function call, DB insert, fetch errors, DB errors
 *   - saveManualRecipe: no session guard, successful insert, error handling
 *   - deleteRecipe: optimistic removal, refetch on error
 *   - addIngredientsToShoppingList: session/familyId guard, empty ingredients guard,
 *                                    upsert call, returns count, error handling
 */

import { renderHook, act, waitFor } from '@testing-library/react-native'
import { useRecipes, Recipe } from '../useRecipes'

// ---------------------------------------------------------------------------
// Mock: global fetch (used by importRecipe's edge-function call)
// ---------------------------------------------------------------------------

const mockFetch = jest.fn()
global.fetch = mockFetch

// ---------------------------------------------------------------------------
// Supabase chainable mock
//
// useRecipes uses three distinct query shapes:
//   fetchRecipes:  from('recipes').select('*').order(...)          → mockOrderResolve
//   importRecipe:  from('recipes').insert(...).select('*').single() → mockSingleResolve
//   saveManual:    from('recipes').insert(...).select('*').single() → mockSingleResolve
//   deleteRecipe:  from('recipes').delete().eq('id', id)           → mockDeleteEqResolve
//   addIngredients:from('shopping_items').upsert(...).select('id') → mockUpsertSelectResolve
//
// We keep one `mockFrom` and rebuild the full chain in beforeEach.
// ---------------------------------------------------------------------------

const mockFrom = jest.fn()

jest.mock('@/lib/supabase', () => {
  // Import the outer mockFrom via a module-scope reference so the mock factory
  // can delegate to it. We accomplish this by storing it on a shared object.
  const holder = { fn: null as jest.Mock | null }
  // Expose the holder so beforeEach can update it.
  ;(globalThis as any).__supabaseMockHolder__ = holder
  return {
    supabase: {
      from: (...args: unknown[]) => holder.fn!(...args),
    },
  }
})

// ---------------------------------------------------------------------------
// Mock: @/context/AuthContext
// ---------------------------------------------------------------------------

const mockSession = {
  user:         { id: 'user-xyz' },
  access_token: 'tok-xyz',
}

const mockUseAuth = jest.fn()

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

// ---------------------------------------------------------------------------
// Terminal mock fns — recreated fresh each test
// ---------------------------------------------------------------------------

let mockOrderResolve:        jest.Mock  // fetchRecipes terminal
let mockSingleResolve:       jest.Mock  // insert → select → single terminal
let mockDeleteEqResolve:     jest.Mock  // delete → eq terminal
let mockUpsertSelectResolve: jest.Mock  // upsert → select terminal

// ---------------------------------------------------------------------------
// Builder factories
// ---------------------------------------------------------------------------

/**
 * Builds a full Supabase query-builder mock for the 'recipes' table.
 * The shape covers all chains useRecipes uses on that table.
 */
function makeRecipesBuilder() {
  return {
    // fetchRecipes chain: .select('*').order(...)
    select: jest.fn().mockReturnValue({
      order: mockOrderResolve,
    }),
    // importRecipe / saveManualRecipe chain: .insert({...}).select('*').single()
    insert: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: mockSingleResolve,
      }),
    }),
    // deleteRecipe chain: .delete().eq('id', id)
    delete: jest.fn().mockReturnValue({
      eq: mockDeleteEqResolve,
    }),
  }
}

/**
 * Builds a Supabase query-builder mock for the 'shopping_items' table.
 * addIngredientsToShoppingList chain: .upsert({...}, opts).select('id')
 */
function makeShoppingBuilder() {
  return {
    upsert: jest.fn().mockReturnValue({
      select: mockUpsertSelectResolve,
    }),
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAMILY_ID = 'family-1'

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    id:           'recipe-1',
    title:        'Pasta Primavera',
    ingredients:  ['pasta', 'vegetables', 'olive oil'],
    instructions: ['Boil pasta', 'Sauté vegetables', 'Combine'],
    created_at:   '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

function mockFetchSuccess(body: object, status = 200): Promise<Response> {
  const text = JSON.stringify(body)
  return Promise.resolve({
    ok:     true,
    status,
    text:   () => Promise.resolve(text),
  } as unknown as Response)
}

function mockFetchHttpError(status: number, body: object = {}): Promise<Response> {
  const text = JSON.stringify(body)
  return Promise.resolve({
    ok:     false,
    status,
    text:   () => Promise.resolve(text),
  } as unknown as Response)
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  // Recreate terminal mocks so no resolved value bleeds between tests
  mockOrderResolve        = jest.fn()
  mockSingleResolve       = jest.fn()
  mockDeleteEqResolve     = jest.fn()
  mockUpsertSelectResolve = jest.fn()

  // Default session
  mockUseAuth.mockReturnValue({ session: mockSession })

  // Wire mockFrom to return the right builder depending on the table name
  mockFrom.mockImplementation((table: string) => {
    if (table === 'shopping_items') return makeShoppingBuilder()
    return makeRecipesBuilder()
  })

  // Attach mockFrom to the holder so the Supabase mock can delegate
  ;(globalThis as any).__supabaseMockHolder__.fn = mockFrom

  // Default terminal resolutions (can be overridden per-test)
  mockOrderResolve.mockResolvedValue({ data: [], error: null })
  mockSingleResolve.mockResolvedValue({ data: null, error: null })
  mockDeleteEqResolve.mockResolvedValue({ error: null })
  mockUpsertSelectResolve.mockResolvedValue({ data: [], error: null })
})

afterEach(() => {
  jest.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Tests: initial state
// ---------------------------------------------------------------------------

describe('useRecipes — initial state', () => {
  it('starts with empty recipes, not importing, and no error', async () => {
    // Prevent the auto-fetch from resolving so we see the raw initial values
    mockOrderResolve.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useRecipes(FAMILY_ID))

    expect(result.current.recipes).toEqual([])
    expect(result.current.importing).toBe(false)
    expect(result.current.error).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tests: fetchRecipes
// ---------------------------------------------------------------------------

describe('useRecipes — fetchRecipes', () => {
  it('does nothing when there is no session', async () => {
    mockUseAuth.mockReturnValue({ session: null })

    const { result } = renderHook(() => useRecipes(FAMILY_ID))
    await act(async () => {})

    expect(mockFrom).not.toHaveBeenCalled()
    expect(result.current.recipes).toEqual([])
    expect(result.current.loading).toBe(false)
  })

  it('queries the recipes table ordered by created_at descending', async () => {
    let capturedBuilder: ReturnType<typeof makeRecipesBuilder> | undefined
    mockFrom.mockImplementation((table: string) => {
      if (table === 'shopping_items') return makeShoppingBuilder()
      capturedBuilder = makeRecipesBuilder()
      return capturedBuilder
    })

    renderHook(() => useRecipes(FAMILY_ID))
    await waitFor(() => expect(mockOrderResolve).toHaveBeenCalledTimes(1))

    expect(mockFrom).toHaveBeenCalledWith('recipes')
    expect(capturedBuilder!.select).toHaveBeenCalledWith('*')
    expect(mockOrderResolve).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('sets recipes state with the returned rows on success', async () => {
    const rows = [makeRecipe({ id: 'r-1' }), makeRecipe({ id: 'r-2', title: 'Soup' })]
    mockOrderResolve.mockResolvedValue({ data: rows, error: null })

    const { result } = renderHook(() => useRecipes(FAMILY_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.recipes).toHaveLength(2)
    expect(result.current.recipes[0].id).toBe('r-1')
    expect(result.current.recipes[1].title).toBe('Soup')
  })

  it('sets error state when the query fails', async () => {
    mockOrderResolve.mockResolvedValue({ data: null, error: { message: 'connection refused' } })

    const { result } = renderHook(() => useRecipes(FAMILY_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBe('connection refused')
    expect(result.current.recipes).toEqual([])
  })

  it('sets loading to true during fetch and false when done', async () => {
    let resolve!: (v: unknown) => void
    mockOrderResolve.mockReturnValue(new Promise(res => { resolve = res }))

    const { result } = renderHook(() => useRecipes(FAMILY_ID))
    await waitFor(() => expect(result.current.loading).toBe(true))

    await act(async () => { resolve({ data: [], error: null }) })

    await waitFor(() => expect(result.current.loading).toBe(false))
  })
})

// ---------------------------------------------------------------------------
// Tests: importRecipe
// ---------------------------------------------------------------------------

describe('useRecipes — importRecipe', () => {
  const SOURCE_URL  = 'https://example.com/pasta-recipe'
  const PARSED_DATA = {
    title:        'Pasta Primavera',
    description:  'A tasty pasta dish',
    source_url:   SOURCE_URL,
    image_url:    null,
    ingredients:  ['pasta', 'veggies'],
    instructions: ['Cook pasta', 'Add veggies'],
    servings:     '4',
    prep_time:    '10 min',
    cook_time:    '20 min',
    calories:     400,
    protein_g:    15,
    carbs_g:      60,
    fat_g:        10,
  }
  const SAVED_RECIPE = makeRecipe({ ...PARSED_DATA, id: 'imported-1' })

  it('returns null immediately when there is no session', async () => {
    mockUseAuth.mockReturnValue({ session: null })

    const { result } = renderHook(() => useRecipes(FAMILY_ID))
    await act(async () => {})

    let returned: Recipe | null = makeRecipe()
    await act(async () => {
      returned = await result.current.importRecipe(SOURCE_URL)
    })

    expect(returned).toBeNull()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('calls the parse-recipe edge function with the correct headers and body', async () => {
    mockFetch.mockResolvedValue(mockFetchSuccess(PARSED_DATA))
    mockSingleResolve.mockResolvedValue({ data: SAVED_RECIPE, error: null })

    const { result } = renderHook(() => useRecipes(FAMILY_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.importRecipe(SOURCE_URL)
    })

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/functions/v1/parse-recipe'),
      expect.objectContaining({
        method:  'POST',
        headers: expect.objectContaining({
          'Content-Type':  'application/json',
          'Authorization': 'Bearer tok-xyz',
        }),
        body: JSON.stringify({ url: SOURCE_URL }),
      })
    )
  })

  it('inserts the parsed data into the recipes table', async () => {
    mockFetch.mockResolvedValue(mockFetchSuccess(PARSED_DATA))
    mockSingleResolve.mockResolvedValue({ data: SAVED_RECIPE, error: null })

    let capturedInsertArgs: unknown
    mockFrom.mockImplementation((table: string) => {
      const builder = makeRecipesBuilder()
      if (table === 'recipes') {
        builder.insert = jest.fn().mockImplementation((...args: unknown[]) => {
          capturedInsertArgs = args[0]
          return { select: jest.fn().mockReturnValue({ single: mockSingleResolve }) }
        })
      }
      return builder
    })

    const { result } = renderHook(() => useRecipes(FAMILY_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.importRecipe(SOURCE_URL)
    })

    expect(capturedInsertArgs).toMatchObject({
      user_id:   'user-xyz',
      family_id: FAMILY_ID,
      title:     PARSED_DATA.title,
    })
  })

  it('prepends the saved recipe to the recipes list and returns it', async () => {
    const existing = makeRecipe({ id: 'old-r' })
    mockOrderResolve.mockResolvedValue({ data: [existing], error: null })
    mockFetch.mockResolvedValue(mockFetchSuccess(PARSED_DATA))
    mockSingleResolve.mockResolvedValue({ data: SAVED_RECIPE, error: null })

    const { result } = renderHook(() => useRecipes(FAMILY_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let returned: Recipe | null = null
    await act(async () => {
      returned = await result.current.importRecipe(SOURCE_URL)
    })

    expect(returned).toEqual(SAVED_RECIPE)
    expect(result.current.recipes[0]).toEqual(SAVED_RECIPE)
    expect(result.current.recipes[1]).toEqual(existing)
  })

  it('sets importing to true during the operation and false when done', async () => {
    let resolveFetch!: (v: Response) => void
    mockFetch.mockReturnValue(new Promise<Response>(res => { resolveFetch = res }))

    const { result } = renderHook(() => useRecipes(FAMILY_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Kick off without awaiting
    act(() => { void result.current.importRecipe(SOURCE_URL) })

    await waitFor(() => expect(result.current.importing).toBe(true))

    mockSingleResolve.mockResolvedValue({ data: SAVED_RECIPE, error: null })
    await act(async () => {
      resolveFetch({
        ok:     true,
        status: 200,
        text:   () => Promise.resolve(JSON.stringify(PARSED_DATA)),
      } as unknown as Response)
    })

    await waitFor(() => expect(result.current.importing).toBe(false))
  })

  it('sets error and returns null when the edge function returns a non-ok status', async () => {
    mockFetch.mockResolvedValue(mockFetchHttpError(500, { error: 'server exploded' }))

    const { result } = renderHook(() => useRecipes(FAMILY_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let returned: Recipe | null = makeRecipe()
    await act(async () => {
      returned = await result.current.importRecipe(SOURCE_URL)
    })

    expect(returned).toBeNull()
    expect(result.current.error).toBe('server exploded')
    expect(result.current.importing).toBe(false)
  })

  it('sets error using the HTTP status when the error body has no error field', async () => {
    mockFetch.mockResolvedValue(mockFetchHttpError(503, {}))

    const { result } = renderHook(() => useRecipes(FAMILY_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.importRecipe(SOURCE_URL)
    })

    expect(result.current.error).toBe('HTTP 503')
  })

  it('sets error when the edge function returns ok but the JSON contains an error field', async () => {
    mockFetch.mockResolvedValue(mockFetchSuccess({ error: 'parse failed' }))

    const { result } = renderHook(() => useRecipes(FAMILY_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let returned: Recipe | null = makeRecipe()
    await act(async () => {
      returned = await result.current.importRecipe(SOURCE_URL)
    })

    expect(returned).toBeNull()
    expect(result.current.error).toBe('parse failed')
  })

  it('handles non-JSON edge-function responses gracefully', async () => {
    mockFetch.mockResolvedValue({
      ok:     false,
      status: 502,
      text:   () => Promise.resolve('Bad Gateway'),
    } as unknown as Response)

    const { result } = renderHook(() => useRecipes(FAMILY_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.importRecipe(SOURCE_URL)
    })

    // Non-JSON body is caught; parsed becomes { error: 'Bad Gateway' }
    expect(result.current.error).toBe('Bad Gateway')
  })

  it('sets error and returns null when the DB insert fails', async () => {
    mockFetch.mockResolvedValue(mockFetchSuccess(PARSED_DATA))
    mockSingleResolve.mockResolvedValue({ data: null, error: { message: 'DB insert error' } })

    const { result } = renderHook(() => useRecipes(FAMILY_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let returned: Recipe | null = makeRecipe()
    await act(async () => {
      returned = await result.current.importRecipe(SOURCE_URL)
    })

    expect(returned).toBeNull()
    expect(result.current.error).toBe('DB insert error')
    expect(result.current.importing).toBe(false)
  })

  it('does not add anything to recipes when the DB insert fails', async () => {
    mockFetch.mockResolvedValue(mockFetchSuccess(PARSED_DATA))
    mockSingleResolve.mockResolvedValue({ data: null, error: { message: 'fail' } })

    const { result } = renderHook(() => useRecipes(FAMILY_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.importRecipe(SOURCE_URL)
    })

    expect(result.current.recipes).toEqual([])
  })

  it('uses null for family_id when familyId prop is null', async () => {
    mockFetch.mockResolvedValue(mockFetchSuccess(PARSED_DATA))
    mockSingleResolve.mockResolvedValue({ data: SAVED_RECIPE, error: null })

    let capturedInsertArgs: unknown
    mockFrom.mockImplementation((table: string) => {
      const builder = makeRecipesBuilder()
      if (table === 'recipes') {
        builder.insert = jest.fn().mockImplementation((...args: unknown[]) => {
          capturedInsertArgs = args[0]
          return { select: jest.fn().mockReturnValue({ single: mockSingleResolve }) }
        })
      }
      return builder
    })

    const { result } = renderHook(() => useRecipes(null))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.importRecipe(SOURCE_URL)
    })

    expect((capturedInsertArgs as Record<string, unknown>).family_id).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tests: saveManualRecipe
// ---------------------------------------------------------------------------

describe('useRecipes — saveManualRecipe', () => {
  const MANUAL_FIELDS = {
    title:        'Homemade Granola',
    ingredients:  ['oats', 'honey', 'nuts'],
    instructions: ['Mix', 'Bake at 180°C for 25 min'],
    servings:     '8',
  }
  const SAVED_RECIPE = makeRecipe({ ...MANUAL_FIELDS, id: 'manual-1' })

  it('returns null immediately when there is no session', async () => {
    mockUseAuth.mockReturnValue({ session: null })

    const { result } = renderHook(() => useRecipes(FAMILY_ID))
    await act(async () => {})

    let returned: Recipe | null = makeRecipe()
    await act(async () => {
      returned = await result.current.saveManualRecipe(MANUAL_FIELDS)
    })

    expect(returned).toBeNull()
    // from() is only called for fetchRecipes when session exists — not here
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('inserts with user_id, family_id, and all provided fields', async () => {
    mockSingleResolve.mockResolvedValue({ data: SAVED_RECIPE, error: null })

    let capturedInsertArgs: unknown
    mockFrom.mockImplementation((table: string) => {
      const builder = makeRecipesBuilder()
      if (table === 'recipes') {
        builder.insert = jest.fn().mockImplementation((...args: unknown[]) => {
          capturedInsertArgs = args[0]
          return { select: jest.fn().mockReturnValue({ single: mockSingleResolve }) }
        })
      }
      return builder
    })

    const { result } = renderHook(() => useRecipes(FAMILY_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.saveManualRecipe(MANUAL_FIELDS)
    })

    expect(capturedInsertArgs).toMatchObject({
      user_id:      'user-xyz',
      family_id:    FAMILY_ID,
      title:        'Homemade Granola',
      ingredients:  MANUAL_FIELDS.ingredients,
      instructions: MANUAL_FIELDS.instructions,
      servings:     '8',
    })
  })

  it('maps optional undefined fields to null in the insert payload', async () => {
    mockSingleResolve.mockResolvedValue({ data: SAVED_RECIPE, error: null })

    let capturedInsertArgs: unknown
    mockFrom.mockImplementation((table: string) => {
      const builder = makeRecipesBuilder()
      if (table === 'recipes') {
        builder.insert = jest.fn().mockImplementation((...args: unknown[]) => {
          capturedInsertArgs = args[0]
          return { select: jest.fn().mockReturnValue({ single: mockSingleResolve }) }
        })
      }
      return builder
    })

    const { result } = renderHook(() => useRecipes(FAMILY_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.saveManualRecipe({
        title:        'Minimal Recipe',
        ingredients:  ['egg'],
        instructions: ['Crack egg'],
      })
    })

    const args = capturedInsertArgs as Record<string, unknown>
    expect(args.image_url).toBeNull()
    expect(args.servings).toBeNull()
    expect(args.prep_time).toBeNull()
    expect(args.cook_time).toBeNull()
    expect(args.calories).toBeNull()
    expect(args.protein_g).toBeNull()
    expect(args.carbs_g).toBeNull()
    expect(args.fat_g).toBeNull()
  })

  it('prepends the new recipe to the list and returns it', async () => {
    const existing = makeRecipe({ id: 'existing-r' })
    mockOrderResolve.mockResolvedValue({ data: [existing], error: null })
    mockSingleResolve.mockResolvedValue({ data: SAVED_RECIPE, error: null })

    const { result } = renderHook(() => useRecipes(FAMILY_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let returned: Recipe | null = null
    await act(async () => {
      returned = await result.current.saveManualRecipe(MANUAL_FIELDS)
    })

    expect(returned).toEqual(SAVED_RECIPE)
    expect(result.current.recipes[0]).toEqual(SAVED_RECIPE)
    expect(result.current.recipes[1]).toEqual(existing)
  })

  it('sets error and returns null when the DB insert fails', async () => {
    mockSingleResolve.mockResolvedValue({ data: null, error: { message: 'unique constraint' } })

    const { result } = renderHook(() => useRecipes(FAMILY_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let returned: Recipe | null = makeRecipe()
    await act(async () => {
      returned = await result.current.saveManualRecipe(MANUAL_FIELDS)
    })

    expect(returned).toBeNull()
    expect(result.current.error).toBe('unique constraint')
  })

  it('does not add anything to recipes when the insert fails', async () => {
    mockSingleResolve.mockResolvedValue({ data: null, error: { message: 'fail' } })

    const { result } = renderHook(() => useRecipes(FAMILY_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.saveManualRecipe(MANUAL_FIELDS)
    })

    expect(result.current.recipes).toEqual([])
  })

  it('uses null for family_id when familyId prop is null', async () => {
    mockSingleResolve.mockResolvedValue({ data: SAVED_RECIPE, error: null })

    let capturedInsertArgs: unknown
    mockFrom.mockImplementation((table: string) => {
      const builder = makeRecipesBuilder()
      if (table === 'recipes') {
        builder.insert = jest.fn().mockImplementation((...args: unknown[]) => {
          capturedInsertArgs = args[0]
          return { select: jest.fn().mockReturnValue({ single: mockSingleResolve }) }
        })
      }
      return builder
    })

    const { result } = renderHook(() => useRecipes(null))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.saveManualRecipe(MANUAL_FIELDS)
    })

    expect((capturedInsertArgs as Record<string, unknown>).family_id).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tests: deleteRecipe
// ---------------------------------------------------------------------------

describe('useRecipes — deleteRecipe', () => {
  const r1 = makeRecipe({ id: 'r-1', title: 'Recipe One' })
  const r2 = makeRecipe({ id: 'r-2', title: 'Recipe Two' })

  beforeEach(() => {
    mockOrderResolve.mockResolvedValue({ data: [r1, r2], error: null })
  })

  it('removes the recipe from the list optimistically before the DB call resolves', async () => {
    // DB never resolves — we are testing only the optimistic state update
    mockDeleteEqResolve.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useRecipes(FAMILY_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => { void result.current.deleteRecipe('r-1') })

    await waitFor(() =>
      expect(result.current.recipes.find(r => r.id === 'r-1')).toBeUndefined()
    )
    expect(result.current.recipes.find(r => r.id === 'r-2')).toBeDefined()
  })

  it('calls supabase delete with the correct recipe id', async () => {
    let capturedEqArgs: unknown[]
    const origDeleteEq = mockDeleteEqResolve
    mockFrom.mockImplementation((table: string) => {
      const builder = makeRecipesBuilder()
      builder.delete = jest.fn().mockReturnValue({
        eq: jest.fn().mockImplementation((...args: unknown[]) => {
          capturedEqArgs = args
          return origDeleteEq(...args)
        }),
      })
      return builder
    })

    const { result } = renderHook(() => useRecipes(FAMILY_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.deleteRecipe('r-1')
    })

    expect(capturedEqArgs!).toEqual(['id', 'r-1'])
  })

  it('keeps the recipe removed from state on a successful delete', async () => {
    const { result } = renderHook(() => useRecipes(FAMILY_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.deleteRecipe('r-1')
    })

    expect(result.current.recipes.map(r => r.id)).toEqual(['r-2'])
  })

  it('re-fetches recipes when the DB delete fails, restoring the full list', async () => {
    mockDeleteEqResolve.mockResolvedValue({ error: { message: 'delete not allowed' } })
    // The refetch (fetchRecipes called after error) returns the original rows
    mockOrderResolve
      .mockResolvedValueOnce({ data: [r1, r2], error: null })  // initial fetch
      .mockResolvedValueOnce({ data: [r1, r2], error: null })  // refetch after error

    const { result } = renderHook(() => useRecipes(FAMILY_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.deleteRecipe('r-1')
    })

    // fetchRecipes() is called after the delete error — order() is called twice total
    expect(mockOrderResolve).toHaveBeenCalledTimes(2)
    // The refetch restores all recipes (the optimistic removal is undone)
    await waitFor(() => expect(result.current.recipes).toHaveLength(2))
  })
})

// ---------------------------------------------------------------------------
// Tests: addIngredientsToShoppingList
// ---------------------------------------------------------------------------

describe('useRecipes — addIngredientsToShoppingList', () => {
  const recipe = makeRecipe({
    id:          'r-1',
    ingredients: ['pasta', 'olive oil', 'garlic'],
  })

  it('returns 0 when there is no session', async () => {
    mockUseAuth.mockReturnValue({ session: null })

    const { result } = renderHook(() => useRecipes(FAMILY_ID))
    await act(async () => {})

    let count = -1
    await act(async () => {
      count = await result.current.addIngredientsToShoppingList(recipe)
    })

    expect(count).toBe(0)
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('returns 0 when familyId is null', async () => {
    const { result } = renderHook(() => useRecipes(null))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let count = -1
    await act(async () => {
      count = await result.current.addIngredientsToShoppingList(recipe)
    })

    expect(count).toBe(0)
    // shopping_items table should not have been touched
    const shoppingCalls = mockFrom.mock.calls.filter(c => c[0] === 'shopping_items')
    expect(shoppingCalls).toHaveLength(0)
  })

  it('returns 0 when the recipe has no ingredients', async () => {
    const emptyRecipe = makeRecipe({ ingredients: [] })

    const { result } = renderHook(() => useRecipes(FAMILY_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let count = -1
    await act(async () => {
      count = await result.current.addIngredientsToShoppingList(emptyRecipe)
    })

    expect(count).toBe(0)
    const shoppingCalls = mockFrom.mock.calls.filter(c => c[0] === 'shopping_items')
    expect(shoppingCalls).toHaveLength(0)
  })

  it('upserts one row per ingredient with the correct shape', async () => {
    let capturedUpsertArgs: unknown
    let capturedUpsertOpts: unknown
    mockFrom.mockImplementation((table: string) => {
      if (table === 'shopping_items') {
        return {
          upsert: jest.fn().mockImplementation((...args: unknown[]) => {
            capturedUpsertArgs = args[0]
            capturedUpsertOpts = args[1]
            return { select: mockUpsertSelectResolve }
          }),
        }
      }
      return makeRecipesBuilder()
    })
    mockUpsertSelectResolve.mockResolvedValue({ data: [{ id: 'si-1' }, { id: 'si-2' }, { id: 'si-3' }], error: null })

    const { result } = renderHook(() => useRecipes(FAMILY_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.addIngredientsToShoppingList(recipe)
    })

    expect(capturedUpsertArgs).toEqual([
      { family_id: FAMILY_ID, name: 'pasta',     added_by: 'user-xyz' },
      { family_id: FAMILY_ID, name: 'olive oil', added_by: 'user-xyz' },
      { family_id: FAMILY_ID, name: 'garlic',    added_by: 'user-xyz' },
    ])
    expect(capturedUpsertOpts).toEqual({ onConflict: 'family_id,name', ignoreDuplicates: true })
  })

  it('returns the number of rows returned by the select after upsert', async () => {
    mockUpsertSelectResolve.mockResolvedValue({
      data: [{ id: 'si-1' }, { id: 'si-2' }],
      error: null,
    })

    const { result } = renderHook(() => useRecipes(FAMILY_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let count = -1
    await act(async () => {
      count = await result.current.addIngredientsToShoppingList(recipe)
    })

    expect(count).toBe(2)
  })

  it('returns 0 when the upsert result has null data', async () => {
    mockUpsertSelectResolve.mockResolvedValue({ data: null, error: null })

    const { result } = renderHook(() => useRecipes(FAMILY_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let count = -1
    await act(async () => {
      count = await result.current.addIngredientsToShoppingList(recipe)
    })

    expect(count).toBe(0)
  })

  it('sets error and returns 0 when the upsert fails', async () => {
    mockUpsertSelectResolve.mockResolvedValue({ data: null, error: { message: 'upsert failed' } })

    const { result } = renderHook(() => useRecipes(FAMILY_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    let count = -1
    await act(async () => {
      count = await result.current.addIngredientsToShoppingList(recipe)
    })

    expect(count).toBe(0)
    expect(result.current.error).toBe('upsert failed')
  })
})
