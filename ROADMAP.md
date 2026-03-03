# Family Meal Prep — Development Roadmap

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement any phase task-by-task.

**Goal:** Evolve the Family Meal Prep app from an AI-assisted prototype into a hardened, store-ready, monetized cross-platform product.

**Architecture:** React Native (Expo SDK 54) + Supabase backend. Platform-specific file splitting (`.native.ts`) handles gesture/UI divergence between Web and Native. Edge Functions run in Deno. All macros stored as `integer` via `Math.round`.

**Tech Stack:** TypeScript · Expo Router · Supabase (PostgreSQL + Realtime + Edge Functions) · Reanimated v4 · Jest

---

## Phase 1: Current State ✅

The app is functional with the following features shipped:

- Meal planning with week navigation, drag-and-drop (native), tap-to-assign (web)
- Recipe import via 5-strategy edge function pipeline (JSON-LD → Microdata → WordPress → Heading heuristic → Claude AI)
- USDA FoodData Central nutrition extraction with ingredient parsing
- Family shopping list with Supabase Realtime sync
- Recipes with Supabase Realtime sync (cross-tab and multi-user reactivity) ✅
- Curated Recipe Dock: `show_in_tray` column decouples tray from master recipe list; X badge unpins (no delete); star toggle in Recipes tab pins/unpins ✅
- Nutrition tracking screen with daily macros + weight log
- Auth (email/password), dark mode, RLS, 10 migrations
- Jest tests for `useUserProfile` and `useWeightLog`

---

## Phase 2: Hardening & Scale

**Goal:** Cache USDA nutrition data to reduce API latency/costs; add edge function resilience.

---

### Task 2.1: USDA Nutrient Cache Table

**Context:** Every recipe import fires concurrent USDA API calls per ingredient. The same ingredient names repeat across imports. Caching cuts costs and latency.

**Files:**
- Create: `supabase/migrations/011_usda_nutrient_cache.sql`
- Modify: `supabase/functions/parse-recipe/index.ts`

**Step 1: Write the migration**

```sql
-- 011_usda_nutrient_cache.sql
create table usda_nutrient_cache (
  id            uuid primary key default gen_random_uuid(),
  query         text not null unique,           -- normalized ingredient string
  calories_per_100g numeric(8,2),
  protein_g_per_100g numeric(8,2),
  carbs_g_per_100g   numeric(8,2),
  fat_g_per_100g     numeric(8,2),
  fiber_g_per_100g   numeric(8,2),
  sugar_g_per_100g   numeric(8,2),
  sodium_mg_per_100g numeric(8,2),
  saturated_fat_g_per_100g numeric(8,2),
  fetched_at    timestamptz default now(),
  expires_at    timestamptz default now() + interval '90 days'
);

-- Index for lookup by query string
create index idx_usda_nutrient_cache_query on usda_nutrient_cache(query);

-- Service role only (edge function uses service_role key)
alter table usda_nutrient_cache enable row level security;
-- No public access — edge function accesses via service_role key
```

**Step 2: Apply migration via Supabase MCP**

Use `mcp__supabase__apply_migration` with:
- `name`: `usda_nutrient_cache`
- `query`: contents of the SQL above

**Step 3: Add cache lookup in `parse-recipe/index.ts`**

In the `fetchUSDANutrition(ingredient: string)` function, wrap the USDA fetch:

```typescript
// Before hitting USDA API, check cache
const normalizedQuery = ingredient.toLowerCase().trim();

const { data: cached } = await supabaseAdmin
  .from('usda_nutrient_cache')
  .select('*')
  .eq('query', normalizedQuery)
  .gt('expires_at', new Date().toISOString())
  .single();

if (cached) return mapCacheRowToNutrition(cached);

// ... existing USDA fetch ...

// After successful USDA fetch, upsert into cache
await supabaseAdmin
  .from('usda_nutrient_cache')
  .upsert({ query: normalizedQuery, ...nutritionPer100g });
```

