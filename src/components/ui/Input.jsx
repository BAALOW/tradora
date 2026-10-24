import { forwardRef } from 'react'

const Input = forwardRef(function Input(
  { label, error, icon: Icon, id, className = '', hint, ...props },
  ref
) {
  const inputId = id || props.name

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-text-primary">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        )}
        <input
          ref={ref}
          id={inputId}
          className={`h-11 w-full rounded-xl border bg-white text-[15px] text-text-primary placeholder:text-text-muted transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand ${
            Icon ? 'pl-10 pr-3' : 'px-3'
          } ${error ? 'border-danger focus:border-danger focus:ring-danger/15' : 'border-border'} ${className}`}
          {...props}
        />
      </div>
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
      {!error && hint && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  )
})

export default Input
