export default function Avatar({ name = '', src, size = 36, className = '' }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase())
    .join('')

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        style={{ width: size, height: size }}
        className={`rounded-full object-cover ${className}`}
      />
    )
  }

  return (
    <div
      style={{ width: size, height: size }}
      className={`flex items-center justify-center rounded-full bg-blue-50 text-sm font-semibold text-brand ${className}`}
    >
      {initials || 'T'}
    </div>
  )
}
