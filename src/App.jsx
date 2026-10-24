import { useEffect, useLayoutEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ToastProvider } from './components/ui/Toast'
import ProtectedRoute from './routes/ProtectedRoute'
import { applyTheme, getStoredTheme, setStoredTheme, THEME_VALUES } from './lib/theme'
import { initDarkFix } from './lib/darkFix'
import Login from './pages/Login'
import SignUp from './pages/SignUp'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import Accounts from './pages/Accounts'
import AccountDetailPage from './pages/AccountDetailPage'
import Journal from './pages/Journal'
import Backtesting from './pages/Backtesting'
import Tradingplan from './pages/Tradingplan'
import LearningHub from './pages/LearningHub'
import Analytics from './pages/Analytics'
import DailyWorship from './pages/DailyWorship'
import DailyRoutine from './pages/DailyRoutine'
import AiCoach from './pages/AiCoach'
import ImageKitTest from './pages/ImageKitTest'
import Settings from './pages/Settings'

const protectedPages = [
  ['/dashboard', Dashboard],
  ['/accounts', Accounts],
  ['/accounts/:accountId', AccountDetailPage],
  ['/journal', Journal],
  ['/backtesting', Backtesting],
  ['/plan', Tradingplan],
  ['/learning-hub', LearningHub],
  ['/analytics', Analytics],
  ['/daily-routine', DailyRoutine],
  ['/daily-worship', DailyWorship],
  ['/ai-coach', AiCoach],
  ['/settings', Settings],
  ['/imagekit-test', ImageKitTest],
]

/** Theme-ka app-ka oo dhan: Light / Dark / System (System wuxuu raacaa qalabka) */
function ThemeSync() {
  const { user } = useAuth()
  const remoteTheme = user?.user_metadata?.preferences?.theme

  // Dark catch-all: midabada iftiin ah ee CSS-ku garan karin (hex arbitrary, inline style) si automatic ah u saxda
  useLayoutEffect(() => initDarkFix(), [])

  // Marka app-ku furmo
  useEffect(() => { applyTheme(getStoredTheme()) }, [])

  // Theme-ka Supabase ku kaydsan (qalab kale) → local + apply
  useEffect(() => {
    if (!THEME_VALUES.includes(remoteTheme)) return
    setStoredTheme(remoteTheme)
    applyTheme(remoteTheme)
  }, [remoteTheme])

  // Haddii "System" la doortay, raac isbeddelka qalabka
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return undefined
    const onChange = () => { if (getStoredTheme() === 'system') applyTheme('system') }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return null
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeSync />
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {protectedPages.map(([path, Page]) => (
              <Route
                key={path}
                path={path}
                element={
                  <ProtectedRoute>
                    <Page />
                  </ProtectedRoute>
                }
              />
            ))}

            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  )
}