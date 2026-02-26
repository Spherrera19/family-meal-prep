/**
 * Unit tests for hooks/useUserProfile.ts
 *
 * Covers:
 *   - fetchProfile: no-op when no session
 *   - fetchProfile: returns DEFAULTS when no profile row exists (PGRST116 error code)
 *   - fetchProfile: treats any other error code as a real error (sets error state)
 *   - fetchProfile: returns fetched values when row exists
 *   - fetchProfile: fills missing DB fields from DEFAULTS (null coalescing)
 *   - fetchProfile: loading state transitions
 *   - saveProfile: calls upsert with the merged profile (current + updates)
 *   - saveProfile: updates local profile state on success
 *   - saveProfile: sets error when upsert fails and does not update profile
 *   - saveProfile: does nothing when there is no session
 */

import { renderHook, act, waitFor } from '@testing-library/react-native'
import { useUserProfile } from '../useUserProfile'

// ---------------------------------------------------------------------------
// Supabase chainable mock (globalThis holder pattern)
//
// useUserProfile uses two distinct query shapes:
//   fetchProfile: from('user_profiles').select(...).eq('id', uid).single()  → mockSingleResolve
//   saveProfile:  from('user_profiles').upsert({...})                       → mockUpsertResolve
// ---------------------------------------------------------------------------

const mockFrom = jest.fn()

jest.mock('@/lib/supabase', () => {
  const holder = { fn: null as jest.Mock | null }
  ;(globalThis as any).__supabaseProfileMockHolder__ = holder
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
  user:         { id: 'user-profile-1' },
  access_token: 'tok-profile',
}

const mockUseAuth = jest.fn()

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

// ---------------------------------------------------------------------------
// Terminal mock fns — recreated fresh each test
// ---------------------------------------------------------------------------

let mockSingleResolve: jest.Mock  // fetchProfile terminal: select().eq().single()
let mockUpsertResolve: jest.Mock  // saveProfile terminal: upsert()

// ---------------------------------------------------------------------------
// Builder factories
// ---------------------------------------------------------------------------

/**
 * fetchProfile chain: .select(...).eq('id', uid).single()
 */
function makeProfileFetchBuilder() {
  return {
    select: jest.fn().mockReturnValue({
      eq: jest.fn().mockReturnValue({
        single: mockSingleResolve,
      }),
    }),
  }
}

/**
 * saveProfile chain: .upsert({...})
 * upsert() is the terminal — it returns the promise directly.
 */
function makeProfileUpsertBuilder() {
  return {
    upsert: mockUpsertResolve,
  }
}

// ---------------------------------------------------------------------------
// DEFAULTS (must match the values declared in the source file)
// ---------------------------------------------------------------------------

const DEFAULTS = {
  daily_calories:  2000,
  daily_protein_g: 150,
  daily_carbs_g:   250,
  daily_fat_g:     65,
  weight_unit:     'lbs' as const,
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockSingleResolve = jest.fn()
  mockUpsertResolve = jest.fn()

  mockUseAuth.mockReturnValue({ session: mockSession })

  // Wire mockFrom to return the right builder based on invocation order.
  // fetchProfile always runs first (via useEffect). saveProfile is called
  // explicitly in tests, so we swap the builder on demand.
  mockFrom.mockImplementation(() => makeProfileFetchBuilder())

  ;(globalThis as any).__supabaseProfileMockHolder__.fn = mockFrom

  // Default terminal resolutions
  mockSingleResolve.mockResolvedValue({ data: null, error: null })
  mockUpsertResolve.mockResolvedValue({ error: null })
})

