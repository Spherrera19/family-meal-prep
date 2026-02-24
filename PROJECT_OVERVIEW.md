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

---

## Supabase Configuration

- **Project URL**: stored in `EXPO_PUBLIC_SUPABASE_URL` (.env)
- **Anon Key**: stored in `EXPO_PUBLIC_SUPABASE_ANON_KEY` (.env)
- **Auth**: Email/password, session persisted via platform storage
- **Edge Functions**: Deployed with `--no-verify-jwt` (new `sb_publishable_` key format is incompatible with JWT verification)

### Database Schema

#### `meal_plans`
```sql
id          uuid primary key
user_id     uuid references auth.users
day         date
meal_type   text  -- was originally enum, changed to text for dynamic slots
recipe_id   uuid references recipes(id)
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
UNIQUE(family_id, name)  -- added in migration 004
```

#### `recipes`
```sql
id           uuid primary key
user_id      uuid references auth.users
title        text
image_url    text
ingredients  text[]
instructions text[]
source_url   text
created_at   timestamptz
```

### RLS & RPCs

- `get_my_family_id()` — security definer; avoids infinite recursion in family_members policy
- `create_family(name text)` — atomically inserts family + member (bypasses RLS INSERT→SELECT check)
- `join_family_by_code(code text)` — finds family by code, inserts member
- Realtime enabled on `shopping_items`

### Edge Functions

#### `parse-recipe`
- **Location**: `supabase/functions/parse-recipe/index.ts`
- **Runtime**: Deno
- **Deploy**: `supabase functions deploy parse-recipe --no-verify-jwt`
- **What it does**: Fetches a cooking URL, parses Schema.org JSON-LD (`@type: Recipe` or `@graph`), returns title/image/ingredients/instructions
- **Key details**:
  - Uses Chrome browser User-Agent to bypass bot detection
  - Always returns HTTP 200 (errors in body as `{ error: "..." }`)
  - 15s AbortController timeout
  - Handles `HowToSection`, `HowToStep`, and flat instructions array

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
│       └── shopping.tsx     # Shopping List screen
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
│   ├── useDragAndDrop.ts        # Web stub (all no-ops)
│   └── useDragAndDrop.native.ts # Native drag-and-drop implementation
├── lib/
│   └── supabase.ts          # Platform-aware Supabase client
└── supabase/
    ├── functions/
    │   └── parse-recipe/
    │       └── index.ts
    └── migrations/
        ├── 001_meal_plans.sql
        ├── 002_families_shopping.sql
        ├── 003_recipes.sql
        └── 004_shopping_unique.sql
