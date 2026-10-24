import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  Activity, AlertCircle, BarChart3, CalendarCheck, CalendarDays, Check, CheckCircle2,
  ChevronDown, ChevronLeft, ChevronRight, Clock, Coffee, Dumbbell, Flag, Flame, GraduationCap,
  History, Link2, ListChecks, Moon, Plus, Star, Target, Timer, Trash2, TrendingUp, Video, X, Zap,
} from 'lucide-react'
import Sidebar from '../components/layout/Sidebar'
import Topbar from '../components/layout/Topbar'
import { accounts } from '../data/mockData'
import { useAuth } from '../contexts/AuthContext'
import {
  addGoal, addTask, deleteGoal, deleteTask, fetchBacktestShots, fetchGoals, fetchLearningProgress,
  fetchLearningVideos, fetchLogs, fetchTasks, seedStarter, setLog, updateGoal, updateTask,
} from '../services/routineService'
import { fetchWorshipDays } from '../services/worshipService'

/* ---------- hero image: src/assets/Routine.(png|jpg|jpeg|webp|svg) ---------- */
const routineImgs = import.meta.glob('../assets/[Rr]outine.*', { eager: true, import: 'default' })
const ROUTINE_IMG = Object.values(routineImgs)[0]

/* ---------- constants ---------- */
const ARABIC = { fontFamily: "'Amiri','Noto Naskh Arabic',serif" }
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6]
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const TRADES_PER_HOUR = 5
const btNeeded = (hours) => Math.ceil(Number(hours) * TRADES_PER_HOUR)
const CATS = {
  worship: { label: 'Worship', Icon: Moon, chip: 'bg-indigo-50 text-indigo-600', circle: 'bg-indigo-50 text-indigo-600' },
  fitness: { label: 'Fitness', Icon: Dumbbell, chip: 'bg-blue-50 text-blue-600', circle: 'bg-blue-50 text-blue-600' },
  personal: { label: 'Personal', Icon: Coffee, chip: 'bg-amber-50 text-amber-600', circle: 'bg-amber-50 text-amber-600' },
  backtesting: { label: 'Backtesting', Icon: History, chip: 'bg-violet-50 text-violet-600', circle: 'bg-violet-50 text-violet-600' },
  trading: { label: 'Trading', Icon: TrendingUp, chip: 'bg-orange-50 text-orange-500', circle: 'bg-orange-50 text-orange-500' },
  learning: { label: 'Learning', Icon: GraduationCap, chip: 'bg-sky-50 text-sky-600', circle: 'bg-sky-50 text-sky-600' },
  other: { label: 'Other', Icon: Star, chip: 'bg-slate-100 text-slate-600', circle: 'bg-slate-100 text-slate-600' },
}

/* keys match worship_days.counts (Daily Worship page) */
const WORSHIP_TASKS = [
  { key: 'fajr', target: 1 },
  { key: 'morning_adhkar', target: 1 },
  { key: 'quran', target: 1 },
  { key: 'dhuhr', target: 1 },
  { key: 'istighfar', target: 100 },
  { key: 'asr', target: 1 },
  { key: 'evening_adhkar', target: 1 },
  { key: 'maghrib', target: 1 },
  { key: 'isha', target: 1 },
  { key: 'tasbih', target: 100 },
  { key: 'alhamdulillah', target: 100 },
  { key: 'allahu_akbar', target: 100 },
  { key: 'la_ilaha', target: 100 },
]
const WTARGET = Object.fromEntries(WORSHIP_TASKS.map((w) => [w.key, w.target]))
const WORSHIP_ALL = 'all' // Done only when Daily Worship is 10/10 (everything completed)

/* ---------- helpers ---------- */
const pad = (n) => String(n).padStart(2, '0')
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d) }
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const mondayOf = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const diff = (x.getDay() + 6) % 7; return addDays(x, -diff) }
const monthDates = (y, m) => Array.from({ length: new Date(y, m + 1, 0).getDate() }, (_, i) => toKey(new Date(y, m, i + 1)))
const shortDate = (k) => fromKey(k).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
const minutesNow = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes() }
const fmt12 = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number)
  return `${pad(h % 12 === 0 ? 12 : h % 12)}:${pad(m)} ${h >= 12 ? 'PM' : 'AM'}`
}
const range12 = (t) => `${fmt12(t.start_time)} – ${fmt12(t.end_time)}`
const norm = (t) => ({
  ...t,
  category: t.category === 'prayer' ? 'worship' : t.category,
  start_time: String(t.start_time).slice(0, 5),
  end_time: String(t.end_time).slice(0, 5),
  days: t.days || [],
  only_date: t.only_date || null,
  worship_key: t.worship_key || null,
  video_id: t.video_id || null,
  video_minutes: t.video_minutes || null,
  video_baseline_seconds: t.video_baseline_seconds || 0,
  bt_hours: t.bt_hours ? Number(t.bt_hours) : null,
})
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0)
const goalPct = (g) => Math.max(0, Math.min(100, Math.round((Number(g.current_value) / Number(g.target_value || 1)) * 100)))
const isSched = (t, key) =>
  t.only_date ? t.only_date === key : key >= t.start_date && t.days.includes(fromKey(key).getDay())

/* ---------- quick add parser ---------- */
const CAT_WORDS = [
  ['backtesting', /backtest/i],
  ['worship', /\b(prayer|salah|salat|fajr|dhuhr|asr|maghrib|isha|quran|dua|adhkar|dhikr|tasbih|istighfar|worship)\b/i],
  ['fitness', /\b(gym|workout|football|run|running|exercise|walk|train|training|swim)\b/i],
  ['trading', /(trad|chart|forex|london|session|journal)/i],
  ['learning', /\b(study|learn|learning|cod(e|ing)|read|course|school|homework|class)\b/i],
  ['personal', /\b(eat|breakfast|lunch|dinner|rest|sleep|nap|shower|family|friend|friends)\b/i],
]
const to24 = (h, m, ap) => {
  let hh = h
  if (ap === 'pm' && hh < 12) hh += 12
  if (ap === 'am' && hh === 12) hh = 0
  return hh * 60 + (m || 0)
}
const hhmm = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`

function parseQuick(text, selectedDate) {
  let s = ` ${text.trim()} `
  if (!text.trim()) return null
  const daily = /\b(daily|every ?day)\b/i.test(s)
  const tomorrow = /\btomorrow\b/i.test(s)
  s = s.replace(/\b(daily|every ?day|tomorrow)\b/gi, ' ')

  let start = null
  let end = null
  const range = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i)
  if (range && (range[3] || range[6] || range[2])) {
    const ap2 = (range[6] || '').toLowerCase()
    const ap1 = (range[3] || ap2).toLowerCase()
    let a = to24(Number(range[1]), Number(range[2] || 0), ap1)
    const b = to24(Number(range[4]), Number(range[5] || 0), ap2 || ap1)
    if (a >= b && !range[3] && a >= 12 * 60) a -= 12 * 60
    if (a < b) { start = a; end = b; s = s.replace(range[0], ' ') }
  }
  if (start === null) {
    const one = s.match(/(?:\bat\b|@)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
    if (one) {
      start = to24(Number(one[1]), Number(one[2] || 0), one[3].toLowerCase())
      end = Math.min(start + 60, 23 * 60 + 59)
      s = s.replace(one[0], ' ')
    }
  }
  const title = s.replace(/\b(at|from)\b/gi, ' ').replace(/\s+/g, ' ').trim()
  if (!title) return null
  const found = CAT_WORDS.find(([, re]) => re.test(title))
  const dateKey = tomorrow ? toKey(addDays(new Date(), 1)) : selectedDate
  return {
    title: title.charAt(0).toUpperCase() + title.slice(1),
    category: found ? found[0] : 'other',
    start: start === null ? null : hhmm(start),
    end: end === null ? null : hhmm(end),
    daily,
    dateKey,
  }
}

/* ---------- small ui ---------- */
function Card({ className = '', children, ...rest }) {
  return (
    <div className={`rounded-2xl border border-[#e8ecf3] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className}`} {...rest}>
      {children}
    </div>
  )
}

function Ring({ percent, size = 84, stroke = 9, children, gid = 'routineRing' }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#0d9488" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#e3f3ee" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={`url(#${gid})`} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(percent, 100) / 100)} className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  )
}

function CardTitle({ Icon, title, sub, right }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <Icon className="h-5 w-5 text-slate-800" strokeWidth={1.8} />
        <div>
          <h3 className="text-[16px] font-bold leading-tight text-slate-900">{title}</h3>
          {sub && <p className="mt-0.5 text-[11.5px] text-slate-500">{sub}</p>}
        </div>
      </div>
      {right}
    </div>
  )
}

function ChartTip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-lg bg-white px-3 py-1.5 text-[11px] shadow-lg ring-1 ring-slate-100">
      <p className="font-semibold text-slate-800">{p.label}</p>
      <p className="text-slate-500">{p.pct == null ? 'No data yet' : `${p.pct}% completed`}</p>
    </div>
  )
}

function StateIcon({ state }) {
  if (state === 'done') return <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-3 w-3" strokeWidth={3} /></span>
  if (state === 'overdue') return <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white"><X className="h-3 w-3" strokeWidth={3} /></span>
  return <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-amber-600"><Clock className="h-3 w-3" /></span>
}

