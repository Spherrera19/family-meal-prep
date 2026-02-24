# Family Meal Prep

A cross-platform family meal planning app built with React Native, Expo, and Supabase.

> **⚠️ AI-Generated Project**
> This application was built entirely through conversation with [Claude Code](https://claude.ai/claude-code) (Anthropic's AI coding assistant) and has not been personally hand-coded by the repository owner. It is shared as a demonstration of AI-assisted software development.

## Features

- **Meal Planning** — Weekly calendar view to plan breakfast, lunch, and dinner for each day
- **Family Shopping List** — Shared real-time shopping list synced across all family members via Supabase Realtime
- **Recipe Import** — Paste any recipe URL to automatically extract ingredients and instructions
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
│   ├── (auth)/          # Sign-in and sign-up screens
│   ├── (tabs)/          # Main tab screens
│   │   ├── index.tsx    # Meal planning
│   │   ├── shopping.tsx # Shopping list
│   │   └── two.tsx      # Recipes
│   └── _layout.tsx      # Root layout with auth redirect
├── context/
│   └── AuthContext.tsx  # Session state
├── hooks/
│   ├── useFamily.ts     # Family create/join
│   ├── useMealPlan.ts   # Meal CRUD
│   ├── useShoppingList.ts # Real-time shopping list
│   └── useRecipes.ts    # Recipe import and storage
├── lib/
│   └── supabase.ts      # Supabase client
└── supabase/
    ├── functions/
    │   └── parse-recipe/ # Edge Function: URL → recipe data
    └── migrations/       # SQL migrations
```

## Recipe Import

The recipe importer uses a Supabase Edge Function to fetch and parse [Schema.org](https://schema.org/Recipe) JSON-LD markup. Works with most major recipe sites including:

- Sally's Baking Addiction
- Serious Eats
- Cookie and Kate
- Food52
- Most food blogs

> Note: Some sites (AllRecipes, BBC Good Food) block automated requests.

## License

MIT
