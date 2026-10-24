import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  Activity, AlertTriangle, ArrowRight, BookOpen, CheckCircle2, ClipboardList, DollarSign, Flame,
  GraduationCap, Hash, History, Landmark, Moon, RefreshCw, Scale, Shield, ShieldAlert, Target,
  TrendingDown, TrendingUp, Wallet,
} from 'lucide-react'

import Sidebar from '../components/layout/Sidebar'
import Topbar from '../components/layout/Topbar'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import ProgressBar from '../components/ui/ProgressBar'
import LoadingSkeleton from '../components/ui/LoadingSkeleton'

import { useAuth } from '../contexts/AuthContext'
import { useAccounts } from '../hooks/useAccounts'
import { useTrades } from '../hooks/useTrades'
import { useBacktestTrades } from '../hooks/useBacktestTrades'
import { useTradingPlan } from '../hooks/useTradingPlan'
import { supabase } from '../lib/supabaseClient'
import { fetchBacktestShots, fetchLogs, fetchTasks } from '../services/routineService'
import { fetchWorshipDays } from '../services/worshipService'

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

const pad = (n) => String(n).padStart(2, '0')
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d) }
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const mondayOf = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -((x.getDay() + 6) % 7)) }
const shortDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

const pnlOf = (t) => Number(t.net_profit ?? t.profit ?? 0) || 0
const isResolved = (t) => t.result === 'WIN' || t.result === 'LOSS' || t.result === 'BREAK_EVEN'
const timeOf = (t) => { const d = new Date(t.opened_at || t.closed_at || 0); return Number.isNaN(d.getTime()) ? 0 : d.getTime() }
const money = (n, sign = true) => {
  const v = Number(n || 0)
  return `${sign ? (v >= 0 ? '+' : '-') : v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
const tone = (v) => (v > 0 ? 'text-success' : v < 0 ? 'text-danger' : 'text-text-secondary')
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0)
const deltaPct = (cur, prev) => (!prev ? null : ((cur - prev) / Math.abs(prev)) * 100)
const parseRR = (rr) => parseFloat(String(rr ?? '').split(':')[1]) || 0

const resultTone = { WIN: 'success', LOSS: 'danger', BREAK_EVEN: 'neutral', NONE: 'neutral' }
const resultLabel = { WIN: 'WIN', LOSS: 'LOSS', BREAK_EVEN: 'BE', NONE: 'OPEN' }
const PIE_COLORS = { WIN: '#16A34A', LOSS: '#DC2626', BREAK_EVEN: '#9CA3AF' }

const RANGES = [
  { value: '7d', label: 'Last 7 Days', days: 7 },
  { value: '30d', label: 'Last 30 Days', days: 30 },
  { value: '90d', label: 'Last 90 Days', days: 90 },
  { value: 'all', label: 'All Time', days: null },
]

const WORSHIP_ITEMS = [
  ['fajr', 1], ['morning_adhkar', 1], ['quran', 1], ['dhuhr', 1], ['istighfar', 100], ['asr', 1],
  ['evening_adhkar', 1], ['maghrib', 1], ['isha', 1], ['tasbih', 100], ['alhamdulillah', 100],
  ['allahu_akbar', 100], ['la_ilaha', 100],
]
const WTARGET = Object.fromEntries(WORSHIP_ITEMS)
const SHOTS_PER_HOUR = 5

function computeStats(trades) {
  const list = trades.filter(isResolved).sort((a, b) => timeOf(a) - timeOf(b))
  const pnls = list.map(pnlOf)
  const wins = list.filter((t) => t.result === 'WIN').length
  const losses = list.filter((t) => t.result === 'LOSS').length
  const be = list.filter((t) => t.result === 'BREAK_EVEN').length
  const grossProfit = pnls.filter((p) => p > 0).reduce((a, b) => a + b, 0)
  const grossLoss = Math.abs(pnls.filter((p) => p < 0).reduce((a, b) => a + b, 0))
  let cum = 0, peak = 0, maxDd = 0
  const curve = [{ n: 0, label: 'Start', value: 0 }]
  list.forEach((t, i) => {
    cum += pnlOf(t)
    peak = Math.max(peak, cum)
    maxDd = Math.max(maxDd, peak - cum)
    curve.push({
      n: i + 1,
      label: t.opened_at ? shortDate(new Date(t.opened_at)) : `#${i + 1}`,
      symbol: t.symbol,
      value: Math.round(cum * 100) / 100,
    })
  })
  const rrs = trades.map((t) => parseRR(t.rr)).filter((n) => n > 0)
  const risks = trades.map((t) => Number(t.risk_percent)).filter((n) => n > 0)
  return {
    total: trades.length,
    resolved: list.length,
    wins, losses, be,
    winRate: list.length ? (wins / list.length) * 100 : 0,
    net: cum,
    avgRR: rrs.length ? rrs.reduce((a, b) => a + b, 0) / rrs.length : 0,
    avgRisk: risks.length ? risks.reduce((a, b) => a + b, 0) / risks.length : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : null,
    maxDd,
    curve,
  }
}

