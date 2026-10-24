import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart3, Bell, BellRing, CheckCheck, Clock, ShieldAlert, TrendingUp } from 'lucide-react'
import { useNotifications } from '../../hooks/useNotifications'

const ICONS = {
  trade_alerts: [TrendingUp, 'bg-blue-50 text-blue-600'],
  daily_report: [BarChart3, 'bg-violet-50 text-violet-600'],
  routine_reminder: [Clock, 'bg-amber-50 text-amber-600'],
  prop_rules: [ShieldAlert, 'bg-rose-50 text-rose-600'],
  test: [BellRing, 'bg-emerald-50 text-emerald-600'],
}

const ago = (iso) => {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.floor(s / 60)}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  return `${Math.floor(s / 86400)}d`
}

export default function NotificationBell() {
  const navigate = useNavigate()
  const { items, unread, markRead, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const openItem = (n) => {
    markRead(n.id)
    setOpen(false)
    if (n.url) navigate(n.url)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 text-text-secondary transition-colors hover:bg-surface"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[340px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-white shadow-popover">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-text-primary">Notifications</p>
            {unread > 0 && (
              <button onClick={markAllRead} className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                <CheckCheck className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {items.length === 0 && (
              <p className="px-4 py-10 text-center text-xs text-text-muted">No notifications yet.</p>
            )}
            {items.map((n) => {
              const [Icon, tone] = ICONS[n.type] || ICONS.test
              return (
                <button
                  key={n.id} onClick={() => openItem(n)}
                  className={`flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-left last:border-0 hover:bg-surface/60 ${n.read_at ? '' : 'bg-blue-50/40'}`}
                >
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tone}`}><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-semibold text-text-primary">{n.title}</span>
                      <span className="shrink-0 text-[11px] text-text-muted">{ago(n.created_at)}</span>
                    </span>
                    <span className="mt-0.5 line-clamp-3 whitespace-pre-line text-xs text-text-secondary">{n.body}</span>
                  </span>
                  {!n.read_at && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}