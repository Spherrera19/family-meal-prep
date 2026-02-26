# Family Meal Prep — Project Overview

> **Note:** This app was built experimentally with AI assistance (Claude Code by Anthropic) and is not personally hand-coded. Use as a reference or starting point, not production-ready code.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI Framework | React Native (via Expo SDK 54) |
| Routing | Expo Router (file-based, tabs template) |
| Backend | Supabase (PostgreSQL + Auth + Realtime + Edge Functions) |
| Language | TypeScript throughout |
| Animation | react-native-reanimated v4 |
| Gestures | react-native-gesture-handler v2 |
| Storage | AsyncStorage (native) / localStorage (web) |
| Testing | Jest + @testing-library/react-native |
| DOM Parsing | linkedom (npm, used in Deno edge function) |

---

## AI Development Tools

### Claude Code (Anthropic)
The entire project was built with **Claude Code** (Sonnet 4.6), Anthropic's CLI agent. All code was generated, reviewed, and debugged through natural language conversation.

### MCP Servers Used

#### Supabase MCP (`mcp__supabase__*`)
Gives Claude direct, authenticated access to the Supabase project without copy-pasting credentials or using the dashboard. Used throughout for:
- `list_projects` / `get_project` — discover project IDs
- `list_tables` — inspect schema
- `apply_migration` — deploy DDL changes (creates migration history)
- `execute_sql` — run ad-hoc queries and data migrations
- `deploy_edge_function` — deploy Deno edge functions directly
- `get_advisors` — run security and performance audits post-migration
- `get_logs` — debug edge function errors in real-time
- `get_publishable_keys` — retrieve API keys

#### db-explorer MCP (`mcp__db-explorer__query`)
Read-only SQL query tool used for inspecting live data without risk of mutation.

### Claude Sub-Agents Used

#### Built-in Agents
- **Explore** — fast codebase search (Glob/Grep without context pollution)
- **Plan** — architecture planning before implementing multi-file changes
- **general-purpose** — open-ended research and multi-step investigations
- **supabase-rls-auditor** — automatically reviews new migration files for RLS vulnerabilities and missing policies

#### Custom Project Agent: `unit-test-writer`
Defined at `.claude/agents/unit-test-writer.md`. A specialized agent with deep knowledge of this project's test patterns. Automatically triggered after implementing new hooks or utilities. Capabilities:
- Writes complete Jest test files (no placeholders)
- Mocks Supabase client, AsyncStorage, and Expo Router
- Uses `renderHook` + `waitFor` from `@testing-library/react-native`
- Has persistent memory at `.claude/agent-memory/unit-test-writer/`

---

## Supabase Configuration

- **Project URL**: stored in `EXPO_PUBLIC_SUPABASE_URL` (.env)
- **Anon Key**: stored in `EXPO_PUBLIC_SUPABASE_ANON_KEY` (.env)
- **Auth**: Email/password, session persisted via platform storage
- **Edge Functions**: Deployed with `verify_jwt: false` via Supabase MCP

### Database Schema

#### `meal_plans`
```sql
id          uuid primary key
user_id     uuid references auth.users
day         date
meal_type   text  -- string (not enum) to support dynamic slot names
recipe_id   uuid references recipes(id)  -- added migration 006
notes       text
created_at  timestamptz
```

#### `families`
```sql
id          uuid primary key
name        text
code        text unique  -- 6-char join code
created_by  uuid references auth.users
created_at  timestamptz
```

#### `family_members`
```sql
id          uuid primary key
family_id   uuid references families(id)
user_id     uuid references auth.users
role        text  -- 'admin' | 'member'
joined_at   timestamptz
```

#### `shopping_items`
```sql
id          uuid primary key
family_id   uuid references families(id)
name        text
quantity    text
checked     boolean default false
added_by    uuid references auth.users
created_at  timestamptz
UNIQUE(family_id, name)  -- added migration 004
```

