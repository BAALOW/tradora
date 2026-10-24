import { Loader2 } from 'lucide-react'

const variants = {
  primary:
    'bg-brand text-white hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-300 shadow-sm',
  secondary:
    'bg-white text-text-primary border border-border hover:bg-surface active:bg-slate-100 disabled:text-text-muted',
  ghost:
    'bg-transparent text-text-secondary hover:bg-surface active:bg-slate-100',
  danger:
    'bg-danger text-white hover:bg-red-700 active:bg-red-800 disabled:bg-red-300',
}

const sizes = {
  sm: 'h-9 px-3 text-sm rounded-lg',
  md: 'h-11 px-4 text-sm rounded-xl',
  lg: 'h-12 px-5 text-[15px] rounded-xl',
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  icon: Icon,
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 font-medium transition-colors duration-150 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {!loading && Icon && <Icon className="h-4 w-4" />}
      {children}
    </button>
  )
}
