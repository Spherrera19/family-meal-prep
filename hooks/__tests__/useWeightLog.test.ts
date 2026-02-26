/**
 * Unit tests for hooks/useWeightLog.ts
 *
 * Covers:
 *   - fetchLogs: no-op when no session
 *   - fetchLogs: populates logs state on success
 *   - fetchLogs: sets error on failure
 *   - fetchLogs: passes optional startDate/endDate filters
 *   - fetchLogs: loading state transitions
 *   - logWeight: calls upsert with correct payload
 *   - logWeight: prepends the new log to state (and replaces an existing log for same date)
 *   - logWeight: sorts by date descending and caps at 10 entries
 *   - logWeight: sets error when upsert fails
 *   - logWeight: does nothing when there is no session
 *   - deleteLog: removes the entry optimistically before the DB resolves
 *   - deleteLog: calls supabase delete with the correct log id
 *   - deleteLog: keeps the entry removed on successful delete
 *   - deleteLog: restores entry via refetch when delete fails
 *   - deleteLog: sets error when delete fails
 */

import { renderHook, act, waitFor } from '@testing-library/react-native'
import { useWeightLog } from '../useWeightLog'

// ---------------------------------------------------------------------------
// Supabase chainable mock (globalThis holder pattern)
//
// useWeightLog uses three distinct query shapes:
//
//   fetchLogs:
//     from('weight_logs').select(...).order(...).limit(10)
//       [.gte('date', startDate)]           — optional
//       [.lte('date', endDate)]             — optional
//     The optional gte/lte calls are chained on the same builder object and
//     whatever the last method in the chain is becomes the awaited promise.
//     We model this by having each intermediate method return an object that
//     exposes all possible next steps, all resolving to mockFetchLogsResolve.
//
//   logWeight:
//     from('weight_logs').upsert({...}, opts).select(...).single()  → mockLogWeightSingleResolve
//
//   deleteLog:
//     from('weight_logs').delete().eq('id', id)                     → mockDeleteEqResolve
// ---------------------------------------------------------------------------

const mockFrom = jest.fn()

