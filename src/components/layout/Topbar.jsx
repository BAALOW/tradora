import { useState } from 'react'
import { Menu, Sparkles, ChevronDown, LogOut, Settings } from 'lucide-react'
import Dropdown from '../ui/Dropdown'
import UserAvatar from '../ui/UserAvatar'
import NotificationBell from './NotificationBell'
import useProfile from '../../hooks/useProfile'
import { useAuth } from '../../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function Topbar({ onMenuClick, accounts = [], selectedAccount, onSelectAccount, breadcrumb }) {
  const { signOut } = useAuth()
  const { name, avatarUrl } = useProfile()
  const navigate = useNavigate()
  const [accountOpen, setAccountOpen] = useState(false)

  // Cinwaanka page-ka waxaa laga qaadaa qeybta u dambaysa ee breadcrumb-ka ("Overview / Settings" → "Settings")
  const title = String(breadcrumb || '').split('/').pop().trim() || 'Dashboard'

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-white px-4 sm:px-6">
      <button
        onClick={onMenuClick}
        className="rounded-lg p-2 text-text-secondary hover:bg-surface lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[15px] font-semibold text-text-primary">{title}</h1>
        <p className="hidden truncate text-xs text-text-muted sm:block">{breadcrumb}</p>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="relative hidden sm:block">
          <button
            onClick={() => setAccountOpen((v) => !v)}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3.5 text-sm font-semibold text-text-primary transition-colors hover:bg-surface"
          >
            {selectedAccount?.label}
            <ChevronDown className={`h-4 w-4 text-text-muted transition-transform ${accountOpen ? 'rotate-180' : ''}`} />
          </button>
          {accountOpen && (
            <div className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-border bg-white p-1.5 shadow-popover animate-slide-up">
              {accounts.map((acc) => (
                <button
                  key={acc.id}
                  onClick={() => {
                    onSelectAccount?.(acc)
                    setAccountOpen(false)
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
                >
                  <span>{acc.label}</span>
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${acc.status === 'connected' ? 'bg-success' : 'bg-text-muted'}`}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <NotificationBell />

        <button
          onClick={() => navigate('/ai-coach')}
          className="hidden items-center gap-1.5 rounded-xl border border-violet-100 bg-violet-50 px-3.5 py-2 text-sm font-medium text-ai transition-colors hover:bg-violet-100 sm:flex"
        >
          <Sparkles className="h-4 w-4" />
          AI Coach
        </button>

        <Dropdown
          align="right"
          trigger={
            <button className="rounded-full ring-offset-2 transition hover:ring-2 hover:ring-brand/20" aria-label={name}>
              <UserAvatar src={avatarUrl} name={name} size={36} />
            </button>
          }
          items={[
            { value: 'settings', label: 'Settings', icon: Settings },
            { value: 'logout', label: 'Log out', icon: LogOut },
          ]}
          onSelect={(item) => {
            if (item.value === 'logout') handleLogout()
            if (item.value === 'settings') navigate('/settings')
          }}
        />
      </div>
    </header>
  )
}