function groupPerformance(trades, keyFn) {
  const map = new Map()
  trades.filter(isResolved).forEach((t) => {
    const k = keyFn(t) || '—'
    if (!map.has(k)) map.set(k, { key: k, count: 0, wins: 0, pnl: 0 })
    const g = map.get(k)
    g.count += 1
    if (t.result === 'WIN') g.wins += 1
    g.pnl += pnlOf(t)
  })
  return [...map.values()].sort((a, b) => b.pnl - a.pnl)
}

function propRules(account, trades) {
  const start = Number(account?.starting_balance) || 0
  const resolved = trades.filter(isResolved)
  const todayKey = toKey(new Date())
  const total = resolved.reduce((s, t) => s + pnlOf(t), 0)
  const today = resolved.filter((t) => t.opened_at && toKey(new Date(t.opened_at)) === todayKey).reduce((s, t) => s + pnlOf(t), 0)
  const clamp = (n) => Math.min(100, Math.max(0, n))
  const mk = (limitPct, used, extra = {}) => {
    const limit = (start * (Number(limitPct) || 0)) / 100
    return limit > 0 ? { limit, used, progress: clamp((used / limit) * 100), pct: limitPct, ...extra } : null
  }
  return {
    total, today,
    target: mk(account?.profit_target_percent, Math.max(0, total)),
    daily: mk(account?.daily_loss_limit_percent, Math.max(0, -today)),
    dd: mk(account?.max_drawdown_percent, Math.max(0, -total)),
  }
}

const usageTone = (p) => (p >= 85 ? 'danger' : p >= 60 ? 'warning' : 'success')

/* ------------------------------------------------------------------ */
/* UI pieces                                                            */
/* ------------------------------------------------------------------ */

function SectionHead({ icon: Icon, iconBg = 'bg-blue-50 text-brand', title, sub, right }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconBg}`}><Icon className="h-4 w-4" /></div>
        <div>
          <h3 className="text-[16px] font-semibold text-text-primary">{title}</h3>
          {sub && <p className="text-xs text-text-muted">{sub}</p>}
        </div>
      </div>
      {right}
    </div>
  )
}

function Kpi({ icon: Icon, iconBg, label, value, valueTone = 'text-text-primary', delta, hint }) {
  return (
    <Card padded className="flex flex-col gap-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-popover">
      <div className="flex items-center gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBg}`}><Icon className="h-4 w-4" /></div>
        <span className="text-xs font-medium text-text-secondary">{label}</span>
      </div>
      <p className={`tabular-nums text-xl font-bold tracking-tight ${valueTone}`}>{value}</p>
      <div className="flex items-center justify-between">
        {delta != null ? (
          <span className={`inline-flex items-center gap-1 text-xs font-medium ${delta >= 0 ? 'text-success' : 'text-danger'}`}>
            {delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {delta >= 0 ? '+' : ''}{delta.toFixed(0)}%
          </span>
        ) : <span className="text-[11px] text-text-muted">{hint || ' '}</span>}
      </div>
    </Card>
  )
}

function Empty({ text }) {
  return <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border text-center text-sm text-text-muted">{text}</div>
}