#### `recipes`
```sql
id              uuid primary key
user_id         uuid references auth.users
title           text
image_url       text
source_url      text
description     text
servings        text
prep_time       text
cook_time       text
ingredients     text[]
instructions    text[]
-- Nutrition (migration 005 + 008):
calories        integer
protein_g       integer
carbs_g         integer
fat_g           integer
fiber_g         numeric(6,1)
sugar_g         numeric(6,1)
sodium_mg       integer
saturated_fat_g numeric(6,1)
created_at      timestamptz
```

#### `user_profiles`
```sql
id              uuid primary key references auth.users
daily_calories  integer default 2000
daily_protein_g integer default 150
daily_carbs_g   integer default 250
daily_fat_g     integer default 65
updated_at      timestamptz
```

#### `weight_logs`
```sql
id          uuid primary key
user_id     uuid references auth.users
date        date
weight_kg   numeric(5,2)
created_at  timestamptz
```

### RLS & RPCs

- `get_my_family_id()` — security definer; avoids infinite recursion in family_members policy
- `create_family(name text)` — atomically inserts family + member (bypasses RLS INSERT→SELECT check)
- `join_family_by_code(code text)` — finds family by code, inserts member
- All SECURITY DEFINER functions use `SET search_path = ''` (migration 009) to prevent search_path injection
- Realtime enabled on `shopping_items`

### Migration History

| File | Description |
|------|-------------|
| 001_meal_plans.sql | Initial meal_plans table |
| 002_families_and_shopping.sql | families, family_members, shopping_items tables + RPCs |
| 003_recipes.sql | recipes table |
| 004_shopping_items_unique.sql | UNIQUE(family_id, name) for upsert support |
| 005_recipe_nutrition.sql | calories/protein_g/carbs_g/fat_g columns + user_profiles |
| 006_meal_plan_recipe_id.sql | recipe_id FK on meal_plans |
| 007_weight_logs.sql | weight_logs table |
| 008_recipe_micronutrients.sql | fiber_g, sugar_g, sodium_mg, saturated_fat_g |
| 009_fix_function_search_path.sql | SET search_path = '' on all SECURITY DEFINER functions |
| 010_fix_performance_advisors.sql | FK indexes + RLS policy performance (auth.uid() caching) |

### Edge Functions

#### `parse-recipe`
- **Location**: `supabase/functions/parse-recipe/index.ts`
- **Runtime**: Deno
- **Auth**: `verify_jwt: false`
- **Env vars**: `USDA_API_KEY`, `ANTHROPIC_API_KEY`

**5-strategy extraction pipeline (first success wins):**

| # | Strategy | Description |
|---|----------|-------------|
| 1 | JSON-LD | Parses `<script type="application/ld+json">` blocks, finds `@type: Recipe` nodes |
| 2 | Microdata | Queries `[itemprop]` attributes on `[itemtype*="schema.org/Recipe"]` scope via `linkedom` |
| 3 | WordPress plugins | CSS selectors for WPRM, Tasty Recipes, Mediavine Create, hrecipe microformats |
| 4 | Heading heuristic | Finds "Ingredients"/"Instructions" headings, walks DOM siblings for `<ul>/<ol>` |
| 5 | Claude API | Strips HTML to text (~8k chars), calls `claude-haiku-4-5-20251001` to extract JSON |

**Nutrition pipeline:**
- Uses Schema.org nutrition fields if present
- Falls back to USDA FoodData Central API (`/fdc/v1/foods/search`) — concurrent ingredient lookups
- Ingredient parser handles fractions, ranges, mixed numbers, unit conversions, density corrections
- `protein_g`, `carbs_g`, `fat_g`, `calories`, `sodium_mg` stored as `integer` (always `Math.round`)
- `fiber_g`, `sugar_g`, `saturated_fat_g` stored as `numeric(6,1)`

