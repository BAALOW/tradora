const toneMap = {
  brand: 'bg-brand',
  success: 'bg-success',
  danger: 'bg-danger',
  warning: 'bg-warning',
  ai: 'bg-ai',
}

export default function ProgressBar({ value = 0, max = 100, tone = 'brand', className = '', trackClassName = '' }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-surface ${trackClassName} ${className}`}>
      <div
        className={`h-full rounded-full transition-all duration-500 ${toneMap[tone]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
