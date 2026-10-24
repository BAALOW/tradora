export default function Logo({ size = 32, showWordmark = true, className = '' }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="8" fill="#2563EB" />
        <path
          d="M9 20.5L14 14.5L18 18L23 11.5"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M19 11.5H23V15.5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {showWordmark && (
        <span className="text-lg font-bold tracking-tight text-text-primary">TRADORA</span>
      )}
    </div>
  )
}