> **Note:** The edge function must use a `service_role` key (not anon) to write to this table. Add `SUPABASE_SERVICE_ROLE_KEY` to Supabase Edge Function secrets.

**Step 4: Run a recipe import manually to verify cache is populated**

```bash
# Check cache table after an import
# Use db-explorer MCP:
SELECT query, calories_per_100g, fetched_at FROM usda_nutrient_cache LIMIT 10;
```

**Step 5: Commit**

```bash
git add supabase/migrations/011_usda_nutrient_cache.sql supabase/functions/parse-recipe/index.ts
git commit -m "feat: add USDA nutrient cache table with 90-day TTL"
```

---

### Task 2.2: Edge Function Fallback Logic

**Context:** The 5-strategy pipeline already exists. This task adds structured error reporting and per-strategy timeouts so a slow strategy doesn't block the rest.

**Files:**
- Modify: `supabase/functions/parse-recipe/index.ts`

**Step 1: Add per-strategy timeout wrapper**

```typescript
async function withTimeout<T>(
  fn: () => Promise<T>,
  ms: number,
  label: string
): Promise<T | null> {
  try {
    return await Promise.race([
      fn(),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
      ),
    ]);
  } catch (err) {
    console.warn(`[parse-recipe] Strategy "${label}" failed:`, err);
    return null;
  }
}
```

**Step 2: Wrap each strategy call**

```typescript
const strategies = [
  { label: 'JSON-LD',         fn: () => extractJsonLd(doc),       timeout: 2000 },
  { label: 'Microdata',       fn: () => extractMicrodata(doc),     timeout: 2000 },
  { label: 'WordPress',       fn: () => extractWordPress(doc),     timeout: 2000 },
  { label: 'Heading heuristic', fn: () => extractHeadings(doc),   timeout: 3000 },
  { label: 'Claude AI',       fn: () => extractWithClaude(text),   timeout: 8000 },
];

let result = null;
for (const { label, fn, timeout } of strategies) {
  result = await withTimeout(fn, timeout, label);
  if (result?.ingredients?.length) break;
}
```

**Step 3: Add structured error body**

The function already returns HTTP 200 with errors in body. Ensure all catch paths return:

```typescript
return new Response(
  JSON.stringify({ error: 'No recipe found', strategiesAttempted: strategies.map(s => s.label) }),
  { status: 200, headers: { 'Content-Type': 'application/json' } }
);
```

**Step 4: Deploy and test with a problematic URL**

```bash
# Deploy via Supabase MCP: mcp__supabase__deploy_edge_function
# Check logs via: mcp__supabase__get_logs (service: edge-function)
```

**Step 5: Commit**

```bash
git add supabase/functions/parse-recipe/index.ts
git commit -m "feat: add per-strategy timeouts and structured fallback errors in parse-recipe"
```

---

## Phase 3: Cross-Platform UI/UX Overhaul

**Goal:** Polish the UI with blur effects and fluid animations; ensure all gesture/animation code is strictly separated between Web and Native.

> **Architecture note (implemented):** The Meal Plan recipe dock is now a curated view driven by `recipes.show_in_tray`. The Recipes tab is the *only* place where `deleteRecipe` (hard delete) is called. The dock's X badge calls `toggleTrayVisibility(id, false)` — a soft unpin with no data loss.

---

### Task 3.1: Audit Platform File Splits

**Context:** Metro picks `.native.ts` over `.ts` for native builds. Any gesture or Reanimated import in a `.ts` file (without `.native.ts` counterpart) will crash on web.

**Files to audit:**
- `components/GestureRoot.tsx` + `GestureRoot.native.tsx`
- `components/DragGestureWrap.tsx` + `DragGestureWrap.native.tsx`
- `hooks/useDragAndDrop.ts` + `useDragAndDrop.native.ts`

