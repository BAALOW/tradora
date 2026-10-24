import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Mail } from 'lucide-react'
import Logo from '../components/layout/Logo'
import Input from '../components/ui/Input'
import PasswordInput from '../components/ui/PasswordInput'
import Checkbox from '../components/ui/Checkbox'
import Button from '../components/ui/Button'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/ui/Toast'
import { REMEMBER_ME_KEY } from '../lib/supabaseClient'

function BrandPanel() {
  return (
    <div className="relative hidden h-full flex-col justify-between overflow-hidden bg-[#0B1220] p-12 text-white lg:flex">
      <div className="absolute inset-0 opacity-[0.06]">
        <svg width="100%" height="100%" viewBox="0 0 600 800" preserveAspectRatio="none">
          <path d="M0 600 L60 560 L120 610 L180 500 L240 540 L300 420 L360 460 L420 340 L480 380 L540 260 L600 300"
            stroke="white" strokeWidth="2" fill="none" />
          <path d="M0 700 L60 680 L120 690 L180 640 L240 660 L300 590 L360 610 L420 540 L480 560 L540 480 L600 500"
            stroke="white" strokeWidth="2" fill="none" opacity="0.6" />
        </svg>
      </div>

      <Logo size={34} className="relative z-10" />

      <div className="relative z-10">
        <h2 className="max-w-sm text-3xl font-bold leading-tight">
          Trade with Structure.<br />Improve with Data.
        </h2>
        <p className="mt-4 max-w-sm text-sm text-slate-400">
          A private operating system for serious forex traders — journal every setup, monitor risk in real
          time, and see exactly what's working.
        </p>
      </div>

      <p className="relative z-10 text-xs text-slate-500">© {new Date().getFullYear()} TRADORA. All rights reserved.</p>
    </div>
  )
}

// Reads any `error` / `error_description` Supabase appends to the URL
// after a failed Google redirect (access denied, provider not enabled,
// etc). Checks both the query string and the hash, since Supabase uses
// either depending on where the failure happened.
function readOAuthError() {
  const query = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const raw = query.get('error_description') || hash.get('error_description') || query.get('error') || hash.get('error')
  if (!raw) return null
  return decodeURIComponent(raw.replace(/\+/g, ' '))
}

export default function Login() {
  const { signIn, signInWithGoogle, session, loading: authLoading } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  const [form, setForm] = useState({ email: '', password: '' })
  const [remember, setRemember] = useState(true)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  // Surface a failed Google sign-in (the person is redirected back here
  // with ?error=... in that case) exactly once, then clean the URL so a
  // refresh doesn't re-show the same toast.
  useEffect(() => {
    const message = readOAuthError()
    if (message) {
      showToast({ type: 'error', title: 'Google sign-in failed', description: message })
      window.history.replaceState(null, '', window.location.pathname)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Single place that redirects once a session exists — covers a normal
  // email/password sign-in, a successful Google redirect landing back on
  // this page, and someone who's already signed in navigating to /login
  // directly.
  useEffect(() => {
    if (!authLoading && session) {
      const redirectTo = location.state?.from?.pathname || '/dashboard'
      navigate(redirectTo, { replace: true })
    }
  }, [session, authLoading, navigate, location.state])

  const validate = () => {
    const next = {}
    if (!form.email) next.email = 'Email is required.'
    else if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = 'Enter a valid email address.'
    if (!form.password) next.password = 'Password is required.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      // Set before signing in — this decides whether Supabase ends up
      // writing the session to localStorage (persists) or sessionStorage
      // (cleared when the browser closes). See lib/supabaseClient.js.
      window.localStorage.setItem(REMEMBER_ME_KEY, remember ? 'true' : 'false')
      await signIn(form)
      showToast({ type: 'success', title: 'Welcome back', description: 'Signed in successfully.' })
      // Actual navigation happens in the session-watching effect above.
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Sign in failed',
        description: err?.message || 'Check your credentials and try again.',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    setGoogleLoading(true)
    try {
      // Same reasoning as above — this has to be written directly to
      // localStorage (not React state) because the page fully reloads
      // after the Google redirect, which wipes any in-memory state.
      window.localStorage.setItem(REMEMBER_ME_KEY, remember ? 'true' : 'false')
      await signInWithGoogle()
      // On success the browser navigates away immediately, so there's
      // nothing else to do here.
    } catch (err) {
      const raw = err?.message || ''
      const description = raw.toLowerCase().includes('provider is not enabled')
        ? 'Google sign-in isn\'t set up for this project yet. Enable it under Authentication → Providers in Supabase.'
        : raw || 'Please try again.'
      showToast({ type: 'error', title: 'Google sign-in failed', description })
      setGoogleLoading(false)
    }
  }

  return (
    <div className="grid min-h-screen grid-cols-1 bg-bg lg:grid-cols-2">
      <BrandPanel />

      <div className="flex items-center justify-center px-6 py-10 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo size={30} />
          </div>

          <h1 className="text-[28px] font-bold text-text-primary">Welcome back</h1>
          <p className="mt-1.5 text-sm text-text-secondary">Sign in to continue to your trading workspace.</p>

          <form className="mt-8 flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
            <Input
              label="Email"
              type="email"
              name="email"
              placeholder="you@example.com"
              icon={Mail}
              value={form.email}
              error={errors.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              autoComplete="email"
            />

            <PasswordInput
              label="Password"
              name="password"
              placeholder="••••••••"
              value={form.password}
              error={errors.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              autoComplete="current-password"
            />

            <div className="flex items-center justify-between">
              <Checkbox
                id="remember"
                checked={remember}
                onChange={() => setRemember((v) => !v)}
                label="Remember me"
              />
              <Link to="/forgot-password" className="text-sm font-medium text-brand hover:text-blue-700">
                Forgot password?
              </Link>
            </div>

            <Button type="submit" size="lg" loading={loading} disabled={googleLoading} className="w-full">
              Sign In
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs font-medium text-text-muted">OR</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={handleGoogle}
            loading={googleLoading}
            disabled={loading}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47c-.28 1.5-1.13 2.78-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.82z" />
              <path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.09C3.25 21.3 7.31 24 12 24z" />
              <path fill="#FBBC05" d="M5.27 14.28A7.2 7.2 0 0 1 4.88 12c0-.79.14-1.56.39-2.28V6.63H1.27A11.98 11.98 0 0 0 0 12c0 1.93.46 3.76 1.27 5.37l4-3.09z" />
              <path fill="#EA4335" d="M12 4.76c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.63l4 3.09C6.22 6.87 8.87 4.76 12 4.76z" />
            </svg>
            Continue with Google
          </Button>

          <p className="mt-8 text-center text-sm text-text-secondary">
            Don't have an account?{' '}
            <Link to="/signup" className="font-semibold text-brand hover:text-blue-700">
              Create account
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}