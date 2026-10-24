export default function Card({ children, className = '', padded = true, as: Comp = 'div', ...props }) {
  return (
    <Comp
      className={`rounded-2xl border border-border bg-card shadow-card ${padded ? 'p-5 sm:p-6' : ''} ${className}`}
      {...props}
    >
      {children}
    </Comp>
  )
}
