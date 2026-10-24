import { X } from 'lucide-react'
import { useEffect } from 'react'

export default function Drawer({ open, onClose, title, subtitle, children, widthClass = 'sm:max-w-xl' }) {
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
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-900/40 animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        className={`relative flex h-full w-full flex-col bg-white shadow-popover animate-slide-up sm:animate-none ${widthClass}`}
      >
        <div className="flex items-start justify-between border-b border-border px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-text-muted">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface hover:text-text-secondary"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  )
}