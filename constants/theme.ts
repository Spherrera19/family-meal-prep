// Shared Slate-palette theme used across all screens.
// Both objects have identical structure so `typeof LIGHT === AppTheme`.

export const LIGHT = {
  bg:     '#f8fafc',
  card:   '#ffffff',
  text:   '#0f172a',
  muted:  '#94a3b8',
  border: '#e2e8f0',
  accent: '#2563eb',
}

export const DARK = {
  bg:     '#0f172a',
  card:   '#1e293b',
  text:   '#f1f5f9',
  muted:  '#64748b',
  border: '#334155',
  accent: '#2563eb',
}

export type AppTheme = typeof LIGHT

export function getTheme(colorScheme: 'light' | 'dark' | null | undefined): AppTheme {
  return colorScheme === 'dark' ? DARK : LIGHT
}
