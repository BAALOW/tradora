import { useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'

export function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'U'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/**
 * Xogta profile-ka isku mid ah meel kasta (Sidebar, Topbar, Settings).
 * Avatar: sawirka user-ku soo geliyay > sawirka Google > initials (avatarUrl = '')
 */
export default function useProfile() {
  const { user } = useAuth()

  return useMemo(() => {
    const m = user?.user_metadata || {}
    const name = m.full_name || m.name || user?.email?.split('@')[0] || 'Trader'
    return {
      name,
      email: user?.email || '',
      avatarUrl: m.custom_avatar_url || m.avatar_url || m.picture || '',
      initials: initialsOf(name),
    }
  }, [user])
}