function Segmented({ value, onChange, options }) {
  return (
    <div className="flex items-center rounded-lg border border-border p-0.5">
      {options.map(([k, l]) => (
        <button
          key={k} type="button" onClick={() => onChange(k)}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${value === k ? 'bg-brand text-white' : 'text-text-secondary hover:bg-surface'}`}
        >{l}</button>
      ))}
    </div>
  )
}

function CurveTip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-xl border border-border bg-white px-3 py-2 text-xs shadow-popover">
      <p className="font-semibold text-text-primary">{p.n === 0 ? 'Start' : `#${p.n} · ${p.symbol || 'Trade'}`}</p>
      <p className="text-text-muted">{p.label}</p>
      <p className={`mt-1 tabular-nums font-semibold ${tone(p.value)}`}>{money(p.value)}</p>
    </div>
  )
}

function RuleBar({ label, value, sub, progress, barTone }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="text-text-secondary">{label}</span>
        <span className="tabular-nums font-medium text-text-primary">{value}</span>
      </div>
      <ProgressBar value={progress} tone={barTone} />
      <p className="mt-1 text-xs text-text-muted">{sub}</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { accounts = [] } = useAccounts()
  const { trades: allTrades = [], loading, error, refresh } = useTrades()
  const { trades: btTrades = [] } = useBacktestTrades()
  const { plan } = useTradingPlan()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [accountId, setAccountId] = useState('all')
  const [range, setRange] = useState('30d')
  const [perfView, setPerfView] = useState('pair')

  const [extras, setExtras] = useState({ tasks: [], logs: {}, worship: {}, shots: {}, videos: [], progress: [] })

  /* ----- load routine / worship / learning (refresh on tab focus) ----- */
  const loadExtras = useCallback(async () => {
    if (!user) return
    const today = new Date()
    const from = toKey(addDays(today, -13))
    const to = toKey(today)
    const [t, l, w, s, v, p] = await Promise.allSettled([
      fetchTasks(user.id),
      fetchLogs(user.id, from, to),
      fetchWorshipDays(user.id, from, to),
      fetchBacktestShots(user.id, from),
      supabase.from('learning_videos').select('id, title, duration_seconds, category').eq('user_id', user.id),
      supabase.from('learning_progress').select('video_id, watched_seconds, completed').eq('user_id', user.id),
    ])
    const ok = (r, d) => (r.status === 'fulfilled' ? r.value : d)
    const logs = {}
    ok(l, []).forEach((r) => { logs[`${r.task_id}|${r.log_date}`] = r.status })
    const worship = {}
    ok(w, []).forEach((r) => { worship[r.log_date] = r.counts || {} })
    setExtras({
      tasks: ok(t, []).map((x) => ({
        ...x, start_time: String(x.start_time).slice(0, 5), end_time: String(x.end_time).slice(0, 5), days: x.days || [],
      })),
      logs, worship,
      shots: ok(s, {}),
      videos: ok(v, { data: [] }).data || [],
      progress: ok(p, { data: [] }).data || [],
    })
  }, [user])

  useEffect(() => {
    loadExtras()
    const onFocus = () => { loadExtras(); refresh && refresh() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [loadExtras]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ----- trade filtering ----- */
  const accountsById = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a])), [accounts])
  const rangeDays = RANGES.find((r) => r.value === range)?.days

  const byAccount = useMemo(
    () => allTrades.filter((t) => accountId === 'all' || t.account_id === accountId),
    [allTrades, accountId]
  )
  const current = useMemo(() => {
    if (!rangeDays) return byAccount
    const cutoff = addDays(new Date(), -rangeDays).getTime()
    return byAccount.filter((t) => timeOf(t) >= cutoff)
  }, [byAccount, rangeDays])
  const previous = useMemo(() => {
    if (!rangeDays) return []
    const end = addDays(new Date(), -rangeDays).getTime()
    const start = addDays(new Date(), -rangeDays * 2).getTime()
    return byAccount.filter((t) => timeOf(t) >= start && timeOf(t) < end)
  }, [byAccount, rangeDays])

  const stats = useMemo(() => computeStats(current), [current])
  const prev = useMemo(() => computeStats(previous), [previous])

  /* ----- weekly P&L (last 8 weeks, from account-filtered trades) ----- */
  const weekly = useMemo(() => {
    const start = mondayOf(new Date())
    return Array.from({ length: 8 }, (_, i) => {
      const ws = addDays(start, -7 * (7 - i))
      const we = addDays(ws, 7)
      const list = byAccount.filter(isResolved).filter((t) => timeOf(t) >= ws.getTime() && timeOf(t) < we.getTime())
      return { label: shortDate(ws), pnl: Math.round(list.reduce((s, t) => s + pnlOf(t), 0) * 100) / 100, count: list.length }
    })
  }, [byAccount])

  /* ----- performance breakdown ----- */
  const perf = useMemo(() => {
    const fn = perfView === 'pair' ? (t) => t.symbol : perfView === 'setup' ? (t) => t.setup : (t) => t.session
    return groupPerformance(current, fn).slice(0, 6)
  }, [current, perfView])
  const maxAbs = Math.max(1, ...perf.map((p) => Math.abs(p.pnl)))

  /* ----- prop rules ----- */
  const ruleAccount = accountId !== 'all' ? accountsById[accountId] : null
  const rules = useMemo(
    () => (ruleAccount ? propRules(ruleAccount, allTrades.filter((t) => t.account_id === ruleAccount.id)) : null),
    [ruleAccount, allTrades]
  )

  /* ----- recent trades ----- */
  const recent = useMemo(() => [...current].sort((a, b) => timeOf(b) - timeOf(a)).slice(0, 6), [current])

  /* ----- backtesting ----- */
  const bt = useMemo(() => {
    const pips = (t) => (t.result === 'WIN' ? Number(t.tp_pips) || 0 : t.result === 'LOSS' ? -(Number(t.sl_pips) || 0) : 0)
    const wins = btTrades.filter((t) => t.result === 'WIN').length
    const month = toKey(new Date()).slice(0, 7)
    return {
      total: btTrades.length,
      winRate: btTrades.length ? (wins / btTrades.length) * 100 : 0,
      net: btTrades.reduce((s, t) => s + pips(t), 0),
      thisMonth: btTrades.filter((t) => String(t.trade_date || '').startsWith(month)).length,
    }
  }, [btTrades])

  /* ----- routine + worship (today) ----- */
  const todayKey = toKey(new Date())
  const discipline = useMemo(() => {
    const { tasks, logs, worship, shots, progress } = extras
    const prog = Object.fromEntries(progress.map((r) => [r.video_id, Number(r.watched_seconds) || 0]))
    const sched = (t, key) => (t.only_date ? t.only_date === key : key >= t.start_date && t.days.includes(fromKey(key).getDay()))
    const done = (t, key) => {
      if (t.worship_key) {
        const c = worship[key]
        if (!c) return false
        if (t.worship_key === 'all') return WORSHIP_ITEMS.every(([k, target]) => (c[k] || 0) >= target)
        return (c[t.worship_key] || 0) >= (WTARGET[t.worship_key] || 1)
      }
      if (t.video_id) return Math.floor(((prog[t.video_id] || 0) - (t.video_baseline_seconds || 0)) / 60) >= (t.video_minutes || 1)
      if (t.bt_hours) return (shots[key] || 0) >= Number(t.bt_hours) * SHOTS_PER_HOUR
      return logs[`${t.id}|${key}`] === 'done'
    }
    const day = (key) => {
      const list = tasks.filter((t) => sched(t, key))
      const d = list.filter((t) => done(t, key)).length
      return { total: list.length, done: d, pct: pct(d, list.length) }
    }
    const week = Array.from({ length: 7 }, (_, i) => {
      const k = toKey(addDays(new Date(), -(6 - i)))
      const s = day(k)
      return { label: fromKey(k).toLocaleDateString('en-US', { weekday: 'short' }), pct: s.total ? s.pct : 0, has: s.total > 0 }
    })
    const w = worship[todayKey] || {}
    const wDone = WORSHIP_ITEMS.filter(([k, target]) => (w[k] || 0) >= target).length
    return { today: day(todayKey), week, worshipDone: wDone, worshipTotal: WORSHIP_ITEMS.length, tasks: tasks.length }
  }, [extras, todayKey])

  /* ----- learning ----- */
  const learning = useMemo(() => {
    const { videos, progress } = extras
    const completed = progress.filter((p) => p.completed).length
    const watched = progress.reduce((s, p) => s + (Number(p.watched_seconds) || 0), 0)
    const h = Math.floor(watched / 3600)
    const m = Math.floor((watched % 3600) / 60)
    return { total: videos.length, completed, inProgress: progress.filter((p) => !p.completed && p.watched_seconds > 0).length, time: h ? `${h}h ${m}m` : `${m}m` }
  }, [extras])

  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening'
  const name = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'Trader'

  const donut = [
    { key: 'WIN', name: 'Wins', value: stats.wins },
    { key: 'LOSS', name: 'Losses', value: stats.losses },
    { key: 'BREAK_EVEN', name: 'Breakeven', value: stats.be },
  ].filter((d) => d.value > 0)

  const curveColor = stats.net >= 0 ? '#16A34A' : '#DC2626'
  const selectedForTopbar = ruleAccount ? { label: ruleAccount.name } : { label: 'All Accounts' }

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onMenuClick={() => setSidebarOpen(true)}
          accounts={accounts.map((a) => ({ id: a.id, label: a.name, status: a.mt5_connected ? 'connected' : 'disconnected' }))}
          selectedAccount={selectedForTopbar}
          onSelectAccount={(a) => setAccountId(a.id)}
          breadcrumb="Overview / Dashboard"
        />

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-[28px] font-bold tracking-tight text-text-primary sm:text-[32px]">{greet}, {name}</h1>
              <p className="mt-1 text-sm text-text-secondary">Your trading, discipline and growth — all in one place.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={accountId} onChange={(e) => setAccountId(e.target.value)}
                className="h-11 min-w-[170px] rounded-xl border border-border bg-white px-3 text-sm font-medium text-text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              >
                <option value="all">All Accounts</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <select
                value={range} onChange={(e) => setRange(e.target.value)}
                className="h-11 min-w-[150px] rounded-xl border border-border bg-white px-3 text-sm font-medium text-text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              >
                {RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>

          {loading && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
              {[...Array(6)].map((_, i) => <Card key={i} padded><LoadingSkeleton className="h-3 w-16" /><LoadingSkeleton className="mt-3 h-6 w-16" /></Card>)}
            </div>
          )}

          {!loading && error && (
            <Card className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-danger"><AlertTriangle className="h-5 w-5" /></div>
              <p className="text-sm font-semibold text-text-primary">Couldn't load your dashboard</p>
              <p className="max-w-xs text-sm text-text-muted">{error}</p>
              <Button variant="secondary" icon={RefreshCw} onClick={refresh}>Retry</Button>
            </Card>
          )}

          {!loading && !error && (
            <div className="flex flex-col gap-6">
              {/* KPIs */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
                <Kpi icon={DollarSign} iconBg={stats.net >= 0 ? 'bg-green-50 text-success' : 'bg-red-50 text-danger'} label="Net P&L"
                  value={money(stats.net)} valueTone={tone(stats.net)} delta={deltaPct(stats.net, prev.net)} hint="Closed trades" />
                <Kpi icon={Target} iconBg="bg-blue-50 text-brand" label="Win Rate" value={`${stats.winRate.toFixed(1)}%`}
                  delta={deltaPct(stats.winRate, prev.winRate)} hint={`${stats.wins}W · ${stats.losses}L · ${stats.be}BE`} />
                <Kpi icon={TrendingUp} iconBg="bg-violet-50 text-ai" label="Average RR" value={`1:${stats.avgRR.toFixed(2)}`}
                  delta={deltaPct(stats.avgRR, prev.avgRR)} hint="Planned reward" />
                <Kpi icon={Hash} iconBg="bg-blue-50 text-brand" label="Total Trades" value={stats.total}
                  delta={deltaPct(stats.total, prev.total)} hint={`${stats.resolved} closed`} />
                <Kpi icon={Scale} iconBg="bg-amber-50 text-warning" label="Profit Factor"
                  value={stats.profitFactor == null ? '—' : stats.profitFactor === Infinity ? '∞' : stats.profitFactor.toFixed(2)}
                  valueTone={stats.profitFactor != null && stats.profitFactor < 1 ? 'text-danger' : 'text-text-primary'} hint="Profit ÷ loss" />
                <Kpi icon={ShieldAlert} iconBg="bg-red-50 text-danger" label="Max Drawdown"
                  value={stats.maxDd > 0 ? `-$${stats.maxDd.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '$0'}
                  valueTone={stats.maxDd > 0 ? 'text-danger' : 'text-text-primary'} hint={`Avg risk ${stats.avgRisk.toFixed(2)}%`} />
              </div>

              {/* Equity + donut */}
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <Card className="xl:col-span-2">
                  <SectionHead icon={Activity} iconBg="bg-violet-50 text-ai" title="Equity Curve" sub="Cumulative P&L of your closed trades"
                    right={<span className={`tabular-nums text-sm font-bold ${tone(stats.net)}`}>{money(stats.net)}</span>} />
                  {stats.curve.length > 1 ? (
                    <div className="h-[280px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={stats.curve} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="dashEquity" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={curveColor} stopOpacity={0.25} />
                              <stop offset="100%" stopColor={curveColor} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                          <XAxis dataKey="n" tickFormatter={(n) => (n === 0 ? 'Start' : `#${n}`)} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                          <YAxis tickFormatter={(v) => `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString()}`} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={64} />
                          <Tooltip content={<CurveTip />} />
                          <Area type="monotone" dataKey="value" stroke={curveColor} strokeWidth={2.5} fill="url(#dashEquity)" baseValue={0} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : <Empty text="No closed trades in this range yet." />}
                </Card>

                <Card className="flex flex-col">
                  <SectionHead icon={Target} title="Trade Results" sub="Win / loss distribution" />
                  {stats.resolved === 0 ? <Empty text="No closed trades yet." /> : (
                    <>
                      <div className="relative mx-auto h-44 w-44">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={donut} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={3} strokeWidth={0}>
                              {donut.map((d) => <Cell key={d.key} fill={PIE_COLORS[d.key]} />)}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                          <p className="text-2xl font-bold text-text-primary">{stats.resolved}</p>
                          <p className="text-xs text-text-muted">Closed</p>
                        </div>
                      </div>
                      <div className="mt-5 flex flex-col gap-3">
                        {[['WIN', 'Wins', stats.wins], ['LOSS', 'Losses', stats.losses], ['BREAK_EVEN', 'Breakeven', stats.be]].map(([k, l, v]) => (
                          <div key={k} className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2 text-text-secondary"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[k] }} />{l}</span>
                            <span className="tabular-nums font-semibold text-text-primary">{v} <span className="ml-1 text-xs font-normal text-text-muted">({pct(v, stats.resolved)}%)</span></span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </Card>
              </div>

              {/* Weekly + performance + rules */}
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <Card>
                  <SectionHead icon={BookOpen} title="Weekly P&L" sub="Last 8 weeks" />
                  <div className="h-[230px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={weekly} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={48} />
                        <Tooltip
                          formatter={(v) => [money(v), 'P&L']}
                          labelFormatter={(l) => `Week of ${l}`}
                          contentStyle={{ borderRadius: 12, border: '1px solid #E5E7EB', fontSize: 12 }}
                        />
                        <Bar dataKey="pnl" radius={[5, 5, 0, 0]} maxBarSize={28}>
                          {weekly.map((w, i) => <Cell key={i} fill={w.pnl >= 0 ? '#16A34A' : '#DC2626'} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card>
                  <SectionHead icon={TrendingUp} title="Performance" sub="Net P&L breakdown"
                    right={<Segmented value={perfView} onChange={setPerfView} options={[['pair', 'Pair'], ['setup', 'Setup'], ['session', 'Session']]} />} />
                  {perf.length === 0 ? <Empty text="No closed trades yet." /> : (
                    <div className="flex flex-col gap-3.5">
                      {perf.map((p) => (
                        <div key={p.key}>
                          <div className="mb-1.5 flex items-center justify-between text-sm">
                            <span className="font-semibold text-text-primary">{p.key}</span>
                            <span className={`tabular-nums font-semibold ${tone(p.pnl)}`}>{money(p.pnl)}</span>
                          </div>
                          <ProgressBar value={(Math.abs(p.pnl) / maxAbs) * 100} tone={p.pnl >= 0 ? 'success' : 'danger'} />
                          <p className="mt-1 text-xs text-text-muted">{p.count} trades · {pct(p.wins, p.count)}% win rate</p>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card>
                  <SectionHead icon={Shield} iconBg="bg-amber-50 text-warning"
                    title={ruleAccount ? 'Prop Firm Rules' : 'Accounts'}
                    sub={ruleAccount ? ruleAccount.name : 'Select an account to track its rules'}
                    right={<button onClick={() => navigate('/accounts')} className="text-xs font-medium text-brand hover:underline">Manage</button>} />
                  {ruleAccount && rules ? (
                    rules.target || rules.daily || rules.dd ? (
                      <div className="flex flex-col gap-4">
                        {rules.target && <RuleBar label="Profit Target" value={`${money(rules.total)} / $${rules.target.limit.toLocaleString()}`} sub={`${rules.target.pct}% target`} progress={rules.target.progress} barTone="success" />}
                        {rules.daily && <RuleBar label="Daily Loss" value={`$${rules.daily.used.toFixed(2)} / $${rules.daily.limit.toFixed(2)}`} sub={`Today ${money(rules.today)} · limit ${rules.daily.pct}%`} progress={rules.daily.progress} barTone={usageTone(rules.daily.progress)} />}
                        {rules.dd && <RuleBar label="Max Drawdown" value={`$${rules.dd.used.toFixed(2)} / $${rules.dd.limit.toFixed(2)}`} sub={`Limit ${rules.dd.pct}% of starting balance`} progress={rules.dd.progress} barTone={usageTone(rules.dd.progress)} />}
                      </div>
                    ) : <Empty text="No rules set. Add them in Accounts → Edit." />
                  ) : accounts.length === 0 ? <Empty text="No accounts yet." /> : (
                    <div className="flex flex-col gap-2.5">
                      {accounts.slice(0, 5).map((a) => {
                        const p = Number(a.current_balance || 0) - Number(a.starting_balance || 0)
                        return (
                          <button key={a.id} onClick={() => setAccountId(a.id)} className="flex items-center justify-between rounded-xl border border-border p-3 text-left transition-colors hover:bg-surface">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-brand"><Wallet className="h-4 w-4" /></div>
                              <div>
                                <p className="text-sm font-semibold text-text-primary">{a.name}</p>
                                <p className="text-xs text-text-muted">${Number(a.current_balance || 0).toLocaleString()}</p>
                              </div>
                            </div>
                            <span className={`tabular-nums text-sm font-semibold ${tone(p)}`}>{money(p)}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </Card>
              </div>

              {/* Recent trades + discipline */}
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <Card padded={false} className="overflow-hidden xl:col-span-2">
                  <div className="flex items-center justify-between border-b border-border px-6 py-4">
                    <h3 className="text-[16px] font-semibold text-text-primary">Recent Trades</h3>
                    <button onClick={() => navigate('/journal')} className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">View journal <ArrowRight className="h-3.5 w-3.5" /></button>
                  </div>
                  {recent.length === 0 ? <div className="p-6"><Empty text="No trades in this range." /></div> : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-border bg-surface/60 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                            <th className="py-3 pl-6 pr-4">Date</th><th className="py-3 pr-4">Account</th><th className="py-3 pr-4">Pair</th>
                            <th className="py-3 pr-4">Setup</th><th className="py-3 pr-4">RR</th><th className="py-3 pr-4">P&L</th><th className="py-3 pr-6">Result</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recent.map((t) => (
                            <tr key={t.id} onClick={() => navigate('/journal')} className="cursor-pointer border-b border-border/70 transition-colors last:border-0 hover:bg-surface">
                              <td className="py-3 pl-6 pr-4 text-text-muted">{t.opened_at ? shortDate(new Date(t.opened_at)) : '—'}</td>
                              <td className="py-3 pr-4 text-text-secondary">{accountsById[t.account_id]?.name || '—'}</td>
                              <td className="py-3 pr-4">
                                <span className={`inline-flex items-center gap-1 font-semibold ${t.direction === 'BUY' ? 'text-success' : 'text-danger'}`}>
                                  {t.direction === 'BUY' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{t.symbol}
                                </span>
                              </td>
                              <td className="py-3 pr-4 text-text-secondary">{t.setup || '—'}</td>
                              <td className="py-3 pr-4 tabular-nums text-text-secondary">{t.rr || '—'}</td>
                              <td className={`py-3 pr-4 tabular-nums font-semibold ${tone(pnlOf(t))}`}>{money(pnlOf(t))}</td>
                              <td className="py-3 pr-6"><Badge tone={resultTone[t.result] || 'neutral'}>{resultLabel[t.result] || 'OPEN'}</Badge></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>

                <Card>
                  <SectionHead icon={Flame} iconBg="bg-orange-50 text-warning" title="Today's Discipline" sub="Routine and worship"
                    right={<button onClick={() => navigate('/daily-routine')} className="text-xs font-medium text-brand hover:underline">Open</button>} />
                  <div className="flex flex-col gap-4">
                    <div>
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <span className="text-text-secondary">Daily Routine</span>
                        <span className="tabular-nums font-semibold text-text-primary">{discipline.today.done}/{discipline.today.total} · {discipline.today.pct}%</span>
                      </div>
                      <ProgressBar value={discipline.today.pct} tone="brand" />
                    </div>
                    <div>
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5 text-text-secondary"><Moon className="h-3.5 w-3.5" /> Daily Worship</span>
                        <span className="tabular-nums font-semibold text-text-primary">{Math.round((discipline.worshipDone / discipline.worshipTotal) * 10)}/10</span>
                      </div>
                      <ProgressBar value={pct(discipline.worshipDone, discipline.worshipTotal)} tone="success" />
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-medium text-text-muted">Routine · last 7 days</p>
                      <div className="h-[110px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={discipline.week} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                            <YAxis hide domain={[0, 100]} />
                            <Tooltip formatter={(v) => [`${v}%`, 'Done']} contentStyle={{ borderRadius: 12, border: '1px solid #E5E7EB', fontSize: 12 }} />
                            <Bar dataKey="pct" radius={[4, 4, 0, 0]} maxBarSize={22}>
                              {discipline.week.map((w, i) => <Cell key={i} fill={w.pct >= 80 ? '#16A34A' : w.pct >= 50 ? '#F59E0B' : '#CBD5E1'} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Backtesting / Learning / Plan */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <Card>
                  <SectionHead icon={History} iconBg="bg-violet-50 text-ai" title="Backtesting" sub="Strategy testing in pips"
                    right={<button onClick={() => navigate('/backtesting')} className="text-xs font-medium text-brand hover:underline">Open</button>} />
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      ['Total Tests', bt.total, 'text-text-primary'],
                      ['This Month', bt.thisMonth, 'text-text-primary'],
                      ['Win Rate', `${bt.winRate.toFixed(1)}%`, 'text-brand'],
                      ['Net Pips', `${bt.net >= 0 ? '+' : ''}${bt.net.toFixed(1)}`, tone(bt.net)],
                    ].map(([l, v, c]) => (
                      <div key={l} className="rounded-xl bg-surface p-3">
                        <p className="text-[11px] text-text-muted">{l}</p>
                        <p className={`tabular-nums mt-0.5 text-lg font-bold ${c}`}>{v}</p>
                      </div>
                    ))}
                  </div>
                </Card>

                <Card>
                  <SectionHead icon={GraduationCap} iconBg="bg-blue-50 text-brand" title="Learning Hub" sub="Your study progress"
                    right={<button onClick={() => navigate('/learning-hub')} className="text-xs font-medium text-brand hover:underline">Open</button>} />
                  <div className="mb-3">
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="text-text-secondary">Completed</span>
                      <span className="tabular-nums font-semibold text-text-primary">{learning.completed}/{learning.total}</span>
                    </div>
                    <ProgressBar value={pct(learning.completed, learning.total)} tone="brand" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-surface p-3"><p className="text-[11px] text-text-muted">In Progress</p><p className="tabular-nums mt-0.5 text-lg font-bold text-text-primary">{learning.inProgress}</p></div>
                    <div className="rounded-xl bg-surface p-3"><p className="text-[11px] text-text-muted">Watch Time</p><p className="tabular-nums mt-0.5 text-lg font-bold text-text-primary">{learning.time}</p></div>
                  </div>
                </Card>

                <Card>
                  <SectionHead icon={ClipboardList} iconBg="bg-green-50 text-success" title="Trading Plan" sub="Rules you committed to"
                    right={<button onClick={() => navigate('/plan')} className="text-xs font-medium text-brand hover:underline">Open</button>} />
                  {plan ? (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center gap-2">
                        <Badge tone="brand">{plan.strategies?.length || 0} strategies</Badge>
                        <Badge tone="neutral">{plan.conditions?.pairs?.length || 0} pairs</Badge>
                        <Badge tone="danger">{plan.noTrade?.length || 0} no-trade rules</Badge>
                      </div>
                      <div className="flex flex-col gap-2">
                        {(plan.noTrade || []).slice(0, 3).map((r, i) => (
                          <div key={r.id || i} className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50/40 p-2.5">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-danger text-[11px] font-bold text-white">{i + 1}</span>
                            <p className="text-xs font-medium text-text-primary">{r.title}</p>
                          </div>
                        ))}
                        {(plan.noTrade || []).length === 0 && <p className="text-xs text-text-muted">No restrictions added yet.</p>}
                      </div>
                    </div>
                  ) : <Empty text="No plan found." />}
                </Card>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}