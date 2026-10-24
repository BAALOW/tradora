import { Check } from 'lucide-react'

export default function Checkbox({ checked, onChange, label, id, className = '' }) {
  return (
    <label htmlFor={id} className={`inline-flex cursor-pointer select-none items-center gap-2 ${className}`}>
      <span className="relative inline-flex h-[18px] w-[18px] items-center justify-center">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="peer sr-only"
        />
        <span
          className={`flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border transition-colors duration-150 ${
            checked ? 'border-brand bg-brand' : 'border-border bg-white'
          } peer-focus-visible:ring-2 peer-focus-visible:ring-brand/25`}
        >
          {checked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
        </span>
      </span>
      {label && <span className="text-sm text-text-secondary">{label}</span>}
    </label>
  )
}
