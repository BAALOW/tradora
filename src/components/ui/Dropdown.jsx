import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export default function Dropdown({ label, items = [], onSelect, trigger, align = 'left' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div className="relative" ref={ref}>
      {trigger ? (
        <span onClick={() => setOpen((v) => !v)}>{trigger}</span>
      ) : (
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-white px-4 text-sm font-medium text-text-primary transition-colors hover:bg-surface"
        >
          {label}
          <ChevronDown className={`h-4 w-4 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      )}
      {open && (
        <div
          className={`absolute z-40 mt-2 min-w-[180px] rounded-xl border border-border bg-white p-1.5 shadow-popover animate-slide-up ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {items.map((item) => (
            <button
              key={item.value}
              onClick={() => {
                onSelect?.(item)
                setOpen(false)
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
            >
              {item.icon && <item.icon className="h-4 w-4" />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
