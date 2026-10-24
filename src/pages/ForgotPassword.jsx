import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail } from 'lucide-react'
import Logo from '../components/layout/Logo'
import Input from '../components/ui/Input'
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

const MIN_CODE_LENGTH = 6
const RESEND_COOLDOWN_SECONDS = 30

// A single, flexible field rather than fixed-count boxes. The exact
// length of the code Supabase emails can vary by project configuration
// (and differs between a 6-digit OTP and a longer token), so this just
// accepts whatever digits were typed or pasted rather than assuming a
// specific count.
function CodeField({ value, onChange }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))}
      inputMode="numeric"
      autoComplete="one-time-code"
      autoFocus
      placeholder="Enter code"
      className="w-full rounded-xl border border-border bg-white px-4 py-3 text-center text-2xl font-bold tracking-[0.3em] text-text-primary placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
    />
  )
}

export default function ForgotPassword() {
  const { requestPasswordReset, verifyRecoveryOtp } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [step, setStep] = useState('email') // 'email' | 'code'
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState('')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const validateEmail = () => {
    if (!email) {
      setEmailError('Email is required.')
      return false
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setEmailError('Enter a valid email address.')
      return false
    }
    setEmailError('')
    return true
  }

  const sendCode = async () => {
    setSending(true)
    try {
      await requestPasswordReset(email)
      setStep('code')
      setCode('')
      setCooldown(RESEND_COOLDOWN_SECONDS)
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Could not send code',
        description: err?.message || 'Please try again in a moment.',
      })
    } finally {
      setSending(false)
    }
  }

  const handleEmailSubmit = async (e) => {
    e.preventDefault()
    if (!validateEmail()) return
    await sendCode()
  }

  const handleResend = async () => {
    if (cooldown > 0 || sending) return
    await sendCode()
    showToast({ type: 'success', title: 'Code resent', description: `Check ${email} for the new code.` })
  }

  const handleCodeSubmit = async (e) => {
    e.preventDefault()
    if (code.length < MIN_CODE_LENGTH) {
      setCodeError('Enter the full code from your email.')
      return
    }
    setCodeError('')
    setVerifying(true)
    try {
      await verifyRecoveryOtp(email, code)
      navigate('/reset-password', { replace: true })
    } catch (err) {
      setCodeError(err?.message || 'That code is invalid or has expired.')
    } finally {
      setVerifying(false)
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

          {step === 'email' ? (
            <>
              <h1 className="text-[28px] font-bold text-text-primary">Forgot your password?</h1>
              <p className="mt-1.5 text-sm text-text-secondary">
                Enter the email on your account and we'll send you a code to reset it.
              </p>

              <form className="mt-8 flex flex-col gap-5" onSubmit={handleEmailSubmit} noValidate>
                <Input
                  label="Email"
                  type="email"
                  name="email"
                  placeholder="you@example.com"
                  icon={Mail}
                  value={email}
                  error={emailError}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                />

                <Button type="submit" size="lg" loading={sending} className="w-full">
                  Send Code
                </Button>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-[28px] font-bold text-text-primary">Enter your code</h1>
              <p className="mt-1.5 text-sm text-text-secondary">
                We sent a code to <span className="font-semibold text-text-primary">{email}</span>. Copy the full code
                from the email — it expires shortly.
              </p>

              <form className="mt-8 flex flex-col gap-5" onSubmit={handleCodeSubmit} noValidate>
                <div>
                  <CodeField value={code} onChange={(v) => { setCode(v); setCodeError('') }} />
                  {codeError && <p className="mt-2 text-center text-sm text-danger">{codeError}</p>}
                </div>

                <Button type="submit" size="lg" loading={verifying} className="w-full">
                  Verify Code
                </Button>
              </form>

              <div className="mt-5 flex items-center justify-center gap-1 text-sm text-text-secondary">
                Didn't get it?
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={cooldown > 0 || sending}
                  className="font-semibold text-brand hover:text-blue-700 disabled:cursor-not-allowed disabled:text-text-muted disabled:no-underline"
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                </button>
              </div>

              <button
                type="button"
                onClick={() => { setStep('email'); setCode(''); setCodeError('') }}
                className="mt-2 w-full text-center text-sm font-medium text-text-secondary hover:text-text-primary"
              >
                Use a different email
              </button>
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