import { useEffect, useState } from 'react'
import { readTheme, applyTheme } from '../services/theme.js'

/**
 * Light / dark switch, top right of every screen.
 *
 * Sun and moon rather than a word, because the icon is understood without
 * reading — which is the whole point of the feedback that prompted it. The
 * label still says what tapping does, for screen readers and for anyone who
 * holds a control to find out.
 */
export default function ThemeToggle({ className = '' }) {
  const [theme, setTheme] = useState(readTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  const next = theme === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} mode`}
      className={`flex h-11 w-11 flex-none items-center justify-center rounded-xl border border-ivory/15 text-ivory/70 cursor-pointer active:bg-ivory/10 ${className}`}
    >
      {theme === 'dark' ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      )}
    </button>
  )
}
