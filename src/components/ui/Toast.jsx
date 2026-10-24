import { createContext, useCallback, useContext, useState } from 'react'
import { CheckCircle2, XCircle, Info, X } from 'lucide-react'

const ToastContext = createContext(undefined)

const icons = {
  success: <CheckCircle2 className="h-5 w-5 text-success" />,
  error: <XCircle className="h-5 w-5 text-danger" />,
  info: <Info className="h-5 w-5 text-brand" />,
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const showToast = useCallback(
    ({ type = 'info', title, description, duration = 4000 }) => {
      const id = Math.random().toString(36).slice(2)
      setToasts((prev) => [...prev, { id, type, title, description }])
      if (duration) setTimeout(() => dismiss(id), duration)
      return id
    },
    [dismiss]
  )

  return (
    <ToastContext.Provider value={{ showToast, dismiss }}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-full max-w-sm flex-col gap-2 sm:bottom-6 sm:right-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-start gap-3 rounded-xl border border-border bg-white p-4 shadow-popover animate-slide-up"
          >
            {icons[t.type]}
            <div className="flex-1">
              {t.title && <p className="text-sm font-semibold text-text-primary">{t.title}</p>}
              {t.description && <p className="mt-0.5 text-sm text-text-secondary">{t.description}</p>}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="text-text-muted transition-colors hover:text-text-secondary"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (ctx === undefined) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
