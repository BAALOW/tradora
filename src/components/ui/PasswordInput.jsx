import { forwardRef, useState } from 'react'
import { Eye, EyeOff, Lock } from 'lucide-react'

const PasswordInput = forwardRef(function PasswordInput(
  { label, error, id, className = '', hint, ...props },
  ref
) {
  const [visible, setVisible] = useState(false)
  const inputId = id || props.name

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-text-primary">
          {label}
        </label>
      )}
      <div className="relative">
        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          ref={ref}
          id={inputId}
          type={visible ? 'text' : 'password'}
          className={`h-11 w-full rounded-xl border bg-white pl-10 pr-11 text-[15px] text-text-primary placeholder:text-text-muted transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand ${
            error ? 'border-danger focus:border-danger focus:ring-danger/15' : 'border-border'
          } ${className}`}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted transition-colors hover:text-text-secondary"
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
      {!error && hint && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  )
})

export default PasswordInput