```

---

## Features

### Meal Planning Screen (`app/(tabs)/index.tsx`)

- **Week navigator**: scroll left/right through weeks, 7-day strip with dot indicators for days that have meals
- **Dynamic meal slots**: any slot can be added or deleted, including defaults (Breakfast, Lunch, Dinner)
- **Templates**: quick-add grid with Breakfast, Lunch, Dinner, Brunch, Morning Snack, Afternoon Snack, Evening Snack
- **Custom slots**: free-text input, deduplication enforced
- **Context-driven icons**: `getSlotStyle(name)` maps 20+ keywords to emoji + color (e.g. "breakfast"→🍳, "lunch"→🥗, "snack"→🍎)
- **Drag-and-drop** (native): long-press recipe card → drag onto meal slot → recipe assigned
- **Tap-to-assign** (web): tap recipe to arm it, tap slot to place it
- **Overlay card**: animated ghost card follows finger during drag (Reanimated)

### Recipes Screen (`app/(tabs)/two.tsx`)

- URL import bar: paste any cooking URL → edge function parses → saves to DB
- Recipe cards with image, title, ingredients count
- Detail modal: full ingredients + instructions
- "Add to shopping list" button: upserts all ingredients to family shopping list

### Shopping List Screen (`app/(tabs)/shopping.tsx`)

- **Family setup**: create family (generates 6-char code) or join with code
- **Real-time sync**: Supabase Realtime subscription — all family members see updates instantly
- Check/uncheck items, delete items
- Optimistic UI updates

### Auth

- Email/password sign-in and sign-up
- Session persists across app restarts
- Dark mode support (reads system color scheme)
- Auto-redirect: no session → sign-in, has session → tabs

---

## Key Hooks

### `useDragAndDrop.native.ts`

The core of native drag-and-drop. Critical architecture points:

1. **Worklet safety**: JS refs (`slotRects.current`) cannot be read inside Reanimated worklets (UI thread). All JS-side logic runs via `runOnJS(jsBegin/jsUpdate/jsEnd/jsCancel)`.
2. **Gesture stability**: `makeDragGesture` is wrapped in `useCallback`. `RecipeChip` uses `React.memo` + `useMemo` to stabilize gesture object per recipe — prevents native crash from gesture recreation on re-render.
3. **Coordinate conversion**: `absoluteX/Y` are screen coordinates; overlay `position: absolute` is relative to the screen View (below status bar + header). The screen View measures its `pageX/pageY` on mount and stores in Reanimated shared values (`screenX`, `screenY`). Drag position: `dragX = absoluteX - screenX.value - CARD_W/2`.
4. **Stale closure prevention**: `onDropRef.current = onDrop` on every render keeps callback current inside worklet.
5. **Double-cleanup prevention**: `isActive` shared value guards `onFinalize` from running cleanup if `onEnd` already ran.

### `useMealPlan.ts`

- `MealType` is `string` (not enum) to support dynamic slot names
- `DayPlan = Record<string, Meal>` — any string key maps to a meal
- `saveMeal` upserts, `deleteMeal` deletes by row id

### `useRecipes.ts`

- `importRecipe(url)`: direct `fetch()` to edge function URL (not `supabase.functions.invoke` — that API had error-surfacing issues)
- No auth headers needed (function deployed with `--no-verify-jwt`)

---

## Platform-Specific File Splitting

To prevent RNGH from bundling on web (which caused "TapGestureHandler not found" error):

| Web (bundled on web) | Native (bundled on iOS/Android) |
|---------------------|--------------------------------|
| `GestureRoot.tsx` | `GestureRoot.native.tsx` |
| `DragGestureWrap.tsx` | `DragGestureWrap.native.tsx` |
| `useDragAndDrop.ts` | `useDragAndDrop.native.ts` |

Metro bundler automatically picks `.native.ts` over `.ts` on native platforms.

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

# Deploy edge function
supabase functions deploy parse-recipe --no-verify-jwt

# Run Supabase migrations
supabase db push
# or apply locally:
supabase migration up

# Rebuild native (after adding native modules)
npx expo run:ios
npx expo run:android
```

---

## Known Gotchas

| Issue | Fix |
|-------|-----|
| `window is not defined` on web | Platform-aware storage in `lib/supabase.ts` |
| RLS infinite recursion on `family_members` | `get_my_family_id()` security definer function |
| `create_family` RLS violation | Use RPC that atomically inserts family + member |
| `no unique constraint` on shopping upsert | Migration 004 adds `UNIQUE(family_id, name)` |
| Edge function HTTP 401 | Deploy with `--no-verify-jwt`; remove auth headers |
| Edge function non-2xx errors hidden | Return HTTP 200 always; put errors in body |
| Bot detection on recipe sites | Use realistic Chrome User-Agent in edge function |
| RNGH crash on web bundle | Platform-specific file splitting (.native.ts) |
| Mobile drag crash | Move all JS ref reads to `runOnJS`; stabilize gesture with `useCallback`+`useMemo` |
| Drag card appears below finger | Measure screen View `pageX/pageY`; subtract from absolute coords |
| Stale `onDrop` in worklet | `onDropRef.current = onDrop` on every render |

---

## Environment Variables

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Never commit `.env`. The `.gitignore` excludes it by default.

---

## GitHub

Repository linked to GitHub. Commits include co-authorship note indicating AI-assisted development.
