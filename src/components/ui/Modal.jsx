import { X } from 'lucide-react'
import { useEffect } from 'react'

export default function Modal({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return

    const onKey = (e) => e.key === 'Escape' && onClose?.()

    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'

    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-xl rounded-2xl border border-border bg-white p-6 shadow-popover animate-slide-up">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">
            {title}
          </h2>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface hover:text-text-secondary"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div>{children}</div>

        {footer && (
          <div className="mt-6 flex justify-end gap-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}