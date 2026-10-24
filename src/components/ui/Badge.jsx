const tones = {
  success: 'bg-green-50 text-success border-green-100',
  danger: 'bg-red-50 text-danger border-red-100',
  warning: 'bg-amber-50 text-warning border-amber-100',
  brand: 'bg-blue-50 text-brand border-blue-100',
  ai: 'bg-violet-50 text-ai border-violet-100',
  neutral: 'bg-surface text-text-secondary border-border',
}

export default function Badge({ children, tone = 'neutral', className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  )
}
