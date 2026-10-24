import { useEffect, useState } from 'react'
import { Bell, Clock, FileText, Mail, ShieldAlert, Smartphone, TrendingUp } from 'lucide-react'
import Card from '../ui/Card'
import { useAuth } from '../../contexts/AuthContext'
import {
  DEFAULT_NOTIF_PREFS, disablePush, enablePush, getNotifPrefs, pushPermission,
  pushSupported, saveNotifPrefs,
} from '../../services/notificationService'

/* Toggle-yada shaqeynaya (dhammaan 4-ta waa live) */
const LIVE = new Set(['routine_reminder', 'trade_alerts', 'daily_report', 'prop_rules'])

const ITEMS = [
  ['trade_alerts', 'Trade alerts', 'Marka trade la furo ama la xiro', TrendingUp],
  ['daily_report', 'Daily report', 'Warbixin maalinle ah oo ku saabsan performance-kaaga', FileText],
  ['routine_reminder', 'Routine reminders', 'Xusuusin Daily Routine iyo Daily Worship', Clock],
  ['prop_rules', 'Prop firm rule warnings', 'Digniin marka aad gaarto 80% / 90% / 100% ee daily loss ama drawdown limit', ShieldAlert],
]

const LEADS = [5, 10, 15, 30]

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-brand' : 'bg-slate-300'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}

function Row({ icon: Icon, title, sub, badge, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div className="flex min-w-0 items-start gap-3">
        <Icon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-brand" />
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-text-primary">
            {title}
            {badge && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-text-muted">{badge}</span>}
          </p>
          <p className="text-xs text-text-muted">{sub}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

const smallInput =
  'h-9 rounded-lg border border-border bg-white px-2.5 text-sm text-text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20'

export default function NotificationsCard({ notify }) {
  const { user } = useAuth()
  const [prefs, setPrefs] = useState(DEFAULT_NOTIF_PREFS)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [perm, setPerm] = useState(pushPermission())

  useEffect(() => {
    if (!user) return undefined
    let alive = true
    getNotifPrefs(user.id)
      .then((p) => { if (alive) setPrefs(p) })
      .catch((e) => notify(e.message || 'Could not load notification settings. Run the notifications SQL first.', 'error'))
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const update = async (patch) => {
    const prev = prefs
    setPrefs({ ...prefs, ...patch })
    try {
      await saveNotifPrefs(user.id, patch)
    } catch (e) {
      setPrefs(prev)
      notify(e.message || 'Could not save.', 'error')
    }
  }

  const togglePush = async (on) => {
    setBusy(true)
    try {
      if (on) await enablePush(user.id)
      else await disablePush()
      setPerm(pushPermission())
      await update({ push_enabled: on })
      notify(on ? 'System notifications waa la shaqeeyay.' : 'System notifications waa la damiyay.')
    } catch (e) {
      setPerm(pushPermission())
      notify(e.message || 'Push setup failed.', 'error')
    }
    setBusy(false)
  }

  const pushOn = prefs.push_enabled && perm === 'granted'

  return (
    <Card className="max-w-3xl">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-brand"><Bell className="h-5 w-5" /></div>
        <div>
          <h3 className="text-[16px] font-semibold text-text-primary">Notifications</h3>
          <p className="text-xs text-text-muted">Dooro farriimaha aad rabto inaad hesho.</p>
        </div>
      </div>

      <p className="text-xs font-medium text-text-secondary">Maxaad rabtaa inaad ogaato?</p>
      <div className="divide-y divide-border/70">
        {ITEMS.map(([key, title, sub, Icon]) => {
          const live = LIVE.has(key)
          return (
            <div key={key}>
              <Row icon={Icon} title={title} sub={sub} badge={live ? null : 'Soon'}>
                <Toggle checked={live && !!prefs[key]} disabled={loading || !live} onChange={(v) => update({ [key]: v })} />
              </Row>

              {key === 'routine_reminder' && prefs.routine_reminder && (
                <div className="mb-4 ml-[30px] space-y-3 rounded-xl border border-border bg-surface/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[13px] font-medium text-text-primary">Daily Routine tasks</p>
                      <p className="text-xs text-text-muted">Xusuusi kahor marka task-ku bilaabanayo (haddii aan weli Done ahayn).</p>
                    </div>
                    <select
                      className={smallInput} value={prefs.reminder_lead_min}
                      onChange={(e) => update({ reminder_lead_min: Number(e.target.value) })}
                    >
                      {LEADS.map((m) => <option key={m} value={m}>{m} daqiiqo kahor</option>)}
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
                    <div>
                      <p className="text-[13px] font-medium text-text-primary">Daily Worship</p>
                      <p className="text-xs text-text-muted">Haddii wax ka harsan yihiin maanta, waxaa kuu soo gaaraya liis ka harsan.</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="time" className={smallInput} value={prefs.worship_reminder_time}
                        disabled={!prefs.worship_reminder_enabled}
                        onChange={(e) => e.target.value && update({ worship_reminder_time: e.target.value })}
                      />
                      <Toggle checked={!!prefs.worship_reminder_enabled} onChange={(v) => update({ worship_reminder_enabled: v })} />
                    </div>
                  </div>
                </div>
              )}

              {key === 'daily_report' && prefs.daily_report && (
                <div className="mb-4 ml-[30px] flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface/60 p-4">
                  <div>
                    <p className="text-[13px] font-medium text-text-primary">Waqtiga warbixinta</p>
                    <p className="text-xs text-text-muted">Trades, P/L, salaadaha iyo routine-ka maalinta.</p>
                  </div>
                  <input
                    type="time" className={smallInput} value={prefs.daily_report_time}
                    onChange={(e) => e.target.value && update({ daily_report_time: e.target.value })}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="mt-6 text-xs font-medium text-text-secondary">Sidee loo soo diraa?</p>
      <div className="divide-y divide-border/70">
        <Row icon={Bell} title="In-app (bell)" sub="Had iyo jeer waa shaqeynayaa, Topbar-ka ayaad ka arkaysaa.">
          <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">Always on</span>
        </Row>
        <Row icon={Mail} title="Email (Gmail)" sub={user?.email ? `Waxaa loo diraa ${user.email}` : 'Email-ka akoonkaaga'}>
          <Toggle checked={!!prefs.email_enabled} disabled={loading} onChange={(v) => update({ email_enabled: v })} />
        </Row>
        <Row
          icon={Smartphone} title="System notification (browser)"
          sub={
            !pushSupported() ? 'Browser-kan ma taageero (iPhone: Add to Home Screen marka hore).'
              : perm === 'denied' ? 'Waa la xiray. Ka fur Site settings > Notifications.'
              : 'Wuxuu soo baxaa xataa haddii tab-ku xiran yahay.'
          }
        >
          <Toggle checked={pushOn} disabled={loading || busy || !pushSupported() || perm === 'denied'} onChange={togglePush} />
        </Row>
      </div>

    </Card>
  )
}