**Other details:**
- Uses Chrome browser User-Agent to bypass bot detection
- Always returns HTTP 200 (errors in body as `{ error: "..." }`)
- 15s AbortController timeout

---

## App Structure

```
family-meal-prep/
├── app/
│   ├── _layout.tsx          # Root: GestureRoot + AuthProvider + redirect logic
│   ├── (auth)/
│   │   ├── sign-in.tsx      # Login screen (dark mode aware)
│   │   └── sign-up.tsx      # Registration screen (dark mode aware)
│   └── (tabs)/
│       ├── _layout.tsx      # Tab navigator
│       ├── index.tsx        # Meal Planning screen (main feature)
│       ├── two.tsx          # Recipes screen
│       ├── shopping.tsx     # Shopping List screen
│       └── nutrition.tsx    # Nutrition tracking screen
├── components/
│   ├── GestureRoot.tsx          # Web: plain View
│   ├── GestureRoot.native.tsx   # Native: GestureHandlerRootView
│   ├── DragGestureWrap.tsx      # Web: passthrough fragment
│   └── DragGestureWrap.native.tsx  # Native: GestureDetector
├── context/
│   └── AuthContext.tsx      # session, loading, signOut via useAuth()
├── hooks/
│   ├── useMealPlan.ts       # CRUD for meal_plans table
│   ├── useRecipes.ts        # CRUD + URL import for recipes table
│   ├── useFamily.ts         # create/join family RPCs
│   ├── useShoppingList.ts   # Realtime shopping list CRUD
│   ├── useUserProfile.ts    # User macro goals (daily_calories etc.)
│   ├── useNutritionHistory.ts  # Meal plan nutrition aggregation
│   ├── useWeightLog.ts      # Weight tracking CRUD
│   ├── useDragAndDrop.ts        # Web stub (all no-ops)
│   └── useDragAndDrop.native.ts # Native drag-and-drop implementation
├── hooks/__tests__/
│   ├── useUserProfile.test.ts
│   └── useWeightLog.test.ts
├── lib/
│   └── supabase.ts          # Platform-aware Supabase client
└── supabase/
    ├── functions/
    │   └── parse-recipe/
    │       └── index.ts
    └── migrations/
        └── 001–010_*.sql
```

---

## Features

### Meal Planning Screen (`app/(tabs)/index.tsx`)

- **Week navigator**: scroll left/right through weeks, 7-day strip with dot indicators
- **Dynamic meal slots**: any slot can be added or deleted, including defaults (Breakfast, Lunch, Dinner)
- **Templates**: quick-add grid with 7 predefined slot types
- **Custom slots**: free-text input, deduplication enforced
- **Context-driven icons**: `getSlotStyle(name)` maps 20+ keywords to emoji + color
- **Drag-and-drop** (native): long-press recipe card → drag onto meal slot → recipe assigned
- **Tap-to-assign** (web): tap recipe to arm it, tap slot to place it
- **Overlay card**: animated ghost card follows finger during drag (Reanimated)

### Recipes Screen (`app/(tabs)/two.tsx`)

- URL import bar: paste any cooking URL → edge function parses → saves to DB
- Recipe cards with image, title, ingredients count
- Detail modal: full ingredients + instructions
- "Add to shopping list" button: upserts all ingredients to family shopping list
- Delete recipe with platform-appropriate button (Android/web fix in commit bf3ded1)

### Shopping List Screen (`app/(tabs)/shopping.tsx`)

- **Family setup**: create family (generates 6-char code) or join with code
- **Real-time sync**: Supabase Realtime subscription
- Check/uncheck items, delete items, optimistic UI

### Nutrition Screen (`app/(tabs)/nutrition.tsx`)

- Daily macro progress (calories, protein, carbs, fat) vs. user goals
- Pulls from meals planned today via `useNutritionHistory`
- Weight log with chart via `useWeightLog`
- User profile settings for daily macro goals via `useUserProfile`

