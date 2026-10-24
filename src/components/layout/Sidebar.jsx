import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Wallet,
  BookOpen,
  ClipboardList,
  History,
  Layers,
  BarChart3,
  Sunrise,
  Moon,
  Sparkles,
  Settings,
  X,
} from 'lucide-react'
import Logo from './Logo'
import UserAvatar from '../ui/UserAvatar'
import useProfile from '../../hooks/useProfile'

const sections = [
  {
    label: 'Overview',
    items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Trading',
    items: [
      { to: '/accounts', label: 'Accounts', icon: Wallet },
      { to: '/journal', label: 'Trading Journal', icon: BookOpen },
      { to: '/plan', label: 'Trading Plan', icon: ClipboardList },
      { to: '/backtesting', label: 'Backtesting', icon: History },
      { to: '/learning-hub', label: 'Learning Hub', icon: Layers },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { to: '/analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'Productivity',
    items: [
      { to: '/daily-routine', label: 'Daily Routine', icon: Sunrise },
      { to: '/daily-worship', label: 'Daily Worship', icon: Moon },
    ],
  },
  {
    label: 'AI',
    items: [{ to: '/ai-coach', label: 'AI Coach', icon: Sparkles }],
  },
  {
    label: 'System',
    items: [{ to: '/settings', label: 'Settings', icon: Settings }],
  },
]

function NavItem({ to, label, icon: Icon, onNavigate }) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 ${
          isActive
            ? 'bg-blue-50 text-brand'
            : 'text-text-secondary hover:bg-surface hover:text-text-primary'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" />
          )}
          <Icon
            className={`h-[18px] w-[18px] ${
              isActive
                ? 'text-brand'
                : 'text-text-muted group-hover:text-text-secondary'
            }`}
          />
          <span>{label}</span>
        </>
      )}
    </NavLink>
  )
}

export default function Sidebar({ open, onClose }) {
  const { name, email, avatarUrl } = useProfile()

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[250px] flex-col border-r border-border bg-white transition-transform duration-200 lg:sticky lg:top-0 lg:z-0 lg:h-screen lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <div>
            <Logo size={30} />
            <p className="mt-1 text-xs text-text-muted">Trade with Structure</p>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-text-muted hover:bg-surface lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {sections.map((section) => (
            <div key={section.label} className="mb-5">
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                {section.label}
              </p>

              <div className="flex flex-col gap-0.5">
                {section.items.map((item) => (
                  <NavItem
                    key={item.to}
                    {...item}
                    onNavigate={onClose}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-border p-4">
          <NavLink
            to="/settings"
            onClick={onClose}
            className="flex items-center gap-3 rounded-xl bg-surface p-3 transition-colors hover:bg-blue-50"
          >
            <UserAvatar src={avatarUrl} name={name} size={36} />

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-text-primary">
                {name}
              </p>
              <p className="truncate text-xs text-text-muted">
                {email}
              </p>
            </div>

            <span className="flex items-center gap-1 text-xs font-medium text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Connected
            </span>
          </NavLink>
        </div>
      </aside>
    </>
  )
}