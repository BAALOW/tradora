const KEY = 'tradora_prefs'
export const THEME_VALUES = ['light', 'dark', 'system']

export function getStoredTheme() {
  try {
    const t = JSON.parse(localStorage.getItem(KEY) || '{}').theme
    return THEME_VALUES.includes(t) ? t : 'light'
  } catch {
    return 'light'
  }
}

export function setStoredTheme(theme) {
  try {
    const prev = JSON.parse(localStorage.getItem(KEY) || '{}')
    localStorage.setItem(KEY, JSON.stringify({ ...prev, theme }))
  } catch { /* ignore */ }
}

/** theme: 'light' | 'dark' | 'system' — ku dar/ka saar class-ka `dark` ee <html> */
export function applyTheme(theme) {
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', !!dark)
}