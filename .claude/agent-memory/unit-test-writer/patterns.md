# Testing Patterns — family-meal-prep

## Supabase Chainable Mock (working pattern)

The core problem: `jest.clearAllMocks()` wipes mock implementations set via
`.mockReturnValue()` and `.mockImplementation()`. Solution: recreate every mock
function and re-wire the chain inside `beforeEach`.

### Pattern A — used in useMealPlan.test.ts

Terminal mock fns are module-level `let` variables; the builder factory is a
plain function; `mockFrom` is a module-level `jest.fn()` assigned fresh in
`beforeEach`. No getter tricks needed because `jest.mock()` factory captures
`mockFrom` by reference via closure.

```ts
// Top of file (module scope)
const mockFrom = jest.fn()

jest.mock('@/lib/supabase', () => ({
  supabase: { from: mockFrom },  // captured by closure — works
}))

let mockLteResolve: jest.Mock
let mockSingleResolve: jest.Mock
let mockEqResolve: jest.Mock

function makeQueryBuilder() {
  return {
    select: jest.fn().mockReturnValue({
      gte: jest.fn().mockReturnValue({ lte: mockLteResolve }),
      single: mockSingleResolve,
    }),
    update: jest.fn().mockReturnValue({ eq: mockEqResolve }),
    insert: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ single: mockSingleResolve }),
    }),
    delete: jest.fn().mockReturnValue({ eq: mockEqResolve }),
  }
}

beforeEach(() => {
  mockLteResolve    = jest.fn().mockResolvedValue({ data: [], error: null })
  mockSingleResolve = jest.fn().mockResolvedValue({ data: null, error: null })
  mockEqResolve     = jest.fn().mockResolvedValue({ error: null })
  mockFrom.mockImplementation(() => makeQueryBuilder())
})

afterEach(() => { jest.clearAllMocks() })
```

**Why `mockFrom` works here**: The `jest.mock()` factory runs once at module
init and captures `mockFrom` by reference in the closure. Even after
`clearAllMocks()`, the reference itself doesn't change — only the call history
and implementations of `mockFrom` are cleared. We re-add the implementation
in `beforeEach`, so it works fine.

### Pattern B — used in useRecipes.test.ts (multiple tables)

When `from()` routes to different builders by table name, use a `globalThis`
holder so `beforeEach` can update the delegating function without breaking the
module-level mock:

```ts
const mockFrom = jest.fn()

jest.mock('@/lib/supabase', () => {
  const holder = { fn: null as jest.Mock | null }
  ;(globalThis as any).__supabaseMockHolder__ = holder
  return {
    supabase: {
      from: (...args: unknown[]) => holder.fn!(...args),
    },
  }
})

beforeEach(() => {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'shopping_items') return makeShoppingBuilder()
    return makeRecipesBuilder()
  })
  ;(globalThis as any).__supabaseMockHolder__.fn = mockFrom
})
```

## AuthContext Mock

```ts
const mockSession = {
  user: { id: 'user-abc' },
  access_token: 'tok-abc',
}
const mockUseAuth = jest.fn()

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

beforeEach(() => {
  mockUseAuth.mockReturnValue({ session: mockSession })
})
```

## fetch() Mock for Edge Functions

```ts
const mockFetch = jest.fn()
global.fetch = mockFetch

function mockFetchSuccess(body: object): Promise<Response> {
  return Promise.resolve({
    ok: true, status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response)
}

function mockFetchHttpError(status: number, body: object = {}): Promise<Response> {
  return Promise.resolve({
    ok: false, status,
    text: () => Promise.resolve(JSON.stringify(body)),
  } as unknown as Response)
}
```

## Async Hook Testing Pattern

```ts
// Wait for loading to settle before making assertions
const { result } = renderHook(() => useMyHook(args))
await waitFor(() => expect(result.current.loading).toBe(false))

// Wrap mutations in act
await act(async () => {
  await result.current.someAction()
})
expect(result.current.someState).toBe(expectedValue)
```

## Known Behavioural Gotcha: deleteRecipe + fetchRecipes

`deleteRecipe` on error calls `setError(msg)` then immediately calls
`fetchRecipes()`. `fetchRecipes` starts by calling `setError(null)`. So by
the time the test `act` resolves, `error` is null. Assert on whether
`mockOrderResolve` was called twice (once for initial load, once for refetch)
rather than asserting on the error value.

## Test File Locations

- `hooks/__tests__/useMealPlan.test.ts`
- `hooks/__tests__/useRecipes.test.ts`