afterEach(() => {
  jest.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProfileRow(overrides: Partial<typeof DEFAULTS> = {}) {
  return {
    daily_calories:  DEFAULTS.daily_calories,
    daily_protein_g: DEFAULTS.daily_protein_g,
    daily_carbs_g:   DEFAULTS.daily_carbs_g,
    daily_fat_g:     DEFAULTS.daily_fat_g,
    weight_unit:     DEFAULTS.weight_unit,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests: initial state
// ---------------------------------------------------------------------------

describe('useUserProfile — initial state', () => {
  it('starts with DEFAULTS, loading (in-flight), and no error', async () => {
    // Keep the first fetch pending — effect fires synchronously in act(),
    // so setLoading(true) is called before we read the state.
    mockSingleResolve.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useUserProfile())

    expect(result.current.profile).toEqual(DEFAULTS)
    expect(result.current.loading).toBe(true)
    expect(result.current.error).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tests: fetchProfile
// ---------------------------------------------------------------------------

describe('useUserProfile — fetchProfile', () => {
  it('does nothing when there is no session', async () => {
    mockUseAuth.mockReturnValue({ session: null })

    const { result } = renderHook(() => useUserProfile())
    await act(async () => {})

    expect(mockFrom).not.toHaveBeenCalled()
    expect(result.current.profile).toEqual(DEFAULTS)
    expect(result.current.loading).toBe(false)
  })

  it('keeps DEFAULTS and sets no error when the error code is PGRST116 (no row found)', async () => {
    mockSingleResolve.mockResolvedValue({
      data:  null,
      error: { code: 'PGRST116', message: 'no rows returned' },
    })

    const { result } = renderHook(() => useUserProfile())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.profile).toEqual(DEFAULTS)
    expect(result.current.error).toBeNull()
  })

  it('sets error state when any non-PGRST116 error is returned', async () => {
    mockSingleResolve.mockResolvedValue({
      data:  null,
      error: { code: 'PGRST200', message: 'schema cache lookup failed' },
    })

    const { result } = renderHook(() => useUserProfile())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBe('schema cache lookup failed')
    expect(result.current.profile).toEqual(DEFAULTS)
  })

  it('sets profile state from the returned row when the query succeeds', async () => {
    const row = makeProfileRow({
      daily_calories:  2500,
      daily_protein_g: 180,
      daily_carbs_g:   300,
      daily_fat_g:     80,
      weight_unit:     'kg',
    })
    mockSingleResolve.mockResolvedValue({ data: row, error: null })

    const { result } = renderHook(() => useUserProfile())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.profile).toEqual({
      daily_calories:  2500,
      daily_protein_g: 180,
      daily_carbs_g:   300,
      daily_fat_g:     80,
      weight_unit:     'kg',
    })
    expect(result.current.error).toBeNull()
  })

  it('falls back to DEFAULTS for any null field in the returned row', async () => {
    // Simulate a row where some columns haven't been set yet
    const row = {
      daily_calories:  null,
      daily_protein_g: null,
      daily_carbs_g:   null,
      daily_fat_g:     null,
      weight_unit:     null,
    }
    mockSingleResolve.mockResolvedValue({ data: row, error: null })

    const { result } = renderHook(() => useUserProfile())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.profile).toEqual(DEFAULTS)
  })

  it('queries user_profiles with the session user id', async () => {
    let capturedBuilder: ReturnType<typeof makeProfileFetchBuilder> | undefined
    mockFrom.mockImplementation(() => {
      capturedBuilder = makeProfileFetchBuilder()
      return capturedBuilder
    })

    renderHook(() => useUserProfile())
    await waitFor(() => expect(mockSingleResolve).toHaveBeenCalledTimes(1))

    expect(mockFrom).toHaveBeenCalledWith('user_profiles')
    // Verify the select columns string
    expect(capturedBuilder!.select).toHaveBeenCalledWith(
      'daily_calories, daily_protein_g, daily_carbs_g, daily_fat_g, weight_unit'
    )
    // Verify the eq filter targets the session user id
    const eqMock = capturedBuilder!.select.mock.results[0].value.eq as jest.Mock
    expect(eqMock).toHaveBeenCalledWith('id', mockSession.user.id)
  })

  it('sets loading to true during the fetch and false after it resolves', async () => {
    let resolveQuery!: (v: unknown) => void
    mockSingleResolve.mockReturnValue(new Promise(res => { resolveQuery = res }))

    const { result } = renderHook(() => useUserProfile())
    await waitFor(() => expect(result.current.loading).toBe(true))

    await act(async () => {
      resolveQuery({ data: makeProfileRow(), error: null })
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
  })
})

// ---------------------------------------------------------------------------
// Tests: saveProfile
// ---------------------------------------------------------------------------

describe('useUserProfile — saveProfile', () => {
  /**
   * Helper: render the hook with a pre-loaded profile row so we have a
   * non-default starting state to verify merging against.
   */
  async function renderWithLoadedProfile(rowOverrides: Partial<typeof DEFAULTS> = {}) {
    const row = makeProfileRow(rowOverrides)
    mockSingleResolve.mockResolvedValue({ data: row, error: null })

    const { result } = renderHook(() => useUserProfile())
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Switch mockFrom to return the upsert builder for subsequent calls
    mockFrom.mockImplementation(() => makeProfileUpsertBuilder())

    return result
  }

  it('does nothing when there is no session', async () => {
    mockUseAuth.mockReturnValue({ session: null })

    const { result } = renderHook(() => useUserProfile())
    await act(async () => {})

    const fromCallsBefore = mockFrom.mock.calls.length

    await act(async () => {
      await result.current.saveProfile({ daily_calories: 3000 })
    })

    expect(mockFrom.mock.calls.length).toBe(fromCallsBefore)
  })

  it('calls upsert on user_profiles with the merged profile and session user id', async () => {
    const result = await renderWithLoadedProfile({
      daily_calories:  2500,
      daily_protein_g: 180,
      daily_carbs_g:   300,
      daily_fat_g:     80,
      weight_unit:     'kg',
    })

    let capturedUpsertArgs: unknown
    mockFrom.mockImplementation(() => ({
      upsert: jest.fn().mockImplementation((...args: unknown[]) => {
        capturedUpsertArgs = args[0]
        return mockUpsertResolve()
      }),
    }))

    await act(async () => {
      await result.current.saveProfile({ daily_calories: 3000 })
    })

    expect(capturedUpsertArgs).toMatchObject({
      id:              mockSession.user.id,
      daily_calories:  3000,   // updated
      daily_protein_g: 180,    // unchanged from loaded profile
      daily_carbs_g:   300,
      daily_fat_g:     80,
      weight_unit:     'kg',
    })
  })

  it('includes updated_at as a valid ISO string in the upsert payload', async () => {
    const result = await renderWithLoadedProfile()

    let capturedUpsertArgs: Record<string, unknown> | undefined
    mockFrom.mockImplementation(() => ({
      upsert: jest.fn().mockImplementation((...args: unknown[]) => {
        capturedUpsertArgs = args[0] as Record<string, unknown>
        return mockUpsertResolve()
      }),
    }))

    await act(async () => {
      await result.current.saveProfile({ weight_unit: 'kg' })
    })

    expect(typeof capturedUpsertArgs!.updated_at).toBe('string')
    expect(() => new Date(capturedUpsertArgs!.updated_at as string).toISOString()).not.toThrow()
  })

  it('updates local profile state after a successful upsert', async () => {
    const result = await renderWithLoadedProfile({
      daily_calories:  2000,
      daily_protein_g: 150,
    })

    await act(async () => {
      await result.current.saveProfile({ daily_calories: 2800, daily_protein_g: 200 })
    })

    expect(result.current.profile.daily_calories).toBe(2800)
    expect(result.current.profile.daily_protein_g).toBe(200)
  })

  it('merges partial updates, preserving unchanged fields in local state', async () => {
    const result = await renderWithLoadedProfile({
      daily_calories:  2500,
      daily_protein_g: 180,
      daily_carbs_g:   300,
      daily_fat_g:     80,
      weight_unit:     'kg',
    })

    await act(async () => {
      await result.current.saveProfile({ weight_unit: 'lbs' })
    })

    expect(result.current.profile).toEqual({
      daily_calories:  2500,
      daily_protein_g: 180,
      daily_carbs_g:   300,
      daily_fat_g:     80,
      weight_unit:     'lbs',
    })
  })

  it('sets error and does not update profile state when upsert fails', async () => {
    const result = await renderWithLoadedProfile({
      daily_calories: 2000,
    })

    mockFrom.mockImplementation(() => ({
      upsert: jest.fn().mockResolvedValue({ error: { message: 'upsert constraint violation' } }),
    }))

    await act(async () => {
      await result.current.saveProfile({ daily_calories: 9999 })
    })

    expect(result.current.error).toBe('upsert constraint violation')
    // Profile state should be unchanged from before the failed save
    expect(result.current.profile.daily_calories).toBe(2000)
  })
})