jest.mock('@/lib/supabase', () => {
  const holder = { fn: null as jest.Mock | null }
  ;(globalThis as any).__supabaseWeightLogMockHolder__ = holder
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
  user:         { id: 'user-wl-1' },
  access_token: 'tok-wl',
}

const mockUseAuth = jest.fn()

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

// ---------------------------------------------------------------------------
// Terminal mock fns — recreated fresh each test
// ---------------------------------------------------------------------------

let mockFetchLogsResolve:        jest.Mock  // terminal for all fetchLogs chain endings
let mockLogWeightSingleResolve:  jest.Mock  // logWeight: upsert().select().single()
let mockDeleteEqResolve:         jest.Mock  // deleteLog: delete().eq()

// ---------------------------------------------------------------------------
// Builder factory
//
// fetchLogs chain:
//   .select(...).order(...).limit(n)[.gte(...)][.lte(...)]
//
// Since gte/lte are optional and any of them might be the terminal awaited
// call, we model the whole chain as a "thenable chain" object where every
// method returns an object that itself looks like a promise and also exposes
// the next chain methods (gte, lte). We achieve this by making the object
// behave as the terminal at any point while still supporting further chaining.
//
// The simplest correct approach: every intermediate returns an object that has
// all the remaining optional chain methods, all resolving via mockFetchLogsResolve.
// This covers the three real call patterns:
//   1. ..limit(10)               → awaited directly
//   2. ..limit(10).gte(x)        → awaited after gte
//   3. ..limit(10).gte(x).lte(y) → awaited after lte
// ---------------------------------------------------------------------------

function makeTerminalNode(): jest.Mock & { gte: jest.Mock; lte: jest.Mock } {
  // A node that can be awaited (via .then on the mock's resolved value)
  // OR further chained with gte/lte.
  const node = jest.fn().mockImplementation(() => {
    // When called as a function (shouldn't happen) fallback to the terminal
    return mockFetchLogsResolve()
  }) as jest.Mock & { gte: jest.Mock; lte: jest.Mock }

  // Each node resolves when awaited via the terminal mock
  // We implement this by making the mock itself return a promise when invoked
  // — but the real pattern is that the whole builder is `await`ed, so the
  // terminal node must be thenable. We achieve this through a plain object
  // with a then() method.
  return node
}

/**
 * Creates a thenable terminal node that satisfies both:
 *  - being awaitable (Promise.resolve delegates to it via .then)
 *  - supporting further .gte() and .lte() chaining
 */
function makeThenableNode() {
  function buildNode(): Record<string, unknown> {
    return {
      then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        mockFetchLogsResolve().then(onFulfilled, onRejected),
      gte: jest.fn().mockImplementation(() => buildNode()),
      lte: jest.fn().mockImplementation(() => buildNode()),
    }
  }
  return buildNode()
}

function makeWeightLogBuilder() {
  return {
    // fetchLogs chain
    select: jest.fn().mockReturnValue({
      order: jest.fn().mockReturnValue({
        limit: jest.fn().mockImplementation(() => makeThenableNode()),
      }),
    }),
    // logWeight chain
    upsert: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: mockLogWeightSingleResolve,
      }),
    }),
    // deleteLog chain
    delete: jest.fn().mockReturnValue({
      eq: mockDeleteEqResolve,
    }),
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWeightLog(overrides: Partial<{
  id: string; date: string; weight: number; unit: string
}> = {}) {
  return {
    id:     overrides.id     ?? 'wl-1',
    date:   overrides.date   ?? '2024-01-15',
    weight: overrides.weight ?? 75,
    unit:   overrides.unit   ?? 'kg',
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockFetchLogsResolve       = jest.fn()
  mockLogWeightSingleResolve = jest.fn()
  mockDeleteEqResolve        = jest.fn()

  mockUseAuth.mockReturnValue({ session: mockSession })

  mockFrom.mockImplementation(() => makeWeightLogBuilder())
  ;(globalThis as any).__supabaseWeightLogMockHolder__.fn = mockFrom

  // Default terminal resolutions
  mockFetchLogsResolve.mockResolvedValue({ data: [], error: null })
  mockLogWeightSingleResolve.mockResolvedValue({ data: null, error: null })
  mockDeleteEqResolve.mockResolvedValue({ error: null })
})