**Step 1: Grep for illegal imports in web files**

```bash
# These imports must NEVER appear in .tsx/.ts (non-native) files:
grep -r "react-native-gesture-handler\|react-native-reanimated\|Animated\." \
  --include="*.ts" --include="*.tsx" \
  --exclude="*.native.*" \
  app/ components/ hooks/
```

Expected output: zero matches. Any match is a bug.

**Step 2: Add a lint rule (optional but recommended)**

Add to `package.json` scripts:
```json
"lint:platform": "node scripts/check-platform-imports.js"
```

**Step 3: Commit any fixes found**

```bash
git add components/ hooks/
git commit -m "fix: remove illegal Reanimated/gesture imports from web-safe files"
```

---

### Task 3.2: Add `expo-blur` to Recipe Cards and Modals

**Context:** Frosted-glass modals are a standard iOS UX pattern. `expo-blur` provides `BlurView` for both iOS and Android.

**Files:**
- Modify: `app/(tabs)/two.tsx` (recipe detail modal)
- Create: `components/BlurModal.tsx` + `components/BlurModal.native.tsx`

**Step 1: Install**

```bash
npx expo install expo-blur
```

**Step 2: Create platform-split BlurModal**

`components/BlurModal.tsx` (web — plain View):
```tsx
import { View, StyleSheet } from 'react-native';
export function BlurModal({ children }: { children: React.ReactNode }) {
  return <View style={styles.overlay}>{children}</View>;
}
const styles = StyleSheet.create({
  overlay: { backgroundColor: 'rgba(0,0,0,0.6)', flex: 1 },
});
```

`components/BlurModal.native.tsx` (native — BlurView):
```tsx
import { BlurView } from 'expo-blur';
import { StyleSheet } from 'react-native';
export function BlurModal({ children }: { children: React.ReactNode }) {
  return (
    <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill}>
      {children}
    </BlurView>
  );
}
```

**Step 3: Replace modal overlay in `app/(tabs)/two.tsx`**

Find the Modal component and swap its backdrop to use `<BlurModal>`.

**Step 4: Test on web (`npx expo start --web`) and native emulator**

**Step 5: Commit**

```bash
git add components/BlurModal.tsx components/BlurModal.native.tsx app/(tabs)/two.tsx
git commit -m "feat: add expo-blur frosted glass modal with platform split"
```

---

### Task 3.3: Reanimated v4 Layout Animations

**Context:** Reanimated v4 ships `Layout` animations via `entering`/`exiting` props. Use these for recipe card list and nutrition progress bars.

**Files:**
- Modify: `app/(tabs)/two.tsx` (recipe list)
- Modify: `app/(tabs)/nutrition.tsx` (progress bars)

**Step 1: Upgrade check**

```bash
npx expo-doctor
# Verify react-native-reanimated is at v4.x
```

**Step 2: Add entering animation to recipe cards**

In `app/(tabs)/two.tsx`, import and add:
```tsx
import Animated, { FadeInDown, FadeOutUp, Layout } from 'react-native-reanimated';

// Wrap recipe card:
<Animated.View
  key={recipe.id}
  entering={FadeInDown.springify()}
  exiting={FadeOutUp}
  layout={Layout.springify()}
>
  {/* existing card content */}
</Animated.View>
```

**Step 3: Animate nutrition progress bars**

In `app/(tabs)/nutrition.tsx`:
```tsx
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

// Replace static View width with animated width:
const animatedStyle = useAnimatedStyle(() => ({
  width: withSpring(`${Math.min(percent, 100)}%` as any),
}));
<Animated.View style={[styles.progressFill, animatedStyle]} />
```

**Step 4: Test — animations must not crash on web**

Web files must NOT import Reanimated directly. The nutrition screen is shared; use a Platform check or split the animated bar into `.native.tsx`.

**Step 5: Commit**

