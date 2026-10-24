import { useState } from 'react'

export default function Tooltip({ children, label, side = 'top' }) {
  const [open, setOpen] = useState(false)

  const positions = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  }

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-lg bg-text-primary px-2.5 py-1.5 text-xs font-medium text-white shadow-popover animate-fade-in ${positions[side]}`}
        >
          {label}
        </span>
      )}
    </span>
  )
}