### Auth

- Email/password sign-in and sign-up
- Session persists across app restarts
- Dark mode support
- Auto-redirect: no session → sign-in, has session → tabs

---

## Key Hooks

### `useDragAndDrop.native.ts`

Critical architecture points:
1. **Worklet safety**: JS refs cannot be read inside Reanimated worklets; all JS logic via `runOnJS()`
2. **Gesture stability**: `makeDragGesture` in `useCallback`; `RecipeChip` uses `React.memo` + `useMemo`
3. **Coordinate conversion**: `absoluteX/Y` are screen coords; screen View measures `pageX/pageY` on mount
4. **Stale closure prevention**: `onDropRef.current = onDrop` on every render
5. **Double-cleanup prevention**: `isActive` shared value guards `onFinalize`

### `useRecipes.ts`

- `importRecipe(url)`: direct `fetch()` to edge function URL (not `supabase.functions.invoke`)
- No auth headers needed (`verify_jwt: false`)

### `useNutritionHistory.ts`

- Joins `meal_plans` → `recipes` for today's meals
- Aggregates macros per meal slot and as daily totals

---

## Testing

- **Framework**: Jest + `@testing-library/react-native`
- **Location**: `hooks/__tests__/`
- **Mocking**: Supabase client mocked via `jest.mock('../../lib/supabase')`
- **Hook testing**: `renderHook` + `waitFor` pattern throughout
- **Coverage**: happy paths, empty/null inputs, error handling, loading states

---

## Platform-Specific File Splitting

| Web | Native |
|-----|--------|
| `GestureRoot.tsx` | `GestureRoot.native.tsx` |
| `DragGestureWrap.tsx` | `DragGestureWrap.native.tsx` |
| `useDragAndDrop.ts` | `useDragAndDrop.native.ts` |

Metro bundler picks `.native.ts` over `.ts` on native platforms.

---

## Common CLI Commands

```bash
# Start dev server
npx expo start

# Start with cache cleared
npx expo start --clear

# Kill process on port 8081 (Windows)
netstat -ano | findstr ":8081"
taskkill /PID <pid> /F

# Run tests
npx jest

# Run Supabase migrations
supabase db push
```

---

## Known Gotchas

| Issue | Fix |
|-------|-----|
| `window is not defined` on web | Platform-aware storage in `lib/supabase.ts` |
| RLS infinite recursion on `family_members` | `get_my_family_id()` security definer function |
| `create_family` RLS violation | Use RPC that atomically inserts family + member |
| `no unique constraint` on shopping upsert | Migration 004 adds `UNIQUE(family_id, name)` |
| Edge function HTTP 401 | Deploy with `verify_jwt: false`; remove auth headers |
| Edge function non-2xx errors hidden | Return HTTP 200 always; put errors in body |
| Bot detection on recipe sites | Use realistic Chrome User-Agent in edge function |
| RNGH crash on web bundle | Platform-specific file splitting (.native.ts) |
| Mobile drag crash | Move all JS ref reads to `runOnJS`; stabilize gesture with `useCallback`+`useMemo` |
| Drag card appears below finger | Measure screen View `pageX/pageY`; subtract from absolute coords |
| Stale `onDrop` in worklet | `onDropRef.current = onDrop` on every render |
| `invalid input syntax for type integer: "23.2"` | `protein_g`/`carbs_g`/`fat_g` are INTEGER columns — always use `Math.round` / `parseNutritionInt` |
| SECURITY DEFINER search_path injection | All such functions use `SET search_path = ''` (migration 009) |
| Slow RLS policies | Use `(select auth.uid())` pattern; add FK indexes (migration 010) |

---

## Environment Variables

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
# Edge function env vars (set in Supabase dashboard → Edge Functions → Secrets):
USDA_API_KEY=your-usda-key
ANTHROPIC_API_KEY=your-anthropic-key
```

Never commit `.env`.