afterEach(() => {
  jest.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Tests: initial state
// ---------------------------------------------------------------------------

describe('useWeightLog — initial state', () => {
  it('starts with empty logs, loading (in-flight), and no error', async () => {
    // Keep the first fetch pending — effect fires synchronously in act(),
    // so setLoading(true) is called before we read the state.
    mockFetchLogsResolve.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useWeightLog())

    expect(result.current.logs).toEqual([])
    expect(result.current.loading).toBe(true)
    expect(result.current.error).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tests: fetchLogs
// ---------------------------------------------------------------------------

describe('useWeightLog — fetchLogs', () => {
  it('does nothing when there is no session', async () => {
    mockUseAuth.mockReturnValue({ session: null })

    const { result } = renderHook(() => useWeightLog())
    await act(async () => {})

    expect(mockFrom).not.toHaveBeenCalled()
    expect(result.current.logs).toEqual([])
    expect(result.current.loading).toBe(false)
  })

  it('queries weight_logs with select, order, and limit', async () => {
    let capturedBuilder: ReturnType<typeof makeWeightLogBuilder> | undefined
    mockFrom.mockImplementation(() => {
      capturedBuilder = makeWeightLogBuilder()
      return capturedBuilder
    })

    renderHook(() => useWeightLog())
    await waitFor(() => expect(mockFetchLogsResolve).toHaveBeenCalledTimes(1))

    expect(mockFrom).toHaveBeenCalledWith('weight_logs')
    expect(capturedBuilder!.select).toHaveBeenCalledWith('id, date, weight, unit')

    const orderMock = capturedBuilder!.select.mock.results[0].value.order as jest.Mock
    expect(orderMock).toHaveBeenCalledWith('date', { ascending: false })

    const limitMock = orderMock.mock.results[0].value.limit as jest.Mock
    expect(limitMock).toHaveBeenCalledWith(10)
  })

  it('populates logs state with the returned rows on success', async () => {
    const logs = [
      makeWeightLog({ id: 'wl-1', date: '2024-01-15', weight: 75 }),
      makeWeightLog({ id: 'wl-2', date: '2024-01-08', weight: 76 }),
    ]
    mockFetchLogsResolve.mockResolvedValue({ data: logs, error: null })

    const { result } = renderHook(() => useWeightLog())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.logs).toHaveLength(2)
    expect(result.current.logs[0].id).toBe('wl-1')
    expect(result.current.logs[1].id).toBe('wl-2')
  })

  it('sets logs to empty array when data is null', async () => {
    mockFetchLogsResolve.mockResolvedValue({ data: null, error: null })

    const { result } = renderHook(() => useWeightLog())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.logs).toEqual([])
  })

  it('sets error state when the query fails', async () => {
    mockFetchLogsResolve.mockResolvedValue({
      data:  null,
      error: { message: 'permission denied' },
    })

    const { result } = renderHook(() => useWeightLog())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.error).toBe('permission denied')
    expect(result.current.logs).toEqual([])
  })

  it('sets loading to true during fetch and false when done', async () => {
    let resolveQuery!: (v: unknown) => void
    mockFetchLogsResolve.mockReturnValue(new Promise(res => { resolveQuery = res }))

    const { result } = renderHook(() => useWeightLog())
    await waitFor(() => expect(result.current.loading).toBe(true))

    await act(async () => { resolveQuery({ data: [], error: null }) })

    await waitFor(() => expect(result.current.loading).toBe(false))
  })

  it('passes startDate as a gte filter when provided', async () => {
    const capturedGteArgs: unknown[][] = []

    mockFrom.mockImplementation(() => {
      function buildNode(): Record<string, unknown> {
        return {
          then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
            mockFetchLogsResolve().then(onFulfilled, onRejected),
          gte: jest.fn().mockImplementation((...args: unknown[]) => {
            capturedGteArgs.push(args)
            return buildNode()
          }),
          lte: jest.fn().mockImplementation(() => buildNode()),
        }
      }
      return {
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            limit: jest.fn().mockImplementation(() => buildNode()),
          }),
        }),
        upsert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({ single: mockLogWeightSingleResolve }),
        }),
        delete: jest.fn().mockReturnValue({ eq: mockDeleteEqResolve }),
      }
    })

    const { result } = renderHook(() => useWeightLog())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.fetchLogs('2024-01-01')
    })

    expect(capturedGteArgs.some(args => args[0] === 'date' && args[1] === '2024-01-01')).toBe(true)
  })

  it('passes endDate as an lte filter when provided', async () => {
    const capturedLteArgs: unknown[][] = []

    mockFrom.mockImplementation(() => {
      function buildNode(): Record<string, unknown> {
        return {
          then: (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
            mockFetchLogsResolve().then(onFulfilled, onRejected),
          gte: jest.fn().mockImplementation(() => buildNode()),
          lte: jest.fn().mockImplementation((...args: unknown[]) => {
            capturedLteArgs.push(args)
            return buildNode()
          }),
        }
      }
      return {
        select: jest.fn().mockReturnValue({
          order: jest.fn().mockReturnValue({
            limit: jest.fn().mockImplementation(() => buildNode()),
          }),
        }),
        upsert: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnValue({ single: mockLogWeightSingleResolve }),
        }),
        delete: jest.fn().mockReturnValue({ eq: mockDeleteEqResolve }),
      }
    })

    const { result } = renderHook(() => useWeightLog())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.fetchLogs(undefined, '2024-01-31')
    })

    expect(capturedLteArgs.some(args => args[0] === 'date' && args[1] === '2024-01-31')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Tests: logWeight
// ---------------------------------------------------------------------------

describe('useWeightLog — logWeight', () => {
  it('does nothing when there is no session', async () => {
    mockUseAuth.mockReturnValue({ session: null })

    const { result } = renderHook(() => useWeightLog())
    await act(async () => {})

    const fromCallsBefore = mockFrom.mock.calls.length

    await act(async () => {
      await result.current.logWeight('2024-01-15', 75, 'kg')
    })

    expect(mockFrom.mock.calls.length).toBe(fromCallsBefore)
    expect(result.current.logs).toEqual([])
  })

  it('calls upsert with the correct payload and onConflict option', async () => {
    const newLog = makeWeightLog({ id: 'wl-new', date: '2024-01-15', weight: 75, unit: 'kg' })
    mockLogWeightSingleResolve.mockResolvedValue({ data: newLog, error: null })

    let capturedUpsertArgs: unknown
    let capturedUpsertOpts: unknown
    mockFrom.mockImplementation(() => ({
      select: jest.fn().mockReturnValue({
        order: jest.fn().mockReturnValue({
          limit: jest.fn().mockImplementation(() => makeThenableNode()),
        }),
      }),
      upsert: jest.fn().mockImplementation((...args: unknown[]) => {
        capturedUpsertArgs = args[0]
        capturedUpsertOpts = args[1]
        return {
          select: jest.fn().mockReturnValue({ single: mockLogWeightSingleResolve }),
        }
      }),
      delete: jest.fn().mockReturnValue({ eq: mockDeleteEqResolve }),
    }))

    const { result } = renderHook(() => useWeightLog())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.logWeight('2024-01-15', 75, 'kg')
    })

    expect(capturedUpsertArgs).toEqual({
      user_id: mockSession.user.id,
      date:    '2024-01-15',
      weight:  75,
      unit:    'kg',
    })
    expect(capturedUpsertOpts).toEqual({ onConflict: 'user_id,date' })
  })

  it('prepends the new log to the logs state after a successful upsert', async () => {
    const existing = makeWeightLog({ id: 'wl-existing', date: '2024-01-08', weight: 76 })
    mockFetchLogsResolve.mockResolvedValue({ data: [existing], error: null })

    const newLog = makeWeightLog({ id: 'wl-new', date: '2024-01-15', weight: 75 })
    mockLogWeightSingleResolve.mockResolvedValue({ data: newLog, error: null })

    const { result } = renderHook(() => useWeightLog())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.logWeight('2024-01-15', 75, 'kg')
    })

    expect(result.current.logs[0]).toEqual(newLog)
    expect(result.current.logs[1]).toEqual(existing)
  })

  it('replaces an existing log for the same date rather than duplicating it', async () => {
    // Start with a log on 2024-01-15 already in state
    const oldLog = makeWeightLog({ id: 'wl-old', date: '2024-01-15', weight: 76 })
    mockFetchLogsResolve.mockResolvedValue({ data: [oldLog], error: null })

    // Upsert returns the updated entry (same date, new weight)
    const updatedLog = makeWeightLog({ id: 'wl-old', date: '2024-01-15', weight: 74 })
    mockLogWeightSingleResolve.mockResolvedValue({ data: updatedLog, error: null })

    const { result } = renderHook(() => useWeightLog())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.logWeight('2024-01-15', 74, 'kg')
    })

    const logsOnDate = result.current.logs.filter(l => l.date === '2024-01-15')
    expect(logsOnDate).toHaveLength(1)
    expect(logsOnDate[0].weight).toBe(74)
  })

  it('sorts logs by date descending after inserting', async () => {
    const log1 = makeWeightLog({ id: 'wl-1', date: '2024-01-08', weight: 76 })
    const log2 = makeWeightLog({ id: 'wl-2', date: '2024-01-01', weight: 77 })
    mockFetchLogsResolve.mockResolvedValue({ data: [log1, log2], error: null })

    const newLog = makeWeightLog({ id: 'wl-new', date: '2024-01-04', weight: 75 })
    mockLogWeightSingleResolve.mockResolvedValue({ data: newLog, error: null })

    const { result } = renderHook(() => useWeightLog())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.logWeight('2024-01-04', 75, 'kg')
    })

    const dates = result.current.logs.map(l => l.date)
    expect(dates).toEqual(['2024-01-08', '2024-01-04', '2024-01-01'])
  })

  it('caps the logs list at 10 entries', async () => {
    // Start with 10 logs (dates 2024-01-01 through 2024-01-10)
    const existingLogs = Array.from({ length: 10 }, (_, i) =>
      makeWeightLog({ id: `wl-${i}`, date: `2024-01-${String(i + 1).padStart(2, '0')}`, weight: 70 + i })
    ).reverse() // descending
    mockFetchLogsResolve.mockResolvedValue({ data: existingLogs, error: null })

    const newLog = makeWeightLog({ id: 'wl-new', date: '2024-01-20', weight: 69 })
    mockLogWeightSingleResolve.mockResolvedValue({ data: newLog, error: null })

    const { result } = renderHook(() => useWeightLog())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.logs).toHaveLength(10)

    await act(async () => {
      await result.current.logWeight('2024-01-20', 69, 'kg')
    })

    expect(result.current.logs).toHaveLength(10)
    expect(result.current.logs[0].id).toBe('wl-new')
  })

  it('sets error and does not update logs when upsert fails', async () => {
    mockLogWeightSingleResolve.mockResolvedValue({
      data:  null,
      error: { message: 'conflict error' },
    })

    const { result } = renderHook(() => useWeightLog())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.logWeight('2024-01-15', 75, 'kg')
    })

    expect(result.current.error).toBe('conflict error')
    expect(result.current.logs).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Tests: deleteLog
