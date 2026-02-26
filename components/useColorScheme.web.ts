import { useEffect, useState } from 'react'

// Start with 'light' for SSR consistency (avoids hydration mismatch),
// then sync to the real system preference after mount.
export function useColorScheme(): 'light' | 'dark' {
  const [scheme, setScheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    setScheme(mq.matches ? 'dark' : 'light')
    const handler = (e: MediaQueryListEvent) => setScheme(e.matches ? 'dark' : 'light')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return scheme
}