```bash
git add app/(tabs)/two.tsx app/(tabs)/nutrition.tsx
git commit -m "feat: add Reanimated v4 layout animations to recipe list and nutrition bars"
```

---

## Phase 4: Store Readiness

**Goal:** Add social auth, configure EAS builds, and satisfy App Store / Play Store requirements.

---

### Task 4.1: Apple Sign-In

**Context:** Apple Sign-In is **required** by App Store guidelines for any app with third-party social login, or any app that collects email/name.

**Files:**
- Modify: `app/(auth)/sign-in.tsx`
- Modify: `context/AuthContext.tsx`
- Modify: `lib/supabase.ts`

**Step 1: Install**

```bash
npx expo install expo-apple-authentication
```

**Step 2: Enable in Supabase Dashboard**

Go to: Authentication → Providers → Apple → enable, paste your Apple Service ID and Secret.

**Step 3: Add the button (native only)**

In `app/(auth)/sign-in.tsx`:
```tsx
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

{Platform.OS === 'ios' && (
  <AppleAuthentication.AppleAuthenticationButton
    buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
    cornerRadius={8}
    onPress={async () => {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken!,
      });
      if (error) Alert.alert('Error', error.message);
    }}
  />
)}
```

**Step 4: Test on iOS simulator (macOS only) or real device**

**Step 5: Commit**

```bash
git add app/(auth)/sign-in.tsx
git commit -m "feat: add Apple Sign-In for iOS (App Store requirement)"
```

---

### Task 4.2: Google Sign-In

**Files:**
- Modify: `app/(auth)/sign-in.tsx`

**Step 1: Install**

```bash
npx expo install @react-native-google-signin/google-signin
```

**Step 2: Enable in Supabase Dashboard**

Go to: Authentication → Providers → Google → enable, paste your Google OAuth client ID.

**Step 3: Configure and add button**

```tsx
import { GoogleSignin, GoogleSigninButton } from '@react-native-google-signin/google-signin';

GoogleSignin.configure({ webClientId: 'YOUR_GOOGLE_WEB_CLIENT_ID' });

// In component:
const signInWithGoogle = async () => {
  await GoogleSignin.hasPlayServices();
  const { idToken } = await GoogleSignin.signIn();
  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'google',
    token: idToken!,
  });
  if (error) Alert.alert('Error', error.message);
};

<GoogleSigninButton onPress={signInWithGoogle} />
```

**Step 4: Test on Android emulator with Google Play Services**

**Step 5: Commit**

```bash
git add app/(auth)/sign-in.tsx
git commit -m "feat: add Google Sign-In for Android and web"
```

---

### Task 4.3: EAS Build Configuration

**Context:** EAS (Expo Application Services) is the official way to build and submit Expo apps to stores without a Mac (for iOS, you use EAS cloud builds).

**Files:**
- Create: `eas.json`
- Modify: `app.json`

**Step 1: Install EAS CLI**

```bash
npm install -g eas-cli
eas login
```

**Step 2: Initialize EAS**

```bash
eas build:configure
```

This creates `eas.json`. Verify it contains:
```json
{
  "cli": { "version": ">= 10.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal"
    },
    "production": {}
  },
  "submit": {
    "production": {}
  }
}
```

**Step 3: Set environment variables in EAS secrets**

```bash
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://..."
eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "..."
```

**Step 4: Trigger a preview build**

```bash
eas build --platform android --profile preview
```

**Step 5: Commit**

```bash
git add eas.json app.json
git commit -m "chore: add EAS build configuration for store submissions"
```

---

### Task 4.4: Privacy Policy

**Context:** Both Apple App Store and Google Play **require** a privacy policy URL for any app that collects user data (email, meal data, family data). This is a hard blocker for store submission.

**Minimum required:** A publicly hosted URL with a privacy policy covering:
- What data is collected (email, meal plans, shopping lists, weight logs)
- Where it's stored (Supabase/AWS)
- Whether it's shared with third parties (USDA API, Anthropic API — anonymized queries only)
- How users can request deletion

