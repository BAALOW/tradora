export default function LoadingSkeleton({ className = '', rounded = 'rounded-lg' }) {
  return <div className={`skeleton ${rounded} ${className}`} />
}
