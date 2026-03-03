# Family Meal Prep — Development Roadmap

> **For Claude:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement any phase task-by-task.

**Goal:** Evolve the Family Meal Prep app into a premium, AI-driven meal planning platform ("Mealchemy") with a clear monetization path — store-ready, cross-platform, and production-hardened.

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

## Phase 2: Universal Brand, UI Overhaul & Optimization

**Goal:** Establish a premium, cohesive design system; maximize performance and security; meet strict accessibility standards across all platforms.

### 2.1 Unified Design System

Adopt **NativeWind** or **React Native Unistyles** to replace all inline `StyleSheet` usage with a single source of truth for spacing, typography, color tokens, and dark mode. Every screen and component must consume the design system — no ad-hoc magic numbers.

### 2.2 Premium Micro-Interactions

- Replace static icons with **custom SVGs** (via `react-native-svg`) for brand consistency.
- Add **Lottie animations** (`lottie-react-native`) for high-delight moments: successful meal drops, recipe import completion, shopping list check-offs.

### 2.3 Performance Sweep

- Replace all `FlatList` / `ScrollView` recipe lists with **`@shopify/flash-list`** for virtualized rendering.
- Replace all `Image` components with **`expo-image`** for aggressive disk/memory caching, blurhash placeholders, and WebP support.

### 2.4 Security & Accessibility Sweep

- Audit all Supabase RLS policies: enforce `family_id`-scoped isolation, use `(select auth.uid())` caching pattern, run `get_advisors` after every migration.
- Full **a11y audit**: `accessibilityLabel`, `accessibilityRole`, and `accessibilityHint` on all interactive elements; ensure WCAG 2.1 AA contrast ratios across light and dark themes on Web and Mobile.

---

## Phase 3: The Mealchemy Engine (AI Fusion)

**Goal:** Introduce the app's signature AI feature — a "Cauldron" that generates custom recipes from pantry ingredients using a large language model.

### 3.1 Cauldron / Fusion UI

Build a dedicated **"Mealchemy" screen** using `react-native-gesture-handler` and Reanimated:
- Drag ingredient cards onto a central "cauldron" drop zone.
- Animate the collision/fusion using Reanimated v4 layout transitions and Lottie.
- Show a loading state ("brewing…") while the LLM generates the recipe.

Platform-split all gesture code strictly: `IngredientCard.native.tsx` for gesture physics, `IngredientCard.tsx` for web tap-based selection.

### 3.2 Generative Recipe Edge Function

Create a new Supabase Edge Function (`generate-recipe`) that:
- Accepts an array of user-selected pantry ingredients.
- Constructs a prompt and calls **Claude 3.5 Sonnet** (or OpenAI GPT-4o as fallback) via their respective APIs.
- Returns a strictly typed JSON-LD recipe object (same schema as `parse-recipe` output) for seamless insertion into the existing recipes table.
- Validates and sanitizes LLM output before returning to the client.

Use `claude-haiku-4-5-20251001` for speed/cost on simple requests; escalate to `claude-sonnet-4-6` for complex multi-ingredient fusions.

---

## Phase 4: Frictionless Intake (Barcode Scanning)

**Goal:** Eliminate manual nutrition entry by letting users scan barcodes to instantly populate ingredient and snack data.

### 4.1 Barcode Scanner

Integrate **`expo-camera`** with barcode scanning mode. Build a reusable `BarcodeScanner` component that:
- Opens the camera in a modal sheet.
- Detects UPC/EAN barcodes in real time.
- Returns the barcode string to the calling screen.

### 4.2 Food Database Lookup

On barcode scan, query the **Open Food Facts API** (`https://world.openfoodfacts.org/api/v2/product/{barcode}.json`):
- Extract product name, serving size, and per-serving macros (calories, protein, carbs, fat, fiber, sodium).
- Map to the existing `Recipe` / ingredient schema.
- Cache results in a new `barcode_cache` Supabase table (keyed by barcode, 30-day TTL) to avoid redundant API calls.

Surface scan results in both the Shopping List tab (add scanned item) and the Recipes tab (import as a single-ingredient recipe).

---

## Phase 5: Family Scaling & Habit Insights

**Goal:** Make the app indispensable for multi-member households by personalizing portions and driving daily engagement through notifications.

### 5.1 Algorithmic Portioning

Build a **serving-size scaler** that:
- Reads each family member's individual macro and caloric goals from their user profile.
- For a given Mealchemy-generated (or imported) recipe, calculates per-member portion sizes in ounces that hit their targets.
- Displays a per-member breakdown in the meal plan slot detail view.

Formula basis: `portion_oz = (member_calorie_goal / recipe_calories_per_oz)` — adjusted proportionally for protein/carb/fat splits.

### 5.2 Habit Notifications

Integrate **`expo-notifications`** for:
- Daily macro summary push at a user-configured time ("You've hit 80% of your protein goal today!").
- Meal prep reminders the evening before a planned meal day.
- Weekly streak badges for consecutive days with complete meal plans.

Gate notification scheduling behind permission request; respect platform (iOS/Android) notification best practices.

---

## Phase 6: Monetization & Store Readiness

**Goal:** Ship to the App Store and Google Play with a sustainable subscription revenue model under the "Mealchemy+" brand.

### 6.1 RevenueCat Integration

Integrate **RevenueCat** (`react-native-purchases`) as the single source of truth for subscription state:
- Configure "Mealchemy+" as a monthly ($4.99) and annual ($39.99) subscription product in both App Store Connect and Google Play Console.
- Offer a **7-day free trial** on first install.
- Mirror entitlements in Supabase via a RevenueCat webhook → Edge Function → `user_subscriptions` table.

### 6.2 Feature Gating

Lock the following features behind the "Mealchemy+" paywall:
- **AI Recipe Generation** (Phase 3): Free tier gets 3 lifetime fusions; premium = unlimited.
- **Barcode Scanning** (Phase 4): Premium only.
- **Family Scaling** (Phase 5): Premium only (requires ≥ 2 family members).

Free tier retains: manual recipe import (capped at 10 recipes), meal planning, shopping list, and basic nutrition tracking.

### 6.3 Store Submission Assets

- Draft and host a **Privacy Policy** covering: email, meal/nutrition data, family data, USDA/Anthropic API usage (anonymized), and data deletion requests.
- Create **App Store screenshots** (6.7" iPhone, 12.9" iPad) and a **Google Play feature graphic**.
- Write App Store and Play Store **descriptions** emphasizing Mealchemy AI, family collaboration, and nutrition tracking.
- Pass **App Store Review Guidelines** checklist: no private APIs, correct permission strings (`NSCameraUsageDescription`, `NSUserNotificationsUsageDescription`), valid privacy manifest.

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

*Last updated: 2026-03-03 | App is in Phase 1 → Phase 2 transition.*