// ---------------------------------------------------------------------------

describe('useWeightLog — deleteLog', () => {
  const log1 = makeWeightLog({ id: 'wl-del-1', date: '2024-01-15', weight: 75 })
  const log2 = makeWeightLog({ id: 'wl-del-2', date: '2024-01-08', weight: 76 })

  beforeEach(() => {
    mockFetchLogsResolve.mockResolvedValue({ data: [log1, log2], error: null })
  })

  it('removes the entry optimistically before the DB delete resolves', async () => {
    // DB delete never resolves — we verify the optimistic removal only
    mockDeleteEqResolve.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useWeightLog())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => { void result.current.deleteLog('wl-del-1') })

    await waitFor(() =>
      expect(result.current.logs.find(l => l.id === 'wl-del-1')).toBeUndefined()
    )
    // Other log should still be present
    expect(result.current.logs.find(l => l.id === 'wl-del-2')).toBeDefined()
  })

  it('calls supabase delete with the correct log id', async () => {
    let capturedEqArgs: unknown[]
    mockFrom.mockImplementation(() => ({
      select: makeWeightLogBuilder().select,
      upsert: makeWeightLogBuilder().upsert,
      delete: jest.fn().mockReturnValue({
        eq: jest.fn().mockImplementation((...args: unknown[]) => {
          capturedEqArgs = args
          return mockDeleteEqResolve(...args)
        }),
      }),
    }))

    const { result } = renderHook(() => useWeightLog())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.deleteLog('wl-del-1')
    })

    expect(capturedEqArgs!).toEqual(['id', 'wl-del-1'])
  })

  it('keeps the entry removed from state on a successful delete', async () => {
    const { result } = renderHook(() => useWeightLog())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.deleteLog('wl-del-1')
    })

    expect(result.current.logs.map(l => l.id)).toEqual(['wl-del-2'])
  })

  it('sets error when the DB delete fails', async () => {
    mockDeleteEqResolve.mockResolvedValue({ error: { message: 'delete forbidden' } })
    // Re-fetch after the error returns the original data
    mockFetchLogsResolve
      .mockResolvedValueOnce({ data: [log1, log2], error: null }) // initial fetch
      .mockResolvedValueOnce({ data: [log1, log2], error: null }) // refetch after error

    const { result } = renderHook(() => useWeightLog())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.deleteLog('wl-del-1')
    })

    expect(result.current.error).toBe('delete forbidden')
  })

  it('refetches logs to restore state when the DB delete fails', async () => {
    mockDeleteEqResolve.mockResolvedValue({ error: { message: 'delete forbidden' } })
    mockFetchLogsResolve
      .mockResolvedValueOnce({ data: [log1, log2], error: null }) // initial fetch
      .mockResolvedValueOnce({ data: [log1, log2], error: null }) // refetch after error

    const { result } = renderHook(() => useWeightLog())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.deleteLog('wl-del-1')
    })

    // fetchLogs is called twice total: once on mount, once after the delete error
    expect(mockFetchLogsResolve).toHaveBeenCalledTimes(2)
    // Logs should be restored to the full list
    await waitFor(() => expect(result.current.logs).toHaveLength(2))
  })
})
