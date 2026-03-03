# Family Meal Prep

A cross-platform family meal planning app built with React Native, Expo, and Supabase.

> **⚠️ AI-Generated Project**
> This application was built entirely through conversation with [Claude Code](https://claude.ai/claude-code) (Anthropic's AI coding assistant) and has not been personally hand-coded by the repository owner. It is shared as a demonstration of AI-assisted software development.

## Features

- **Meal Planning** — Weekly calendar view with dynamic meal slots (add/remove any slot type), drag-and-drop on native, tap-to-assign on web, and a daily macro summary bar
- **Recipe Dock** — Collapsible recipe tray at the bottom of the planner; jiggle edit mode (iOS-style) lets you delete cards with an X badge; native long-press drag or tap to arm
- **Recipe Import** — Paste any recipe URL to automatically extract ingredients, instructions, and nutrition data via a 5-strategy edge function pipeline
- **Serving Size Multiplier** — Adjust recipe servings in 0.5 steps on the detail modal; all 8 nutrients (calories, protein, carbs, fat, fiber, sugar, sodium, saturated fat) scale automatically
- **Family Shopping List** — Shared real-time list synced across all family members; "Select all" bulk-checks items for quick clearing via the existing "Clear checked" flow
- **Nutrition Tracking** — Daily calorie and macro progress vs. personal goals, with weight logging and history chart
- **Family Sharing** — Create a family group and invite members with a 6-character code
- **Cross-platform** — Runs on iOS, Android, and web browser

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React Native + Expo (Expo Router) |
| Backend | Supabase (PostgreSQL, Auth, Realtime, Edge Functions) |
| Language | TypeScript |

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project

### Setup

1. **Clone the repo and install dependencies**
   ```bash
   git clone <repo-url>
   cd family-meal-prep
   npm install
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   Fill in your Supabase project URL and anon key from **Project Settings → API**.

3. **Run database migrations**
   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

4. **Start the app**
   ```bash
   npx expo start
   ```
   Press `w` for web, `a` for Android, `i` for iOS.

## Project Structure

```
family-meal-prep/
├── app/
│   ├── (auth)/           # Sign-in and sign-up screens
│   ├── (tabs)/           # Main tab screens
│   │   ├── index.tsx     # Meal planning (drag-and-drop, recipe dock, macro bar)
│   │   ├── shopping.tsx  # Shopping list
│   │   ├── two.tsx       # Recipes (import, detail modal, serving multiplier)
│   │   ├── nutrition.tsx # Nutrition tracking + weight log
│   │   └── settings.tsx  # User profile / macro goals
│   └── _layout.tsx       # Root layout with auth redirect
├── components/
│   ├── RecipeListItem.tsx        # Recipe dock chip (web)
│   └── RecipeListItem.native.tsx # Recipe dock chip with jiggle + drag (native)
├── context/
│   └── AuthContext.tsx   # Session state
├── hooks/
│   ├── useFamily.ts          # Family create/join
│   ├── useMealPlan.ts        # Meal CRUD
│   ├── useShoppingList.ts    # Real-time shopping list + checkAll
│   ├── useRecipes.ts         # Recipe import and storage
│   ├── useDragAndDrop.ts     # Web stub (no-ops)
│   └── useDragAndDrop.native.ts # Native drag-and-drop
├── lib/
│   └── supabase.ts       # Supabase client
└── supabase/
    ├── functions/
    │   └── parse-recipe/  # Edge Function: URL → recipe data
    └── migrations/        # SQL migrations (001–010)
```

## Recipe Import

Uses a hybrid Supabase Edge Function that tries multiple extraction strategies in order:

1. **JSON-LD** (fast, free) — Schema.org structured data, covers most major sites
2. **Microdata** — `itemprop` attributes on older food blogs
3. **WordPress plugins** — WPRM, Tasty Recipes, Mediavine Create, hrecipe CSS selectors
4. **Heading heuristic** — Finds "Ingredients"/"Instructions" headings and extracts the following list
5. **Claude Haiku** (fallback) — Strips the page to plain text and asks `claude-haiku-4-5-20251001` to extract structured data — works on any site

Nutrition data (calories, protein, carbs, fat) is sourced from Schema.org markup when available, estimated by Claude in the fallback path, or calculated via the USDA FoodData Central API from ingredient weights.

> Requires `USDA_API_KEY` and `ANTHROPIC_API_KEY` set in Supabase Edge Function secrets.

## License

MIT
