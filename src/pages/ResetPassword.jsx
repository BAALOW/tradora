import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Logo from '../components/layout/Logo'
import PasswordInput from '../components/ui/PasswordInput'
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
          A private operating system for serious forex traders — journal every setup, monitor risk in real
          time, and see exactly what's working.
        </p>
      </div>

      <p className="relative z-10 text-xs text-slate-500">© {new Date().getFullYear()} TRADORA. All rights reserved.</p>
    </div>
  )
}

export default function ResetPassword() {
  const { session, loading: authLoading, updatePassword } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const validate = () => {
    const next = {}
    if (!password) next.password = 'Enter a new password.'
    else if (password.length < 8) next.password = 'Use at least 8 characters.'
    if (confirmPassword !== password) next.confirmPassword = 'Passwords do not match.'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    try {
      await updatePassword(password)
      showToast({ type: 'success', title: 'Password updated', description: 'You can now use your new password.' })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Could not update password',
        description: err?.message || 'Please try again.',
      })
    } finally {
      setSubmitting(false)
    }
  }

  // Verifying the 6-digit code on the Forgot Password page signs the
  // person in with a short-lived recovery session. If that session isn't
  // present once auth has finished loading, they landed here without
  // verifying a code (or it already expired).
  const sessionMissing = !authLoading && !session

  return (
    <div className="grid min-h-screen grid-cols-1 bg-bg lg:grid-cols-2">
      <BrandPanel />

      <div className="flex items-center justify-center px-6 py-10 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo size={30} />
          </div>

          {sessionMissing ? (
            <>
              <h1 className="text-[28px] font-bold text-text-primary">Session expired</h1>
              <p className="mt-1.5 text-sm text-text-secondary">
                Your reset session has expired or wasn't verified. Request a new code to continue.
              </p>
              <Link to="/forgot-password">
                <Button size="lg" className="mt-8 w-full">Request a New Code</Button>
              </Link>
            </>
          ) : (
            <>
              <h1 className="text-[28px] font-bold text-text-primary">Set a new password</h1>
              <p className="mt-1.5 text-sm text-text-secondary">Choose a new password for your account.</p>

              <form className="mt-8 flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
                <PasswordInput
                  label="New Password"
                  name="password"
                  placeholder="••••••••"
                  value={password}
                  error={errors.password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  autoFocus
                />

                <PasswordInput
                  label="Confirm New Password"
                  name="confirmPassword"
                  placeholder="••••••••"
                  value={confirmPassword}
                  error={errors.confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />

                <Button type="submit" size="lg" loading={submitting} disabled={authLoading} className="w-full">
                  Update Password
                </Button>
              </form>
            </>
          )}

          <p className="mt-8 text-center text-sm text-text-secondary">
            <Link to="/login" className="font-semibold text-brand hover:text-blue-700">
              Back to Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}