/* ---------- modals ---------- */
function MonthModal({ label, total, byTask, byDay, onClose }) {
  const [tab, setTab] = useState('task')
  const [open, setOpen] = useState(null)
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-[16px] font-bold text-slate-900">Monthly Details · {label}</h3>
            <p className="text-xs text-slate-500">{total} total = every time a task appears on a day (a daily task counts once per day).</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex gap-1.5 px-5 pt-3">
          {[['task', 'By task'], ['day', 'By day']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`rounded-full px-4 py-1.5 text-[12.5px] font-medium ${tab === k ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{l}</button>
          ))}
        </div>
        <div className="overflow-y-auto px-5 py-3">
          {tab === 'task' ? (
            byTask.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">No tasks this month.</p> : (
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th className="py-2 font-medium">Task</th>
                    <th className="text-center font-medium">Times</th>
                    <th className="text-center font-medium">Done</th>
                    <th className="text-center font-medium">Pending</th>
                    <th className="text-center font-medium">Overdue</th>
                    <th className="text-right font-medium">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {byTask.map((r) => (
                    <tr key={r.t.id} className="border-t border-slate-100">
                      <td className="py-2 pr-2">
                        <p className="font-semibold text-slate-900">{r.t.title}</p>
                        <p className="text-[10.5px] text-slate-500">{range12(r.t)}{r.t.only_date ? ' · one-time' : ''}</p>
                      </td>
                      <td className="text-center font-medium text-slate-700">{r.sched}</td>
                      <td className="text-center font-medium text-emerald-600">{r.done}</td>
                      <td className="text-center font-medium text-amber-600">{r.pending}</td>
                      <td className="text-center font-medium text-rose-600">{r.overdue}</td>
                      <td className="text-right font-semibold text-slate-800">{pct(r.done, r.sched)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : (
            byDay.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">No tasks this month.</p> : (
              <div className="space-y-1.5">
                {byDay.map((d) => {
                  const done = d.items.filter((i) => i.state === 'done').length
                  const isOpen = open === d.k
                  return (
                    <div key={d.k} className="rounded-xl border border-slate-100">
                      <button onClick={() => setOpen(isOpen ? null : d.k)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left">
                        <span className="w-28 text-[12.5px] font-semibold text-slate-900">{fromKey(d.k).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                        <div className="h-1.5 flex-1 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-emerald-500" style={{ width: `${pct(done, d.items.length)}%` }} /></div>
                        <span className="w-12 text-right text-[12px] text-slate-600">{done}/{d.items.length}</span>
                        <ChevronDown className={`h-4 w-4 text-slate-400 transition ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isOpen && (
                        <ul className="space-y-1.5 border-t border-slate-100 px-3 py-2.5">
                          {d.items.map((i) => (
                            <li key={i.t.id} className="flex items-center gap-2.5 text-[12px]">
                              <StateIcon state={i.state} />
                              <span className="flex-1 text-slate-800">{i.t.title}</span>
                              <span className="text-slate-500">{range12(i.t)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}

function TaskModal({ initial, defaultDate, videos, onSave, onDelete, onClose }) {
  const [f, setF] = useState({
    ...initial,
    mode: initial.only_date ? 'once' : 'repeat',
    date: initial.only_date || defaultDate,
    worship_key: initial.worship_key || '',
    video_id: initial.video_id || '',
    video_minutes: initial.video_minutes || 30,
    bt_hours: initial.bt_hours || 1,
  })
  const [err, setErr] = useState('')
  const hasVideo = f.category === 'learning' && !!f.video_id
  const once = f.mode === 'once' || hasVideo
  const showWorship = f.category === 'worship'
  const showVideo = f.category === 'learning'
  const showBacktest = f.category === 'backtesting'
  const toggleDay = (d) => setF((p) => ({ ...p, days: p.days.includes(d) ? p.days.filter((x) => x !== d) : [...p.days, d] }))
  const changeCategory = (category) =>
    setF((p) => ({
      ...p,
      category,
      title: category === 'worship' && !p.title.trim() ? 'Daily Worship' : p.title,
      worship_key: category === 'worship' ? WORSHIP_ALL : '',
      video_id: category === 'learning' ? p.video_id : '',
      bt_hours: category === 'backtesting' ? (p.bt_hours || 1) : null,
    }))
  const pickVideo = (id) => {
    const v = videos.find((x) => x.id === id)
    setF((p) => ({ ...p, video_id: id, title: id && v && !p.title.trim() ? `Watch: ${v.title}` : p.title }))
  }
  const submit = () => {
    if (!f.title.trim()) return setErr('Write a task name.')
    if (f.end_time <= f.start_time) return setErr('End time must be after start time.')
    if (once && !f.date) return setErr('Pick a date.')
    if (!once && !f.days.length) return setErr('Pick at least one day.')
    if (hasVideo && !(Number(f.video_minutes) > 0)) return setErr('Write how many minutes to watch.')
    if (showBacktest && !(Number(f.bt_hours) > 0)) return setErr('Write how many hours.')
    onSave({
      ...f,
      title: f.title.trim(),
      only_date: once ? f.date : null,
      days: once ? ALL_DAYS : f.days,
      is_habit: once ? false : f.is_habit,
      worship_key: showWorship ? WORSHIP_ALL : null,
      video_id: hasVideo ? f.video_id : null,
      video_minutes: hasVideo ? Number(f.video_minutes) : null,
      bt_hours: showBacktest ? Number(f.bt_hours) : null,
    })
  }
  const input = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-[16px] font-bold text-slate-900">{f.id ? 'Edit Task' : 'Add Task'}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3.5 px-5 py-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Task name</label>
            <input className={input} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Gym Workout" autoFocus />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Category</label>
              <select className={input} value={f.category} onChange={(e) => changeCategory(e.target.value)}>
                {Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Start</label>
              <input type="time" className={input} value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">End</label>
              <input type="time" className={input} value={f.end_time} onChange={(e) => setF({ ...f, end_time: e.target.value })} />
            </div>
          </div>

          {showVideo && (
            <div className="space-y-2 rounded-xl border border-sky-100 bg-sky-50/50 p-3">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700"><Video className="h-3.5 w-3.5 text-sky-600" /> Video from Learning Hub (auto Done)</label>
              <select className={input} value={f.video_id} onChange={(e) => pickVideo(e.target.value)}>
                <option value="">None (tick it manually)</option>
                {videos.map((v) => <option key={v.id} value={v.id}>{v.title}</option>)}
              </select>
              {f.video_id && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Minutes to watch</label>
                  <input type="number" min="1" className={input} value={f.video_minutes} onChange={(e) => setF({ ...f, video_minutes: e.target.value })} />
                  <p className="mt-1 text-[11px] text-slate-500">Done automatically when you watch this many minutes in Learning Hub after creating the task. It is a one-day task.</p>
                </div>
              )}
              {videos.length === 0 && <p className="text-[11px] text-slate-500">No videos yet. Add one in Learning Hub first.</p>}
            </div>
          )}

          {showBacktest && (
            <div className="space-y-2 rounded-xl border border-violet-100 bg-violet-50/50 p-3">
              <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700"><History className="h-3.5 w-3.5 text-violet-600" /> Hours of backtesting (auto Done)</label>
              <input type="number" min="0.5" step="0.5" className={input} value={f.bt_hours} onChange={(e) => setF({ ...f, bt_hours: e.target.value })} />
              <p className="text-[11px] text-slate-500">
                Target: <b>{btNeeded(f.bt_hours || 0)} trades</b> ({TRADES_PER_HOUR} per hour). Done automatically when you log that many backtest trades in Backtesting that day.
              </p>
            </div>
          )}

          {!hasVideo && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">When</label>
              <div className="flex gap-1.5">
                {[['repeat', 'Repeat on days'], ['once', 'Only on a date']].map(([k, l]) => (
                  <button
                    key={k} type="button" onClick={() => setF({ ...f, mode: k })}
                    className={`flex-1 rounded-lg border py-1.5 text-xs font-medium ${f.mode === k ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500'}`}
                  >{l}</button>
                ))}
              </div>
            </div>
          )}

          {once ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Date</label>
              <input type="date" className={input} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
            </div>
          ) : (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-600">Days</label>
              <div className="flex gap-1.5">
                {WEEK_ORDER.map((d) => (
                  <button
                    key={d} type="button" onClick={() => toggleDay(d)}
                    className={`flex-1 rounded-lg border py-1.5 text-xs font-medium ${f.days.includes(d) ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 text-slate-500'}`}
                  >{DOW[d]}</button>
                ))}
              </div>
            </div>
          )}

          {showWorship && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700"><Link2 className="h-3.5 w-3.5 text-indigo-600" /> Auto from Daily Worship</p>
              <p className="mt-1 text-[11px] text-slate-500">This task becomes Done automatically when your Daily Worship score reaches 10/10. You cannot tick it by hand.</p>
            </div>
          )}

          <div className="flex gap-5 text-sm text-slate-700">
            {!once && (
              <label className="flex items-center gap-2"><input type="checkbox" checked={f.is_habit} onChange={(e) => setF({ ...f, is_habit: e.target.checked })} /> Habit (Habit Tracker)</label>
            )}
            <label className="flex items-center gap-2"><input type="checkbox" checked={f.is_priority} onChange={(e) => setF({ ...f, is_priority: e.target.checked })} /> Priority</label>
          </div>
          {err && <p className="text-xs text-rose-600">{err}</p>}
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
          {f.id ? (
            <button onClick={() => onDelete(f)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium text-rose-600 hover:bg-rose-50">
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={submit} className="rounded-lg bg-blue-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-blue-700">Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function GoalModal({ initial, weekLabel, videos = [], onSave, onDelete, onClose }) {
  const [f, setF] = useState(initial)
  const [err, setErr] = useState('')
  const isWeek = f.kind === 'week'
  const submit = () => {
    if (!f.title.trim()) return setErr('Write a goal name.')
    if (!(Number(f.target_value) > 0)) return setErr('Target must be more than 0.')
    if (isWeek && f.link_type === 'learning' && !f.link_video_id) return setErr('Choose a video to track.')
    onSave({
      ...f, title: f.title.trim(), subtitle: f.subtitle?.trim() || null,
      plan: isWeek ? (f.plan?.trim() || null) : null,
      link_type: isWeek ? (f.link_type || null) : null,
      current_value: Number(f.current_value) || 0, target_value: Number(f.target_value),
    })
  }
  const input = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500'
  const p = goalPct({ current_value: f.current_value, target_value: f.target_value })
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-[16px] font-bold text-slate-900">{f.id ? (isWeek ? 'Weekly Goal' : 'Edit Goal') : (isWeek ? 'Add Weekly Goal' : 'Add Goal')}</h3>
            {isWeek && <p className="text-xs text-slate-500">Week: {weekLabel}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3.5 px-5 py-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Goal name</label>
            <input className={input} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Note (optional)</label>
            <input className={input} value={f.subtitle || ''} onChange={(e) => setF({ ...f, subtitle: e.target.value })} placeholder="e.g. Trading, Deen, Health" />
          </div>
          {isWeek && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">My plan for this goal</label>
              <textarea
                rows={4} className={input} value={f.plan || ''}
                onChange={(e) => setF({ ...f, plan: e.target.value })}
                placeholder="How will you reach it this week? Write the steps..."
              />
            </div>
          )}
          {isWeek && (
            <div className="space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
              <label className="block text-xs font-medium text-slate-700">Track automatically</label>
              <select className={input} value={f.link_type || ''} onChange={(e) => setF({ ...f, link_type: e.target.value, unit: e.target.value === 'backtest' ? 'trades' : e.target.value === 'learning' ? 'min' : f.unit })}>
                <option value="">Manual (I update it)</option>
                <option value="backtest">Backtesting trades (this week)</option>
                <option value="learning">Learning video (minutes watched)</option>
              </select>
              {f.link_type === 'learning' && (
                <select className={input} value={f.link_video_id || ''} onChange={(e) => setF({ ...f, link_video_id: e.target.value })}>
                  <option value="">Choose a video</option>
                  {videos.map((v) => <option key={v.id} value={v.id}>{v.title}</option>)}
                </select>
              )}
              {f.link_type && <p className="text-[11px] text-slate-500">Target = {f.link_type === 'backtest' ? 'trades' : 'minutes'} for the week. "Current" updates by itself.</p>}
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Current</label>
              <input type="number" className={`${input} ${isWeek && f.link_type ? 'bg-slate-50 text-slate-400' : ''}`} disabled={isWeek && !!f.link_type} value={f.current_value} onChange={(e) => setF({ ...f, current_value: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Target</label>
              <input type="number" className={input} value={f.target_value} onChange={(e) => setF({ ...f, target_value: e.target.value })} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Unit</label>
              <input className={input} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} placeholder="pages, kg, %" />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500"><span>Progress</span><span>{p}%</span></div>
            <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-blue-600 transition-all" style={{ width: `${p}%` }} /></div>
          </div>
          {err && <p className="text-xs text-rose-600">{err}</p>}
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
          {f.id ? (
            <button onClick={() => onDelete(f)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium text-rose-600 hover:bg-rose-50">
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
            <button onClick={submit} className="rounded-lg bg-blue-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-blue-700">Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- page ---------- */
export default function DailyRoutine() {
  const { user } = useAuth()
  const todayKey = useMemo(() => toKey(new Date()), [])

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState(accounts[0])

  const [tasks, setTasks] = useState([])
  const [logs, setLogs] = useState({})
  const [worship, setWorship] = useState({})
  const [videos, setVideos] = useState([])
  const [vprog, setVprog] = useState({})
  const [shots, setShots] = useState({}) // backtest trades logged per day
  const [goals, setGoals] = useState([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [seeding, setSeeding] = useState(false)

  const [selectedDate, setSelectedDate] = useState(todayKey)
  const [viewMonth, setViewMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1) })
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()))
  const [filter, setFilter] = useState('all')
  const [nowMin, setNowMin] = useState(minutesNow())
  const [taskModal, setTaskModal] = useState(null)
  const [goalModal, setGoalModal] = useState(null)
  const [monthModal, setMonthModal] = useState(false)
  const [showAllGoals, setShowAllGoals] = useState(false)
  const [quick, setQuick] = useState('')
  const [quickOpen, setQuickOpen] = useState(false)

  const vy = viewMonth.getFullYear()
  const vm = viewMonth.getMonth()

  useEffect(() => {
    const id = setInterval(() => setNowMin(minutesNow()), 60000)
    return () => clearInterval(id)
  }, [])

  /* ----- load tasks and goals ----- */
  const loadStatic = useCallback(async () => {
    const [t, g] = await Promise.all([fetchTasks(user.id), fetchGoals(user.id)])
    setTasks(t.map(norm))
    setGoals(g)
    setLoaded(true)
  }, [user])

  useEffect(() => {
    if (!user) return
    loadStatic().catch((e) => {
      console.error(e)
      setError('Could not load routine. Run the routine SQL in Supabase (tables, columns and policies).')
      setLoaded(true)
    })
  }, [user, loadStatic])

  /* ----- Learning Hub videos + watch progress + backtest trades (refresh on tab focus) ----- */
  const loadLearning = useCallback(async () => {
    try {
      const [v, p] = await Promise.all([fetchLearningVideos(user.id), fetchLearningProgress(user.id)])
      setVideos(v)
      setVprog(Object.fromEntries(p.map((r) => [r.video_id, Number(r.watched_seconds) || 0])))
      try {
        setShots(await fetchBacktestShots(user.id, toKey(addDays(new Date(), -120))))
      } catch (e) {
        console.error('Backtest trades:', e)
      }
    } catch (e) {
      console.error(e)
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    loadLearning()
    const onFocus = () => loadLearning()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [user, loadLearning])

  /* ----- load logs and worship days ----- */
  const loadDays = useCallback(() => {
    if (!user) return () => {}
    let off = false
    const ms = new Date(vy, vm, 1)
    const me = new Date(vy, vm + 1, 0)
    const a = toKey(addDays(new Date(), -120))
    const b = toKey(addDays(ms, -7))
    const from = a < b ? a : b
    const c = toKey(addDays(me, 7))
    const d = toKey(addDays(new Date(), 7))
    const to = c > d ? c : d
    Promise.all([fetchLogs(user.id, from, to), fetchWorshipDays(user.id, from, to).catch(() => [])])
      .then(([rows, wrows]) => {
        if (off) return
        const m = {}
        rows.forEach((r) => { m[`${r.task_id}|${r.log_date}`] = r.status })
        setLogs((p) => ({ ...p, ...m }))
        const w = {}
        wrows.forEach((r) => { w[r.log_date] = r.counts || {} })
        setWorship((p) => ({ ...p, ...w }))
      })
      .catch((e) => { console.error(e); setError('Could not load routine logs.') })
    return () => { off = true }
  }, [user, vy, vm])

  useEffect(() => {
    const cleanup = loadDays()
    const onFocus = () => loadDays()
    window.addEventListener('focus', onFocus)
    return () => { cleanup && cleanup(); window.removeEventListener('focus', onFocus) }
  }, [loadDays])

  /* ----- derived helpers ----- */
  const scheduledOn = (key) => tasks.filter((t) => isSched(t, key))
  const watchedMin = (t) => Math.max(0, Math.floor(((vprog[t.video_id] || 0) - (t.video_baseline_seconds || 0)) / 60))
  const statusOf = (t, key) => {
    if (t.worship_key) {
      const c = worship[key]
      if (!c) return null
      if (t.worship_key === WORSHIP_ALL) {
        return WORSHIP_TASKS.every((w) => (c[w.key] || 0) >= w.target) ? 'done' : null
      }
      return (c[t.worship_key] || 0) >= (WTARGET[t.worship_key] || 1) ? 'done' : null
    }
    if (t.video_id) {
      return watchedMin(t) >= (t.video_minutes || 1) ? 'done' : null
    }
    if (t.bt_hours) {
      return (shots[key] || 0) >= btNeeded(t.bt_hours) ? 'done' : null
    }
    return logs[`${t.id}|${key}`] || null
  }
  const isAuto = (t) => !!t.worship_key || !!t.video_id || !!t.bt_hours
  const taskState = (t, key) => {
    const s = statusOf(t, key)
    if (s === 'done') return 'done'
    if (s === 'missed') return 'overdue'
    if (key < todayKey) return 'overdue'
    if (key === todayKey && toMin(t.end_time) < nowMin) return 'overdue'
    return 'pending'
  }
  const dayStats = (key) => {
    const list = scheduledOn(key)
    let done = 0
    let partial = 0
    list.forEach((t) => {
      const s = statusOf(t, key)
      if (s === 'done') done++
      else if (s === 'partial') partial++
    })
    return { total: list.length, done, partial }
  }
  const isFull = (key) => { const s = dayStats(key); return s.total > 0 && s.done === s.total }
  const dayState = (key) => {
    const s = dayStats(key)
    if (s.total === 0) return 'none'
    if (key > todayKey) return 'planned'
    if (s.done === s.total) return 'full'
    if (s.done + s.partial > 0) return 'partial'
    return key < todayKey ? 'missed' : 'none'
  }
  const bucket = (dates) => {
    let total = 0, done = 0, overdue = 0, pending = 0
    dates.forEach((k) => {
      scheduledOn(k).forEach((t) => {
        total++
        const s = taskState(t, k)
        if (s === 'done') done++
        else if (s === 'overdue') overdue++
        else pending++
      })
    })
    return { total, done, overdue, pending }
  }

  /* ----- write logs (optimistic) ----- */
  const setStatus = async (task, key, status) => {
    if (!user || isAuto(task)) return
    const k = `${task.id}|${key}`
    const prev = logs[k]
    setLogs((p) => { const n = { ...p }; if (status) n[k] = status; else delete n[k]; return n })
    try {
      await setLog(user.id, task.id, key, status)
      setError('')
    } catch (e) {
      console.error(e)
      setError('Could not save. Check your connection and Supabase policies.')
      setLogs((p) => { const n = { ...p }; if (prev) n[k] = prev; else delete n[k]; return n })
    }
  }
  const toggleDone = (task, key) => setStatus(task, key, statusOf(task, key) === 'done' ? null : 'done')
  const cycleHabit = (task, key) => {
    const order = [null, 'done', 'partial', 'missed']
    const next = order[(order.indexOf(statusOf(task, key)) + 1) % order.length]
    setStatus(task, key, next)
  }

  /* ----- tasks CRUD ----- */
  const newTask = (over = {}) => ({
    title: '', category: 'other', start_time: '09:00', end_time: '09:30',
    days: ALL_DAYS, is_habit: false, is_priority: false, worship_key: null,
    video_id: null, video_minutes: null, bt_hours: null,
    only_date: selectedDate > todayKey ? selectedDate : null,
    ...over,
  })
  const saveTask = async (f) => {
    try {
      const orig = f.id ? tasks.find((t) => t.id === f.id) : null
      const videoId = f.video_id || null
      const baseline = videoId
        ? (orig && orig.video_id === videoId ? (orig.video_baseline_seconds || 0) : (vprog[videoId] || 0))
        : 0
      const patch = {
        title: f.title, category: f.category, start_time: f.start_time, end_time: f.end_time,
        days: f.days, is_habit: f.is_habit, is_priority: f.is_priority, only_date: f.only_date,
        worship_key: f.category === 'worship' ? WORSHIP_ALL : null,
        video_id: videoId,
        video_minutes: videoId ? Number(f.video_minutes) || 30 : null,
        video_baseline_seconds: baseline,
        bt_hours: f.category === 'backtesting' ? Number(f.bt_hours) || 1 : null,
      }
      if (f.id) {
        await updateTask(f.id, patch)
        setTasks((p) => p.map((t) => (t.id === f.id ? { ...t, ...patch } : t)))
      } else {
        const row = await addTask(user.id, {
          ...patch,
          start_date: f.only_date || todayKey,
          sort_order: tasks.length,
        })
        setTasks((p) => [...p, norm(row)])
      }
      if (f.only_date) {
        const d = fromKey(f.only_date)
        setSelectedDate(f.only_date)
        setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1))
        setWeekStart(mondayOf(d))
      }
      setTaskModal(null)
      setError('')
    } catch (e) {
      console.error(e)
      setError('Could not save the task. Did you run the new SQL (bt_hours, video_id, video_minutes, video_baseline_seconds)?')
    }
  }
  const removeTask = async (f) => {
    if (!window.confirm(`Delete "${f.title}"? Its history will be deleted too.`)) return
    try {
      await deleteTask(f.id)
      setTasks((p) => p.filter((t) => t.id !== f.id))
      setTaskModal(null)
    } catch (e) {
      console.error(e)
      setError('Could not delete the task.')
    }
  }

  /* ----- quick add (search + recent) ----- */
  const parsed = useMemo(() => parseQuick(quick, selectedDate), [quick, selectedDate])
  const submitQuick = async () => {
    if (!parsed) return
    setQuickOpen(false)
    if (!parsed.start) {
      setTaskModal(newTask({
        title: parsed.title, category: parsed.category,
        only_date: parsed.daily ? null : parsed.dateKey,
      }))
      setQuick('')
      return
    }
    await saveTask({
      title: parsed.title, category: parsed.category,
      start_time: parsed.start, end_time: parsed.end,
      days: ALL_DAYS, is_habit: false, is_priority: false, worship_key: null,
      only_date: parsed.daily ? null : parsed.dateKey,
    })
    setQuick('')
  }

  const recentList = useMemo(() => {
    const seen = new Set()
    const onSel = new Set(tasks.filter((t) => isSched(t, selectedDate)).map((t) => t.title.toLowerCase()))
    const q = quick.trim().toLowerCase()
    return [...tasks]
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
      .filter((t) => {
        const k = `${t.title.toLowerCase()}|${t.start_time}|${t.end_time}`
        if (seen.has(k) || onSel.has(t.title.toLowerCase())) return false
        if (q && !t.title.toLowerCase().includes(q)) return false
        seen.add(k)
        return true
      })
      .slice(0, 8)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, selectedDate, quick])

  const addRecent = async (t) => {
    setQuickOpen(false)
    setQuick('')
    await saveTask({
      title: t.title, category: t.category, start_time: t.start_time, end_time: t.end_time,
      days: ALL_DAYS, is_habit: false, is_priority: t.is_priority,
      worship_key: t.worship_key || null,
      video_id: t.video_id || null, video_minutes: t.video_minutes || null,
      bt_hours: t.bt_hours || null,
      only_date: selectedDate,
    })
  }

  /* ----- one "Daily Worship" task (auto Done at 10/10) ----- */
  const hasDailyWorship = tasks.some((t) => t.worship_key === WORSHIP_ALL)
  const addDailyWorship = async () => {
    try {
      const row = await addTask(user.id, {
        title: 'Daily Worship', category: 'worship', start_time: '21:00', end_time: '22:00',
        days: ALL_DAYS, is_habit: true, is_priority: true, only_date: null,
        worship_key: WORSHIP_ALL, video_id: null, video_minutes: null, video_baseline_seconds: 0,
        start_date: todayKey, sort_order: tasks.length,
      })
      setTasks((p) => [...p, norm(row)])
      setError('')
    } catch (e) {
      console.error(e)
      setError('Could not add the Daily Worship task.')
    }
  }

  /* ----- goals CRUD ----- */
  const weekKey = toKey(weekStart)

  const goalCur = (g) => {
    if (g.link_type === 'backtest') {
      return Array.from({ length: 7 }, (_, i) => shots[toKey(addDays(fromKey(g.week_start), i))] || 0).reduce((a, b) => a + b, 0)
    }
    if (g.link_type === 'learning' && g.link_video_id) {
      return Math.max(0, Math.floor(((vprog[g.link_video_id] || 0) - (g.link_baseline_seconds || 0)) / 60))
    }
    return Number(g.current_value) || 0
  }
  const goalView = (g) => ({ ...g, current_value: goalCur(g) })

  const saveGoal = async (f) => {
    try {
      const prevGoal = f.id ? goals.find((x) => x.id === f.id) : null
      const patch = {
        title: f.title, subtitle: f.subtitle, kind: f.kind, plan: f.plan,
        current_value: f.current_value, target_value: f.target_value, unit: f.unit || '',
        week_start: f.kind === 'week' ? (f.week_start || weekKey) : null,
        link_type: f.kind === 'week' ? (f.link_type || null) : null,
        link_video_id: f.kind === 'week' && f.link_type === 'learning' ? (f.link_video_id || null) : null,
        link_baseline_seconds:
          f.kind === 'week' && f.link_type === 'learning' && f.link_video_id
            ? (prevGoal && f.link_video_id === prevGoal.link_video_id
                ? (f.link_baseline_seconds || 0)
                : (vprog[f.link_video_id] || 0))
            : 0,
      }
      if (f.id) {
        await updateGoal(f.id, patch)
        setGoals((p) => p.map((g) => (g.id === f.id ? { ...g, ...patch } : g)))
      } else {
        const row = await addGoal(user.id, { ...patch, sort_order: goals.length })
        setGoals((p) => [...p, row])
      }
      setGoalModal(null)
      setError('')
    } catch (e) {
      console.error(e)
      setError('Could not save the goal. Did you run the new SQL (week_start, plan, link_type, link_video_id)?')
    }
  }
  const removeGoal = async (f) => {
    if (!window.confirm(`Delete "${f.title}"?`)) return
    try {
      await deleteGoal(f.id)
      setGoals((p) => p.filter((g) => g.id !== f.id))
      setGoalModal(null)
    } catch (e) {
      console.error(e)
      setError('Could not delete the goal.')
    }
  }

  /* ----- starter ----- */
  const loadStarter = async () => {
    setSeeding(true)
    try {
      await seedStarter(user.id, todayKey, toKey(mondayOf(new Date())))
      await loadStatic()
    } catch (e) {
      console.error(e)
      setError('Could not load the starter routine.')
    }
    setSeeding(false)
  }

  /* ----- computed values ----- */
  const isToday = selectedDate === todayKey
  const isFuture = selectedDate > todayKey
  const selList = scheduledOn(selectedDate).sort((a, b) => a.start_time.localeCompare(b.start_time))
  const selBucket = bucket([selectedDate])
  const selPercent = pct(selBucket.done, selBucket.total)

  const filtered = selList.filter((t) => {
    if (filter === 'priority') return t.is_priority
    if (filter === 'habits') return t.is_habit
    if (filter === 'other') return !t.is_priority && !t.is_habit
    return true
  })
  const counts = {
    all: selList.length,
    priority: selList.filter((t) => t.is_priority).length,
    habits: selList.filter((t) => t.is_habit).length,
    other: selList.filter((t) => !t.is_priority && !t.is_habit).length,
  }

  const streak = (() => {
    let n = 0
    let d = fromKey(todayKey)
    if (!isFull(todayKey)) d = addDays(d, -1)
    for (let i = 0; i < 120; i++) {
      const k = toKey(d)
      if (scheduledOn(k).length === 0) { d = addDays(d, -1); continue }
      if (!isFull(k)) break
      n++
      d = addDays(d, -1)
    }
    return n
  })()

  const realWeek = Array.from({ length: 7 }, (_, i) => toKey(addDays(mondayOf(new Date()), i)))
  const weekFull = realWeek.filter(isFull).length
  const now = new Date()
  const curMonthToToday = monthDates(now.getFullYear(), now.getMonth()).filter((k) => k <= todayKey)
  const curMonthB = bucket(curMonthToToday)
  const heroMonthPct = pct(curMonthB.done, curMonthB.total)

  const mDates = monthDates(vy, vm)
  const monthB = bucket(mDates)
  const monthPct = pct(monthB.done, monthB.total)
  const monthLabel = viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const monthByTask = tasks
    .map((t) => {
      let sched = 0, done = 0, overdue = 0, pending = 0
      mDates.forEach((k) => {
        if (!isSched(t, k)) return
        sched++
        const s = taskState(t, k)
        if (s === 'done') done++
        else if (s === 'overdue') overdue++
        else pending++
      })
      return { t, sched, done, overdue, pending }
    })
    .filter((r) => r.sched > 0)
    .sort((a, b) => a.t.start_time.localeCompare(b.t.start_time))
  const monthByDay = mDates
    .map((k) => ({
      k,
      items: scheduledOn(k)
        .sort((a, b) => a.start_time.localeCompare(b.start_time))
        .map((t) => ({ t, state: taskState(t, k) })),
    }))
    .filter((d) => d.items.length > 0)

  const weekDates = Array.from({ length: 7 }, (_, i) => toKey(addDays(weekStart, i)))
  const weekLabel = `${shortDate(weekDates[0])} – ${shortDate(weekDates[6])}`
  const weekChart = weekDates.map((k) => {
    const s = dayStats(k)
    return { label: fromKey(k).toLocaleDateString('en-US', { weekday: 'short' }), pct: k > todayKey || s.total === 0 ? null : pct(s.done, s.total) }
  })

  const consistency = (() => {
    const chunks = [[1, 7], [8, 14], [15, 21], [22, mDates.length]]
    return chunks.map(([a, b], i) => {
      const dates = mDates.slice(a - 1, b).filter((k) => k <= todayKey)
      const bb = bucket(dates)
      return { label: `W${i + 1}`, pct: pct(bb.done, bb.total) }
    })
  })()

  const cells = (() => {
    const first = new Date(vy, vm, 1)
    const start = addDays(first, -first.getDay())
    return Array.from({ length: 42 }, (_, i) => {
      const d = addDays(start, i)
      return { key: toKey(d), day: d.getDate(), inMonth: d.getMonth() === vm }
    })
  })()
  const dotColor = { full: 'bg-emerald-500', partial: 'bg-amber-400', missed: 'bg-rose-500', planned: 'bg-blue-300', none: 'bg-transparent' }

  const habits = tasks.filter((t) => t.is_habit && !t.only_date)

  const nextTask = tasks
    .filter((t) => isSched(t, todayKey) && statusOf(t, todayKey) !== 'done' && toMin(t.end_time) >= nowMin)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))[0]

  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening'
  const name = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Trader'
  const cheer = isFuture
    ? 'Plan ahead: add tasks for this day.'
    : selBucket.total > 0 && selBucket.done === selBucket.total
      ? 'MashaAllah! All tasks done.'
      : selPercent >= 60 ? 'Great job! Keep going.' : 'Start small, stay consistent.'

  const changeWeek = (delta) => {
    const w = addDays(weekStart, delta * 7)
    setWeekStart(w)
    setViewMonth(new Date(w.getFullYear(), w.getMonth(), 1))
  }

  const regularGoals = goals.filter((g) => g.kind === 'goal')
  const weekGoals = goals.filter((g) => g.kind === 'week' && g.week_start === weekKey)
  const shownGoals = showAllGoals ? regularGoals : regularGoals.slice(0, 4)

  if (!user) return null

  return (
    <div className="flex min-h-screen bg-[#f6f8fc] text-slate-900">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onMenuClick={() => setSidebarOpen(true)}
          accounts={accounts}
          selectedAccount={selectedAccount}
          onSelectAccount={setSelectedAccount}
          breadcrumb="Lifestyle / Daily Routine"
        />

        <main className="mx-auto w-full max-w-[1500px] flex-1 space-y-4 p-4 sm:p-6">
          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</div>}

          {loaded && tasks.length === 0 && !error && (
            <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="text-[14px] font-semibold text-slate-900">Your routine is empty</p>
                <p className="text-xs text-slate-500">Load the starter routine (prayers, habits, gym, trading, study) and edit it as you like, or add tasks yourself.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setTaskModal(newTask())} className="rounded-lg border border-slate-200 px-4 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50">Add my own</button>
                <button onClick={loadStarter} disabled={seeding} className="rounded-lg bg-blue-600 px-4 py-2 text-[13px] font-medium text-white hover:bg-blue-700 disabled:opacity-60">
                  {seeding ? 'Loading...' : 'Load starter routine'}
                </button>
              </div>
            </Card>
          )}

          {/* HERO */}
          <div
            className="relative overflow-hidden rounded-2xl border border-[#e3e9f5] px-6 py-6 md:h-[260px] md:pr-[190px]"
            style={{ background: 'linear-gradient(90deg,#f6f8ff 0%,#e9f0ff 55%,#eef2fb 100%)' }}
          >
            {ROUTINE_IMG ? (
              <div className="absolute bottom-4 right-4 top-4 hidden overflow-hidden rounded-xl shadow-lg ring-1 ring-black/5 md:block">
                <img src={ROUTINE_IMG} alt="Eat, Study, Workout, Sleep, Repeat" className="block h-full w-auto object-contain" />
              </div>
            ) : (
              <svg viewBox="0 0 560 150" className="pointer-events-none absolute bottom-0 right-0 hidden h-full opacity-40 md:block" preserveAspectRatio="xMaxYMax meet">
                <g fill="#64748b">
                  <rect x="60" y="34" width="10" height="116" /><polygon points="58,34 72,34 65,8" />
                  <path d="M190 150 V104 A58 58 0 0 1 306 104 V150 Z" /><rect x="247" y="30" width="2" height="16" />
                  <path d="M316 150 V118 A34 34 0 0 1 384 118 V150 Z" />
                </g>
              </svg>
            )}

            <div className="relative flex h-full flex-wrap items-center justify-between gap-6">
              <div>
                <span className="inline-block rounded-lg bg-[#2f4fbf] px-3 py-1 text-[11.5px] font-semibold text-white">Daily Routine</span>
                <h1 className="mt-2.5 text-[30px] font-bold leading-tight text-slate-900">{greet}, {name}</h1>
                <p className="mt-1 text-[14px] text-slate-600">Discipline today builds the freedom you want tomorrow.</p>
                <div className="mt-4 flex flex-wrap items-center gap-6">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-[15px] font-bold text-slate-700">{streak}</span>
                    <div><p className="text-[15px] font-bold text-slate-900">{streak}</p><p className="text-[11px] text-slate-500">Days Streak</p></div>
                  </div>
                  <div className="flex items-center gap-2.5 border-l border-slate-200/70 pl-6">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-50 text-orange-500"><Flame className="h-5 w-5" /></span>
                    <div><p className="text-[15px] font-bold text-slate-900">{heroMonthPct}%</p><p className="text-[11px] text-slate-500">Monthly Progress</p></div>
                  </div>
                  <div className="flex items-center gap-2.5 border-l border-slate-200/70 pl-6">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600"><Target className="h-5 w-5" /></span>
                    <div><p className="text-[15px] font-bold text-slate-900">{weekFull}/7</p><p className="text-[11px] text-slate-500">Weekly Progress</p></div>
                  </div>
                </div>
              </div>

              <div className="hidden max-w-xs rounded-2xl border border-white/80 bg-white/70 px-6 py-4 text-center shadow-sm backdrop-blur lg:block">
                <p className="text-[24px] leading-10 text-slate-800" style={ARABIC} dir="rtl">مَا شَاءَ اللَّهُ لَا قُوَّةَ إِلَّا بِاللَّهِ</p>
                <p className="mt-1 text-[12.5px] text-slate-600">"What Allah wills, there is no power except with Allah."</p>
                <p className="text-[11.5px] text-slate-500">— Qur'an 18:39</p>
              </div>
            </div>
          </div>

          {/* TOP 4 CARDS */}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {/* Today's progress */}
            <Card className="p-4">
              <div className="flex items-center gap-4">
                <Ring percent={selPercent} size={92} stroke={9} gid="routineRingA">
                  <p className="text-[18px] font-bold leading-none text-slate-900">{selBucket.done}/{selBucket.total}</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">Tasks Done</p>
                </Ring>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold text-slate-900">{isToday ? "Today's Progress" : `${shortDate(selectedDate)} Progress`}</p>
                  <ul className="mt-2 space-y-1.5 text-[12px]">
                    <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500" /><span className="flex-1 text-slate-600">Completed</span><b>{selBucket.done}</b></li>
                    <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-blue-400" /><span className="flex-1 text-slate-600">Pending</span><b>{selBucket.pending}</b></li>
                    <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-rose-500" /><span className="flex-1 text-slate-600">Overdue</span><b>{selBucket.overdue}</b></li>
                  </ul>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[12px] font-medium text-emerald-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" /> {cheer}
              </div>
            </Card>

            {/* Next task */}
            <Card className="p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><Clock className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold text-slate-900">Next Task</p>
                  {nextTask ? (
                    <>
                      <p className="mt-2 truncate text-[14px] font-semibold text-slate-900">{nextTask.title}</p>
                      <p className="mt-0.5 text-[12px] text-slate-500">{range12(nextTask)}</p>
                    </>
                  ) : (
                    <p className="mt-2 text-[13px] text-slate-500">{scheduledOn(todayKey).length ? 'No more tasks for today.' : 'Nothing scheduled today.'}</p>
                  )}
                </div>
              </div>
              <button onClick={() => document.getElementById('routine-tasks')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} className="mt-4 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-[13px] font-medium text-blue-600 hover:bg-slate-100">
                View All Tasks
              </button>
            </Card>

            {/* Streak */}
            <Card className="p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-500"><Flame className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold text-slate-900">Daily Streak</p>
                  <p className="mt-1 text-[28px] font-bold leading-none text-slate-900">{streak}</p>
                  <p className="mt-1 text-[12px] text-slate-500">Days</p>
                  <p className="text-[11.5px] text-slate-500">Keep the streak alive!</p>
                </div>
              </div>
              <div className="mt-3 flex gap-[3px]">
                {Array.from({ length: 20 }, (_, i) => (
                  <span key={i} className={`h-2.5 flex-1 rounded-[3px] ${i < Math.min(streak, 20) ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                ))}
              </div>
            </Card>

            {/* This week */}
            <Card className="p-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><CalendarCheck className="h-4 w-4" /></span>
                <p className="text-[14px] font-bold text-slate-900">This Week</p>
              </div>
              <p className="mt-3 text-[28px] font-bold leading-none text-slate-900">{weekFull}/7</p>
              <p className="mt-1 text-[12px] text-slate-500">Days Completed</p>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-2 flex-1 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-blue-600 transition-all duration-700" style={{ width: `${pct(weekFull, 7)}%` }} /></div>
                <span className="text-[12px] font-semibold text-slate-600">{pct(weekFull, 7)}%</span>
              </div>
            </Card>
          </div>

          {/* MAIN GRID */}
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-3">
              <div className="grid items-stretch gap-3 lg:grid-cols-2 2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1.1fr)_minmax(0,0.95fr)]">
                {/* Today's tasks */}
                <Card className="order-1 p-5" id="routine-tasks">
                  <CardTitle
                    Icon={Timer}
                    title={isToday ? "Today's Tasks" : isFuture ? `Plan · ${shortDate(selectedDate)}` : `Tasks · ${shortDate(selectedDate)}`}
                    right={
                      <button onClick={() => setTaskModal(newTask())} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[12px] font-medium text-blue-600 hover:bg-slate-50">
                        <Plus className="h-3.5 w-3.5" /> Add Task
                      </button>
                    }
                  />

                  {/* quick add = search with recent tasks */}
                  <div className="relative mt-3">
                    {quickOpen && <div className="fixed inset-0 z-10" onClick={() => setQuickOpen(false)} />}
                    <div className="relative z-20">
                      <form
                        onSubmit={(e) => { e.preventDefault(); submitQuick() }}
                        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 focus-within:border-blue-500 focus-within:bg-white"
                      >
                        <Zap className="h-4 w-4 shrink-0 text-amber-500" />
                        <input
                          value={quick}
                          onFocus={() => setQuickOpen(true)}
                          onChange={(e) => { setQuick(e.target.value); setQuickOpen(true) }}
                          placeholder="Quick add or search recent: gym 8am-10am"
                          className="min-w-0 flex-1 bg-transparent py-1 text-[12.5px] outline-none"
                        />
                        <button type="submit" disabled={!parsed} className="rounded-lg bg-blue-600 px-3 py-1 text-[11.5px] font-medium text-white disabled:opacity-40">Add</button>
                      </form>

                      {quickOpen && (
                        <div className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-[320px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                          {parsed && (
                            <button
                              type="button" onClick={submitQuick}
                              className="flex w-full items-center gap-2 rounded-lg bg-blue-50 px-2.5 py-2 text-left hover:bg-blue-100"
                            >
                              <Plus className="h-4 w-4 shrink-0 text-blue-600" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[12px] font-semibold text-slate-900">Add "{parsed.title}"</span>
                                <span className="block text-[10.5px] text-slate-500">
                                  {parsed.start ? `${fmt12(parsed.start)} – ${fmt12(parsed.end)}` : 'no time (form will open)'} · {CATS[parsed.category].label} · {parsed.daily ? 'Every day' : parsed.dateKey === todayKey ? 'Today' : shortDate(parsed.dateKey)}
                                </span>
                              </span>
                            </button>
                          )}
                          <p className="px-2.5 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">Recent tasks</p>
                          {recentList.length === 0 && (
                            <p className="px-2.5 pb-2 text-[11.5px] text-slate-400">{quick.trim() ? 'No recent task matches.' : 'No recent tasks to add for this day.'}</p>
                          )}
                          {recentList.map((t) => {
                            const cat = CATS[t.category] || CATS.other
                            return (
                              <button
                                key={t.id} type="button" onClick={() => addRecent(t)}
                                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-slate-50"
                              >
                                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${cat.circle}`}><cat.Icon className="h-4 w-4" /></span>
                                <span className="min-w-0 flex-1">
                                  <span className="flex items-center gap-1.5">
                                    <span className="truncate text-[12px] font-semibold text-slate-900">{t.title}</span>
                                    {t.worship_key && <Link2 className="h-3 w-3 shrink-0 text-indigo-400" />}
                                    {t.video_id && <Video className="h-3 w-3 shrink-0 text-sky-500" />}
                                    {t.bt_hours && <History className="h-3 w-3 shrink-0 text-violet-500" />}
                                  </span>
                                  <span className="block text-[10.5px] text-slate-500">{range12(t)} · {cat.label}</span>
                                </span>
                                <Plus className="h-4 w-4 shrink-0 text-blue-500" />
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    {!quickOpen && !parsed && (
                      <p className="mt-1.5 px-1 text-[11px] text-slate-400">Click to see recent tasks, or type: "coding 4-5:30pm", "backtesting 9-11am"</p>
                    )}
                    {!hasDailyWorship && (
                      <button
                        onClick={addDailyWorship}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[11.5px] font-medium text-indigo-700 hover:bg-indigo-100"
                      >
                        <Link2 className="h-3.5 w-3.5" /> Add "Daily Worship" task (auto at 10/10)
                      </button>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {[['all', 'All'], ['priority', 'Priority'], ['habits', 'Habits'], ['other', 'Other']].map(([k, l]) => (
                      <button
                        key={k} onClick={() => setFilter(k)}
                        className={`rounded-full px-3 py-1 text-[11.5px] font-medium ${filter === k ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                      >{l} ({counts[k]})</button>
                    ))}
                  </div>
                  <div className="mt-3 max-h-[470px] space-y-1 overflow-y-auto pr-1">
                    {filtered.length === 0 && (
                      <p className="py-10 text-center text-[12.5px] text-slate-400">
                        {isFuture ? 'Nothing planned yet. Use Quick add or Add Task.' : 'No tasks here.'}
                      </p>
                    )}
                    {filtered.map((t) => {
                      const cat = CATS[t.category] || CATS.other
                      const state = taskState(t, selectedDate)
                      const done = state === 'done'
                      const locked = isFuture || isAuto(t)
                      return (
                        <div key={t.id} className="group flex items-center gap-2.5 rounded-xl px-1.5 py-2 hover:bg-slate-50">
                          <button
                            disabled={locked}
                            onClick={() => toggleDone(t, selectedDate)}
                            title={t.worship_key ? 'Auto: reach 10/10 in Daily Worship' : t.video_id ? 'Auto: watch the video in Learning Hub' : t.bt_hours ? 'Auto: log trades in Backtesting' : isFuture ? 'You can tick it on the day' : ''}
                            className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border ${done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white'} ${isFuture ? 'opacity-40' : ''}`}
                          >{done && <Check className="h-3 w-3" strokeWidth={3} />}</button>
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${cat.circle}`}><cat.Icon className="h-4 w-4" /></span>
                          <button onClick={() => setTaskModal(t)} className="min-w-0 flex-1 text-left">
                            <p className={`flex items-center gap-1.5 truncate text-[12.5px] font-semibold ${done ? 'text-slate-500' : 'text-slate-900'}`}>
                              <span className="truncate">{t.title}</span>
                              {isAuto(t) && <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-indigo-50 px-1 py-px text-[9.5px] font-medium text-indigo-600"><Link2 className="h-2.5 w-2.5" />Auto</span>}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {range12(t)}{t.only_date ? ' · one-time' : ''}
                              {t.worship_key === WORSHIP_ALL ? ' · needs Worship 10/10' : ''}
                              {t.video_id ? ` · ${Math.min(watchedMin(t), t.video_minutes || 0)}/${t.video_minutes} min watched` : ''}
                              {t.bt_hours ? ` · ${Math.min(shots[selectedDate] || 0, btNeeded(t.bt_hours))}/${btNeeded(t.bt_hours)} trades` : ''}
                            </p>
                          </button>
                          <span className={`hidden shrink-0 rounded-md px-2 py-0.5 text-[10.5px] font-medium sm:inline ${cat.chip}`}>{cat.label}</span>
                          <span className={`inline-flex w-[70px] shrink-0 items-center justify-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium ${
                            done ? 'bg-emerald-50 text-emerald-600' : state === 'overdue' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
                          }`}>
                            {done ? <><Check className="h-3 w-3" /> Done</> : state === 'overdue' ? <><AlertCircle className="h-3 w-3" /> Overdue</> : <><Clock className="h-3 w-3" /> Pending</>}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </Card>

                {/* Habit tracker */}
                <Card className="order-3 p-5 lg:col-span-2 2xl:order-2 2xl:col-span-1">
                  <CardTitle Icon={CalendarCheck} title="Habit Tracker" sub="Build good habits, create a better you." />
                  <div className="mt-3 flex items-center justify-end gap-1.5 text-[12px] font-medium text-slate-700">
                    <button onClick={() => changeWeek(-1)} className="rounded-md p-0.5 text-slate-500 hover:bg-slate-100"><ChevronLeft className="h-4 w-4" /></button>
                    {weekLabel}
                    <button onClick={() => changeWeek(1)} className="rounded-md p-0.5 text-slate-500 hover:bg-slate-100"><ChevronRight className="h-4 w-4" /></button>
                  </div>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[320px] text-center">
                      <thead>
                        <tr className="text-[11px] text-slate-500">
                          <th />
                          {weekDates.map((k) => (
                            <th key={k} className="px-1 pb-1 font-medium">
                              <div>{fromKey(k).toLocaleDateString('en-US', { weekday: 'short' })}</div>
                              <div className={k === todayKey ? 'font-bold text-blue-600' : ''}>{fromKey(k).getDate()}</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {habits.length === 0 && (
                          <tr><td colSpan={8} className="py-8 text-[12px] text-slate-400">No habits yet. Add a task and tick "Habit".</td></tr>
                        )}
                        {habits.map((t) => {
                          const cat = CATS[t.category] || CATS.other
                          return (
                            <tr key={t.id}>
                              <td className="py-1.5 pr-2 text-left">
                                <div className="flex items-center gap-2">
                                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${cat.circle}`}><cat.Icon className="h-3.5 w-3.5" /></span>
                                  <span className="max-w-[110px] truncate text-[11.5px] text-slate-800">{t.title}</span>
                                  {isAuto(t) && <Link2 className="h-3 w-3 shrink-0 text-indigo-400" title="Automatic" />}
                                </div>
                              </td>
                              {weekDates.map((k) => {
                                const scheduled = isSched(t, k)
                                const st = statusOf(t, k)
                                const future = k > todayKey
                                const locked = future || isAuto(t)
                                if (!scheduled) return <td key={k}><span className="text-slate-300">–</span></td>
                                return (
                                  <td key={k} className="py-1.5">
                                    <button
                                      disabled={locked}
                                      onClick={() => cycleHabit(t, k)}
                                      title={isAuto(t) ? 'Automatic' : future ? 'Future day' : 'Click to change: done, partial, missed, clear'}
                                      className={`mx-auto flex h-[22px] w-[22px] items-center justify-center rounded-full transition ${future ? 'opacity-40' : isAuto(t) ? '' : 'hover:scale-110'} ${
                                        st === 'done' ? 'bg-emerald-500 text-white'
                                          : st === 'partial' ? 'bg-amber-400 text-white'
                                          : st === 'missed' ? 'bg-rose-500 text-white'
                                          : 'border-2 border-slate-200 bg-white'
                                      }`}
                                    >
                                      {st === 'done' && <Check className="h-3 w-3" strokeWidth={3} />}
                                      {st === 'partial' && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                                      {st === 'missed' && <X className="h-3 w-3" strokeWidth={3} />}
                                    </button>
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-5 text-[11.5px] text-slate-600">
                    <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-emerald-500" /> Completed</span>
                    <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-amber-400" /> Partial</span>
                    <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-rose-500" /> Missed</span>
                    <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-full border-2 border-slate-200" /> Not done</span>
                  </div>
                </Card>

                {/* Calendar */}
                <Card className="order-2 flex flex-col p-5 2xl:order-3">
                  <CardTitle Icon={CalendarDays} title="Calendar" />
                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-800">
                      <button onClick={() => setViewMonth(new Date(vy, vm - 1, 1))} className="rounded-md p-0.5 text-slate-500 hover:bg-slate-100"><ChevronLeft className="h-4 w-4" /></button>
                      {monthLabel}
                      <button onClick={() => setViewMonth(new Date(vy, vm + 1, 1))} className="rounded-md p-0.5 text-slate-500 hover:bg-slate-100"><ChevronRight className="h-4 w-4" /></button>
                    </div>
                    <button
                      onClick={() => { setSelectedDate(todayKey); setViewMonth(new Date(now.getFullYear(), now.getMonth(), 1)); setWeekStart(mondayOf(new Date())) }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11.5px] font-medium text-blue-600 hover:bg-slate-50"
                    ><Plus className="h-3 w-3" /> Today</button>
                  </div>
                  <div className="mt-3 grid grid-cols-7 text-center text-[10.5px] font-medium uppercase tracking-wide text-slate-400">
                    {DOW.map((w) => <div key={w} className="py-1">{w}</div>)}
                  </div>
                  <div className="grid flex-1 grid-cols-7 grid-rows-6 gap-y-1 text-center">
                    {cells.map((c) => {
                      const st = dayState(c.key)
                      const sel = c.key === selectedDate
                      return (
                        <button
                          key={c.key}
                          onClick={() => {
                            setSelectedDate(c.key)
                            const d = fromKey(c.key)
                            if (!c.inMonth) setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1))
                            setWeekStart(mondayOf(d))
                          }}
                          className="flex flex-col items-center justify-center py-0.5"
                        >
                          <span className={`flex h-8 w-8 items-center justify-center rounded-full text-[12.5px] font-medium transition ${sel ? 'bg-blue-600 text-white shadow-sm' : c.key === todayKey ? 'bg-blue-50 font-bold text-blue-600 ring-1 ring-blue-300' : c.inMonth ? 'text-slate-800 hover:bg-slate-100' : 'text-slate-300'}`}>{c.day}</span>
                          <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${sel ? 'bg-transparent' : c.inMonth ? dotColor[st] : 'bg-transparent'}`} />
                        </button>
                      )
                    })}
                  </div>
                  <div className="mt-4 border-t border-slate-100 pt-3">
                    <p className="text-[13px] font-bold text-slate-900">Legend</p>
                    <ul className="mt-2 space-y-1.5 text-[12px] text-slate-600">
                      <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500" /> All tasks completed</li>
                      <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-400" /> Partial completion</li>
                      <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-rose-500" /> Missed / Not completed</li>
                      <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-blue-300" /> Planned (upcoming)</li>
                    </ul>
                  </div>
                </Card>
              </div>

              {/* BOTTOM ROW */}
              <div className="grid gap-3 lg:grid-cols-[1.15fr_1fr_1fr]">
                {/* Weekly overview */}
                <Card className="p-5">
                  <CardTitle Icon={Activity} title="Weekly Overview" sub="Your overall progress this week." />
                  <div className="mt-2 h-[170px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={weekChart} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
                        <defs>
                          <linearGradient id="routineWeek" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid stroke="#eef1f6" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                        <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                        <Tooltip content={<ChartTip />} />
                        <Area type="monotone" dataKey="pct" stroke="#3b82f6" strokeWidth={2} fill="url(#routineWeek)" dot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                {/* Monthly overview (click for details) */}
                <Card
                  className="cursor-pointer p-5 transition hover:border-blue-200 hover:shadow-md"
                  onClick={() => setMonthModal(true)}
                  title="Click to see details"
                >
                  <CardTitle
                    Icon={BarChart3} title="Monthly Overview" sub="Your progress this month."
                    right={<span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-blue-600">Details <ChevronRight className="h-3.5 w-3.5" /></span>}
                  />
                  <div className="mt-4 flex items-center gap-4">
                    <Ring percent={monthPct} size={104} stroke={10} gid="routineRingM">
                      <p className="text-[20px] font-bold leading-none text-slate-900">{monthPct}%</p>
                      <p className="mt-0.5 text-[10px] text-slate-500">Completed</p>
                    </Ring>
                    <ul className="min-w-0 flex-1 text-[12px]">
                      {[
                        ['bg-slate-300', 'Total Tasks', monthB.total],
                        ['bg-emerald-500', 'Completed', monthB.done],
                        ['bg-amber-400', 'Pending', monthB.pending],
                        ['bg-rose-500', 'Overdue', monthB.overdue],
                      ].map(([c, l, v]) => (
                        <li key={l} className="flex items-center gap-2 border-b border-slate-100 py-1.5 last:border-0">
                          <span className={`h-2 w-2 rounded-full ${c}`} /><span className="flex-1 text-slate-600">{l}</span><b className="text-slate-900">{v}</b>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p className="mt-2 text-[10.5px] text-slate-400">Counts each day a task appears. Tap for the full breakdown.</p>
                </Card>

                {/* Consistency */}
                <Card className="p-5">
                  <CardTitle Icon={Timer} title="Consistency" sub="How consistent are you?" />
                  <div className="mt-2 h-[170px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={consistency} margin={{ top: 20, right: 8, left: 8, bottom: 0 }}>
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                        <YAxis hide domain={[0, 100]} />
                        <Bar dataKey="pct" radius={[5, 5, 0, 0]} maxBarSize={36}>
                          {consistency.map((_, i) => <Cell key={i} fill="#2dbf8f" />)}
                          <LabelList dataKey="pct" position="top" formatter={(v) => `${v}%`} style={{ fontSize: 10, fill: '#334155', fontWeight: 600 }} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div className="min-w-0 space-y-3">
              <div className="relative overflow-hidden rounded-2xl p-5 text-white" style={{ background: 'linear-gradient(135deg,#1e3a8a 0%,#2f5bd1 55%,#7aa2f0 100%)', minHeight: 150 }}>
                <svg viewBox="0 0 320 150" preserveAspectRatio="xMaxYMax slice" className="pointer-events-none absolute inset-0 h-full w-full opacity-60">
                  <path d="M0 150 L70 80 L110 112 L190 40 L260 105 L320 70 L320 150 Z" fill="#0f2a6b" opacity="0.55" />
                  <path d="M0 150 L50 112 L120 128 L210 78 L320 128 L320 150 Z" fill="#0b1f55" opacity="0.6" />
                </svg>
                <div className="relative">
                  <p className="text-[21px] font-bold leading-snug">Small steps<br />every day create<br />big results.</p>
                  <p className="mt-3 text-[11.5px] text-blue-100">Keep going, you're doing great!</p>
                </div>
              </div>

              <Card className="p-5">
                <CardTitle Icon={ListChecks} title="Quick Stats" />
                <div className="mt-3 space-y-3">
                  {[
                    ['bg-blue-50 text-blue-600', ListChecks, 'Total Tasks', selBucket.total, null, 'bg-blue-500'],
                    ['bg-emerald-50 text-emerald-600', CheckCircle2, 'Completed Today', selBucket.done, pct(selBucket.done, selBucket.total), 'bg-emerald-500'],
                    ['bg-amber-50 text-amber-500', Clock, 'Pending Today', selBucket.pending, pct(selBucket.pending, selBucket.total), 'bg-amber-400'],
                    ['bg-rose-50 text-rose-500', AlertCircle, 'Overdue', selBucket.overdue, pct(selBucket.overdue, selBucket.total), 'bg-rose-500'],
                  ].map(([circle, Ic, label, val, p, bar]) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${circle}`}><Ic className="h-4 w-4" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between text-[12px]">
                          <span className="text-slate-600">{label}</span>
                          {p != null && <span className="text-slate-500">{p}%</span>}
                        </div>
                        <p className="text-[13px] font-bold text-slate-900">{val}</p>
                        {p != null && <div className="h-1.5 rounded-full bg-slate-100"><div className={`h-1.5 rounded-full ${bar} transition-all duration-700`} style={{ width: `${p}%` }} /></div>}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-5">
                <CardTitle
                  Icon={Target} title="Goals Progress"
                  right={
                    <div className="flex items-center gap-2">
                      <button onClick={() => setGoalModal({ title: '', subtitle: '', kind: 'goal', current_value: 0, target_value: 100, unit: '' })} className="rounded-md p-1 text-blue-600 hover:bg-blue-50"><Plus className="h-4 w-4" /></button>
                      {regularGoals.length > 4 && (
                        <button onClick={() => setShowAllGoals((v) => !v)} className="text-[11px] font-medium text-blue-600">{showAllGoals ? 'Show less' : 'View All'}</button>
                      )}
                    </div>
                  }
                />
                <div className="mt-3 space-y-3.5">
                  {shownGoals.length === 0 && <p className="py-3 text-center text-[12px] text-slate-400">No goals yet. Tap + to add one.</p>}
                  {shownGoals.map((g) => {
                    const p = goalPct(g)
                    return (
                      <button key={g.id} onClick={() => setGoalModal(g)} className="block w-full text-left">
                        <div className="flex items-center justify-between text-[12.5px]">
                          <span className="font-semibold text-slate-900">{g.title}</span>
                          <span className="text-slate-500">{p}%</span>
                        </div>
                        <p className="text-[11px] text-slate-500">{g.subtitle || `${g.current_value}/${g.target_value} ${g.unit}`}</p>
                        <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full transition-all duration-700" style={{ width: `${p}%`, background: g.color }} /></div>
                      </button>
                    )
                  })}
                </div>
              </Card>

              <Card className="p-5">
                <CardTitle
                  Icon={Flag} title="Weekly Goals" sub={weekLabel}
                  right={
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => changeWeek(-1)} className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><ChevronLeft className="h-4 w-4" /></button>
                      <button onClick={() => changeWeek(1)} className="rounded-md p-1 text-slate-500 hover:bg-slate-100"><ChevronRight className="h-4 w-4" /></button>
                      <button
                        onClick={() => setGoalModal({ title: '', subtitle: '', plan: '', kind: 'week', current_value: 0, target_value: 100, unit: '%', week_start: weekKey, link_type: '', link_video_id: '' })}
                        className="rounded-md p-1 text-blue-600 hover:bg-blue-50"
                      ><Plus className="h-4 w-4" /></button>
                    </div>
                  }
                />
                <div className="mt-3 space-y-3">
                  {weekGoals.length === 0 && <p className="py-3 text-center text-[12px] text-slate-400">No goals for this week. Tap + to plan one.</p>}
                  {weekGoals.map((g) => {
                    const p = goalPct(goalView(g))
                    return (
                      <button key={g.id} onClick={() => setGoalModal(goalView(g))} className="block w-full text-left">
                        <div className="flex items-center justify-between text-[12px]">
                          <span className="flex items-center gap-1.5 font-semibold text-slate-900">
                            {g.title}
                            {g.link_type && <span className="inline-flex items-center gap-0.5 rounded bg-indigo-50 px-1 py-px text-[9.5px] font-medium text-indigo-600"><Link2 className="h-2.5 w-2.5" />Auto</span>}
                          </span>
                          <span className="text-slate-500">{p}%</span>
                        </div>
                        <p className="truncate text-[10.5px] text-slate-500">
                          {g.plan ? g.plan : `${goalCur(g)}/${g.target_value} ${g.unit}`}
                        </p>
                        <div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-1.5 rounded-full transition-all duration-700" style={{ width: `${p}%`, background: g.color }} /></div>
                      </button>
                    )
                  })}
                </div>
              </Card>
            </div>
          </div>
        </main>
      </div>

      {taskModal && <TaskModal initial={taskModal} defaultDate={selectedDate} videos={videos} onSave={saveTask} onDelete={removeTask} onClose={() => setTaskModal(null)} />}
      {goalModal && <GoalModal initial={goalModal} weekLabel={weekLabel} videos={videos} onSave={saveGoal} onDelete={removeGoal} onClose={() => setGoalModal(null)} />}
      {monthModal && <MonthModal label={monthLabel} total={monthB.total} byTask={monthByTask} byDay={monthByDay} onClose={() => setMonthModal(false)} />}
    </div>
  )
}