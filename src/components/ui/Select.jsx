import { ChevronDown } from 'lucide-react'
import { forwardRef } from 'react'

const Select = forwardRef(function Select({ label, options = [], className = '', id, ...props }, ref) {
  const selectId = id || props.name
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={selectId} className="text-sm font-medium text-text-primary">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          className={`h-11 w-full appearance-none rounded-xl border border-border bg-white px-3 pr-9 text-[15px] text-text-primary transition-colors duration-150 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 ${className}`}
          {...props}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
      </div>
    </div>
  )
})

export default Select
