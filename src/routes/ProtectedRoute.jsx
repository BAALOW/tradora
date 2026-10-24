import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute({ children }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-bg">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand" />
          <p className="text-sm text-text-muted">Loading your workspace…</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return children
}
