import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, User } from 'lucide-react'
import Logo from '../components/layout/Logo'
import Input from '../components/ui/Input'
import PasswordInput from '../components/ui/PasswordInput'
import Checkbox from '../components/ui/Checkbox'
import Button from '../components/ui/Button'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../components/ui/Toast'

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
          Join traders who journal every setup, monitor risk in real time, and build a repeatable,
          data-backed process.
        </p>
      </div>

      <p className="relative z-10 text-xs text-slate-500">© {new Date().getFullYear()} TRADORA. All rights reserved.</p>
    </div>
  )
}

function getStrength(password) {
  if (!password) return { label: '', pct: 0, tone: 'neutral' }
  let score = 0
  if (password.length >= 8) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++

  if (score <= 1) return { label: 'Weak', pct: 33, tone: 'danger' }
  if (score <= 2) return { label: 'Fair', pct: 66, tone: 'warning' }
  return { label: 'Strong', pct: 100, tone: 'success' }
}

export default function SignUp() {
  const { signUp } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirmPassword: '' })
  const [agreed, setAgreed] = useState(false)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)

  const strength = useMemo(() => getStrength(form.password), [form.password])

  const validate = () => {
    const next = {}
    if (!form.fullName.trim()) next.fullName = 'Full name is required.'
    if (!form.email) next.email = 'Email is required.'
    else if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = 'Enter a valid email address.'
    if (!form.password) next.password = 'Password is required.'
    else if (form.password.length < 8) next.password = 'Use at least 8 characters.'
    if (form.confirmPassword !== form.password) next.confirmPassword = 'Passwords do not match.'
    if (!agreed) next.terms = 'You must agree to the Terms and Privacy Policy.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      await signUp(form)
      showToast({
        type: 'success',
        title: 'Account created',
        description: 'Welcome to TRADORA — let\'s set up your workspace.',
      })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Sign up failed',
        description: err?.message || 'Something went wrong. Please try again.',
      })
    } finally {
      setLoading(false)
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

          <h1 className="text-[28px] font-bold text-text-primary">Create your TRADORA account</h1>
          <p className="mt-1.5 text-sm text-text-secondary">Build a better trading process.</p>

          <form className="mt-8 flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
            <Input
              label="Full Name"
              name="fullName"
              placeholder="Jordan Carter"
              icon={User}
              value={form.fullName}
              error={errors.fullName}
              onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
              autoComplete="name"
            />

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

            <div>
              <PasswordInput
                label="Password"
                name="password"
                placeholder="At least 8 characters"
                value={form.password}
                error={errors.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                autoComplete="new-password"
              />
              {form.password && (
                <div className="mt-2">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        strength.tone === 'danger'
                          ? 'bg-danger'
                          : strength.tone === 'warning'
                          ? 'bg-warning'
                          : 'bg-success'
                      }`}
                      style={{ width: `${strength.pct}%` }}
                    />
                  </div>
                  <p
                    className={`mt-1 text-xs font-medium ${
                      strength.tone === 'danger'
                        ? 'text-danger'
                        : strength.tone === 'warning'
                        ? 'text-warning'
                        : 'text-success'
                    }`}
                  >
                    {strength.label}
                  </p>
                </div>
              )}
            </div>

            <PasswordInput
              label="Confirm Password"
              name="confirmPassword"
              placeholder="Re-enter your password"
              value={form.confirmPassword}
              error={errors.confirmPassword}
              onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
              autoComplete="new-password"
            />

            <div>
              <Checkbox
                id="terms"
                checked={agreed}
                onChange={() => setAgreed((v) => !v)}
                label={
                  <span>
                    I agree to the{' '}
                    <a href="/terms" className="font-medium text-brand hover:text-blue-700">
                      Terms
                    </a>{' '}
                    and{' '}
                    <a href="/privacy" className="font-medium text-brand hover:text-blue-700">
                      Privacy Policy
                    </a>
                    .
                  </span>
                }
              />
              {errors.terms && <p className="mt-1.5 text-xs font-medium text-danger">{errors.terms}</p>}
            </div>

            <Button type="submit" size="lg" loading={loading} className="w-full">
              Create Account
            </Button>
          </form>

          <p className="mt-8 text-center text-sm text-text-secondary">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-brand hover:text-blue-700">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
