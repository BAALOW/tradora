import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn(
    '[TRADORA] Supabase env vars are missing. Copy .env.example to .env and add your project URL + anon key.'
  )
}

// "Remember me" flag — read by `customStorage` below every time Supabase
// writes the session. Set this (via localStorage directly, not React
// state) right before calling signIn / signInWithGoogle so it's still
// readable even after a full-page OAuth redirect.
export const REMEMBER_ME_KEY = 'tradora_remember_me'

// Supabase always calls the same storage interface to persist the
// session; which physical storage it lands in is decided here.
// - Remember me ON  -> localStorage (survives closing the browser)
// - Remember me OFF -> sessionStorage (cleared when the tab/browser closes)
const customStorage = {
  getItem: (key) => {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key)
  },
  setItem: (key, value) => {
    if (typeof window === 'undefined') return
    const remember = window.localStorage.getItem(REMEMBER_ME_KEY) !== 'false'
    if (remember) {
      window.localStorage.setItem(key, value)
      window.sessionStorage.removeItem(key)
    } else {
      window.sessionStorage.setItem(key, value)
      window.localStorage.removeItem(key)
    }
  },
  removeItem: (key) => {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(key)
    window.sessionStorage.removeItem(key)
  },
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      storage: customStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
)