**Options (quickest to ship):**
1. **Termly / Iubenda** — generate a free policy, host at their URL
2. **GitHub Pages** — write a simple `privacy.html`, host at `yourusername.github.io/family-meal-prep/privacy`
3. **Supabase Storage** — host a static HTML file (public bucket)

**Step 1: Draft the policy** (cover the data points above)

**Step 2: Host it publicly** (pick one option above)

**Step 3: Add URL to app metadata**

In `app.json`:
```json
{
  "expo": {
    "extra": {
      "privacyPolicyUrl": "https://your-url.com/privacy"
    }
  }
}
```

**Step 4: Add link in `app/(auth)/sign-in.tsx` or settings screen**

```tsx
<Text onPress={() => Linking.openURL('https://your-url.com/privacy')}>
  Privacy Policy
</Text>
```

**Step 5: Commit**

```bash
git add app.json app/(auth)/sign-in.tsx
git commit -m "chore: add privacy policy URL to app metadata and auth screen"
```
## Phase 5: Gamified Recipe Discovery ("Mealchemy Engine")

**Goal:** Increase user retention and make meal prep fun by allowing users to organically "discover" recipes by combining base ingredients, similar to the game *Little Alchemy* (e.g., Chicken + Rice + Beans = Southwest Bowl).

---

### Task 5.1: The "Lab" UI and Collision Physics

**Context:** Users need a dedicated screen to drag ingredient cards. Dropping one card onto another triggers a combination event. We must strictly isolate the gesture logic for web safety.

**Files:**
- Create: `app/(tabs)/lab.tsx`
- Create: `components/IngredientCard.native.tsx`
- Create: `components/IngredientCard.tsx`

**Step 1: Build the drag-and-drop board**

Use `react-native-gesture-handler` (`Gesture.Pan()`) and `react-native-reanimated` to track `absoluteX` and `absoluteY` coordinates.

**Step 2: Implement collision detection**

Calculate the bounding boxes of the dragged card and target cards. Trigger a `runOnJS` callback upon a valid collision to fire the combination logic.

**Step 3: Commit**

```bash
git add app/(tabs)/lab.tsx components/IngredientCard*
git commit -m "feat: add mealchemy lab UI with collision physics"
```

---

### Task 5.2: Database Schema and Generative Engine

**Context:** We need a way to track which ingredients a user has unlocked and a backend engine to turn combined ingredients into structured recipes.

**Files:**
- Create: `supabase/migrations/012_mealchemy_schema.sql`
- Create: `supabase/functions/generate-recipe/index.ts`

**Step 1: Write the migration**

Create a `user_unlocked_ingredients` table to track progression and an `ingredients` reference table for the base items and SVG icons.

**Step 2: Build the AI Edge Function**

Leverage the existing Supabase Edge Function setup. Create a new `generate-recipe` function that passes the combined ingredients to `claude-haiku-4-5-20251001` to return a strictly formatted JSON-LD recipe.

**Step 3: Commit**

```bash
git add supabase/migrations/012_mealchemy_schema.sql supabase/functions/generate-recipe/
git commit -m "feat: add mealchemy schema and claude generative edge function"
```

---

## Financial Strategy

### Pricing & Breakeven

| Metric | Value |
|--------|-------|
| Price point | **$4.99 / month** (competitive with Mealime at $5.99, cheaper than Paprika at $4.99 one-time) |
| Apple / Google cut | 30% (year 1), 15% (year 2+ via Small Business Program) |
| Net per sub (year 1) | ~$3.49 |
| Net per sub (year 2+) | ~$4.24 |
| Supabase cost (free tier) | $0 up to 500MB DB, 2GB storage, 50k edge function invocations/month |
| Supabase Pro (when needed) | $25/month |
| Anthropic API cost | ~$0.01–0.05 per recipe import (Haiku pricing) |
| **Breakeven (year 1)** | **~11 paying subscribers** covers Supabase Pro |
| **Breakeven (year 2+)** | **~6 paying subscribers** |

