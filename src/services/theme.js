/**
 * @file Theme preference.
 *
 * Dark is the default and stays the default: it is the identity, and it is
 * what every user so far has seen. Light exists because a mall is a bright
 * place — gold on black is hard to read through a skylight at two in the
 * afternoon, and dark-on-light is easier for older eyes.
 *
 * The choice is remembered, because someone who reached for the toggle once
 * had a reason and should not have to find it again.
 */

const KEY = 'wayfin_theme'

/** @typedef {'dark' | 'light'} Theme */

/** @returns {Theme} */
export function readTheme() {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

/**
 * Apply a theme and remember it.
 * Written to the root element so the CSS custom properties cascade to
 * everything without a single component knowing which theme is active.
 * @param {Theme} theme
 */
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // A private-mode browser losing the preference is not worth failing over.
  }
}
