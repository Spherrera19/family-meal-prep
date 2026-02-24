# Family Meal Prep — Project Guide

## Tech Stack

- **React Native** — Cross-platform mobile UI framework
- **Expo** (with Expo Router / tabs template) — Build toolchain, dev server, and file-based routing
- **Supabase** — Backend: PostgreSQL database, authentication, real-time subscriptions, and storage

## Project Structure

```
family-meal-prep/
├── app/                  # Expo Router file-based routes
│   ├── (tabs)/           # Tab navigator screens
│   └── _layout.tsx       # Root layout
├── components/           # Shared UI components
├── constants/            # Colors, config values
├── hooks/                # Custom React hooks
└── assets/               # Images, fonts
```

## Common Commands

```bash
# Start the dev server
npx expo start

# Start with cache cleared
npx expo start --clear

# Run on Android emulator/device
npx expo run:android

# Run on iOS simulator (macOS only)
npx expo run:ios

# Run in web browser
npx expo start --web

# Install a new package (use expo install for Expo-compatible versions)
npx expo install <package-name>

# Install Supabase client
npx expo install @supabase/supabase-js @react-native-async-storage/async-storage

# Check for outdated Expo dependencies
npx expo-doctor
```

## Supabase Setup

1. Create a project at https://supabase.com
2. Copy your `SUPABASE_URL` and `SUPABASE_ANON_KEY` from Project Settings → API
3. Store credentials in a `.env` file (never commit this):
   ```
   EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```
4. Initialize the client in `lib/supabase.ts`:
   ```ts
   import { createClient } from '@supabase/supabase-js'

   export const supabase = createClient(
     process.env.EXPO_PUBLIC_SUPABASE_URL!,
     process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!
   )
   ```

## Notes

- Use `npx expo install` instead of `npm install` for Expo SDK packages to get compatible versions.
- Expo Router uses file-based routing — files in `app/` automatically become routes.
- `.env` and `node_modules/` are gitignored by default.