### Implementation Checklist

- [ ] Set up RevenueCat (cross-platform subscription management) — integrates with both App Store Connect and Google Play
- [ ] Gate features behind subscription: unlimited recipe imports (free tier = 5/month), family sharing (free tier = solo only)
- [ ] Add paywall screen accessible from settings
- [ ] Configure App Store Connect: create paid subscription IAP product with 7-day free trial
- [ ] Configure Google Play Billing: mirror the subscription product

**RevenueCat install:**
```bash
npx expo install react-native-purchases
```

---

## Tech Stack Gotchas

Critical issues found during development — **read before starting any session**.

### Windows: `npx.cmd` Issues

On Windows, running `npx expo start` from PowerShell or cmd.exe sometimes fails silently or hangs. Known fixes:

```bash
# Always run from Git Bash (not PowerShell or cmd.exe)
# Or prefix with winpty on MINGW:
winpty npx expo start

# If port 8081 is stuck:
netstat -ano | findstr ":8081"
taskkill /PID <pid> /F

# Metro cache can get corrupted on Windows — always try:
npx expo start --clear
```

> **Rule:** All `npx` commands in this project assume **Git Bash** on Windows, not PowerShell.

### Integer Rounding for Macros

The database columns `protein_g`, `carbs_g`, `fat_g`, `calories`, `sodium_mg` are all `INTEGER`. Passing a float like `23.2` causes:

```
invalid input syntax for type integer: "23.2"
```

**Always use `Math.round` before inserting:**

```typescript
// In parse-recipe/index.ts:
const parseNutritionInt = (val: number | null) =>
  val != null ? Math.round(val) : null;

// Usage:
calories:   parseNutritionInt(raw.calories),
protein_g:  parseNutritionInt(raw.protein_g),
carbs_g:    parseNutritionInt(raw.carbs_g),
fat_g:      parseNutritionInt(raw.fat_g),
sodium_mg:  parseNutritionInt(raw.sodium_mg),
// fiber_g, sugar_g, saturated_fat_g are numeric(6,1) — floats OK
```

### Reanimated Worklet Safety

Reanimated worklets run on a separate JS thread. **You cannot read React refs or call JS functions directly inside a worklet.** Always use `runOnJS()`:

```typescript
// WRONG — crashes:
const gesture = Gesture.Pan().onEnd(() => {
  onDrop(slotRef.current); // ❌ JS ref read in worklet
});

// RIGHT:
const handleDrop = runOnJS((slot: string) => onDrop(slot));
const gesture = Gesture.Pan().onEnd(() => {
  handleDrop(activeSlot.value); // ✅ shared value read in worklet, JS call via runOnJS
});
```

### Supabase RLS Infinite Recursion

Policies on `family_members` that query `family_members` create infinite recursion. Always use the `get_my_family_id()` SECURITY DEFINER function:

```sql
-- WRONG:
create policy "members can see family" on family_members
  for select using (
    exists (select 1 from family_members where user_id = auth.uid()) -- ❌ recursive
  );

-- RIGHT:
create policy "members can see family" on family_members
  for select using (
    family_id = get_my_family_id() -- ✅ security definer avoids recursion
  );
```

### RLS Performance: Cache `auth.uid()`

Using `auth.uid()` directly in a policy causes a function call per-row. Use the cached form:

```sql
-- SLOW:
create policy "..." on recipes for select using (user_id = auth.uid());

-- FAST:
create policy "..." on recipes for select using (user_id = (select auth.uid()));
```

Run `mcp__supabase__get_advisors` (type: `performance`) after every migration to catch this automatically.

---

*Last updated: 2026-02-26 | App is in Phase 1 → Phase 2 transition.*
