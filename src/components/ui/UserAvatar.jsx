import { useEffect, useState } from 'react'
import { initialsOf } from '../../hooks/useProfile'

/** Avatar user-ka: sawir haddii uu jiro, hadday kale initials (MM) */
export default function UserAvatar({ src, name = 'Trader', size = 36, className = '' }) {
  const [broken, setBroken] = useState(false)
  useEffect(() => { setBroken(false) }, [src])

  const style = { width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.38)) }

  if (src && !broken) {
    return (
      <img
        src={src}
        alt={name}
        style={{ width: size, height: size }}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    )
  }

  return (
    <div
      style={style}
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 font-bold text-white ${className}`}
      aria-label={name}
    >
      {initialsOf(name)}
    </div>
  )
}