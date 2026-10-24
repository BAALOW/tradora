import { useMemo, useState } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  Activity, AlertTriangle, BarChart3, Brain, Calendar, CheckCircle2, Clock, DollarSign, Flame, History,
  Lightbulb, RefreshCw, RotateCcw, Scale, ShieldAlert, Target, TrendingDown, TrendingUp, Trophy,
} from 'lucide-react'

import Sidebar from '../components/layout/Sidebar'
import Topbar from '../components/layout/Topbar'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import ProgressBar from '../components/ui/ProgressBar'
import LoadingSkeleton from '../components/ui/LoadingSkeleton'

import { useAccounts } from '../hooks/useAccounts'
import { useTrades } from '../hooks/useTrades'
import { useBacktestTrades } from '../hooks/useBacktestTrades'

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

const pad = (n) => String(n).padStart(2, '0')
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const pnlOf = (t) => Number(t.net_profit ?? t.profit ?? 0) || 0
const isResolved = (t) => t.result === 'WIN' || t.result === 'LOSS' || t.result === 'BREAK_EVEN'
const timeOf = (t) => { const d = new Date(t.opened_at || t.closed_at || 0); return Number.isNaN(d.getTime()) ? 0 : d.getTime() }
const parseRR = (rr) => parseFloat(String(rr ?? '').split(':')[1]) || 0
const pct = (a, b) => (b > 0 ? (a / b) * 100 : 0)
const deltaPct = (cur, prev) => (!prev ? null : ((cur - prev) / Math.abs(prev)) * 100)
const tone = (v) => (v > 0 ? 'text-success' : v < 0 ? 'text-danger' : 'text-text-secondary')
const money = (n) => {
  const v = Number(n || 0)
  return `${v >= 0 ? '+' : '-'}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
const shortDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

const RANGES = [
  { value: '7d', label: 'Last 7 Days', days: 7 },
  { value: '30d', label: 'Last 30 Days', days: 30 },
  { value: '90d', label: 'Last 90 Days', days: 90 },
  { value: '365d', label: 'Last 12 Months', days: 365 },
  { value: 'all', label: 'All Time', days: null },
]
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const PIE = { win: '#16A34A', loss: '#DC2626', be: '#9CA3AF', brand: '#2563EB' }
const defaultFilters = { account: 'all', range: '90d', symbol: 'all', setup: 'all', session: 'all' }

function core(trades) {
  const list = trades.filter(isResolved).sort((a, b) => timeOf(a) - timeOf(b))
  const pnls = list.map(pnlOf)
  const winsArr = pnls.filter((p) => p > 0)
  const lossArr = pnls.filter((p) => p < 0)
  const grossProfit = winsArr.reduce((a, b) => a + b, 0)
  const grossLoss = Math.abs(lossArr.reduce((a, b) => a + b, 0))
  const net = grossProfit - grossLoss

  let cum = 0, peak = 0, maxDd = 0, curW = 0, curL = 0, maxW = 0, maxL = 0
  const curve = [{ n: 0, label: 'Start', symbol: null, equity: 0, dd: 0 }]
  list.forEach((t, i) => {
    const p = pnlOf(t)
    cum += p
    peak = Math.max(peak, cum)
    maxDd = Math.max(maxDd, peak - cum)
    if (p > 0) { curW++; curL = 0 } else if (p < 0) { curL++; curW = 0 } else { curW = 0; curL = 0 }
    maxW = Math.max(maxW, curW)
    maxL = Math.max(maxL, curL)
    curve.push({
      n: i + 1, symbol: t.symbol,
      label: t.opened_at ? shortDate(new Date(t.opened_at)) : `#${i + 1}`,
      equity: Math.round(cum * 100) / 100,
      dd: Math.round((cum - peak) * 100) / 100,
    })
  })

  const wins = list.filter((t) => t.result === 'WIN').length
  const losses = list.filter((t) => t.result === 'LOSS').length
  const be = list.filter((t) => t.result === 'BREAK_EVEN').length
  const rrs = trades.map((t) => parseRR(t.rr)).filter((n) => n > 0)
  const avgWin = winsArr.length ? grossProfit / winsArr.length : 0
  const avgLoss = lossArr.length ? grossLoss / lossArr.length : 0

  return {
    total: trades.length, resolved: list.length, wins, losses, be, net,
    winRate: pct(wins, list.length),
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : null,
    expectancy: list.length ? net / list.length : 0,
    avgWin, avgLoss,
    payoff: avgLoss > 0 ? avgWin / avgLoss : null,
    avgRR: rrs.length ? rrs.reduce((a, b) => a + b, 0) / rrs.length : 0,
    maxDd, maxW, maxL,
    best: pnls.length ? Math.max(...pnls) : 0,
    worst: pnls.length ? Math.min(...pnls) : 0,
    curve,
  }
}

function groupBy(trades, keyFn) {
  const map = new Map()
  trades.filter(isResolved).forEach((t) => {
    const k = keyFn(t)
    if (k == null || k === '') return
    if (!map.has(k)) map.set(k, { key: k, count: 0, wins: 0, losses: 0, pnl: 0, gp: 0, gl: 0, rrs: [] })
    const g = map.get(k)
    const p = pnlOf(t)
    g.count++
    if (t.result === 'WIN') g.wins++
    if (t.result === 'LOSS') g.losses++
    g.pnl += p
    if (p > 0) g.gp += p
    if (p < 0) g.gl += Math.abs(p)
    const rr = parseRR(t.rr)
    if (rr > 0) g.rrs.push(rr)
  })
  return [...map.values()].map((g) => ({
    ...g,
    winRate: pct(g.wins, g.count),
    pf: g.gl > 0 ? g.gp / g.gl : g.gp > 0 ? Infinity : null,
    avgRR: g.rrs.length ? g.rrs.reduce((a, b) => a + b, 0) / g.rrs.length : 0,
  }))
}

/* ------------------------------------------------------------------ */
/* UI pieces                                                            */
/* ------------------------------------------------------------------ */

function Head({ icon: Icon, iconBg = 'bg-blue-50 text-brand', title, sub, right }) {
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
      {delta != null ? (
        <span className={`inline-flex w-fit items-center gap-1 text-xs font-medium ${delta >= 0 ? 'text-success' : 'text-danger'}`}>
          {delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {delta >= 0 ? '+' : ''}{delta.toFixed(0)}% vs previous
        </span>
      ) : <span className="text-[11px] text-text-muted">{hint || ' '}</span>}
    </Card>
  )
}

function Empty({ text, h = 'h-44' }) {
  return <div className={`flex ${h} items-center justify-center rounded-xl border border-dashed border-border px-4 text-center text-sm text-text-muted`}>{text}</div>
}

function Segmented({ value, onChange, options }) {
  return (
    <div className="flex items-center rounded-lg border border-border p-0.5">
      {options.map(([k, l]) => (
        <button key={k} type="button" onClick={() => onChange(k)}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${value === k ? 'bg-brand text-white' : 'text-text-secondary hover:bg-surface'}`}>{l}</button>
      ))}
    </div>
  )
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="flex min-w-[140px] flex-col gap-1.5">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="h-11 rounded-xl border border-border bg-white px-3 text-sm font-medium text-text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
}

function PnlTip({ active, payload, label, suffix = '' }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-xl border border-border bg-white px-3 py-2 text-xs shadow-popover">
      <p className="font-semibold text-text-primary">{p.name || label}</p>
      <p className={`mt-1 tabular-nums font-semibold ${tone(p.pnl)}`}>{money(p.pnl)}</p>
      {p.count != null && <p className="text-text-muted">{p.count} trades{suffix}</p>}
    </div>
  )
}

function CurveTip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  const v = payload[0].dataKey === 'dd' ? p.dd : p.equity
  return (
    <div className="rounded-xl border border-border bg-white px-3 py-2 text-xs shadow-popover">
      <p className="font-semibold text-text-primary">{p.n === 0 ? 'Start' : `#${p.n} · ${p.symbol || 'Trade'}`}</p>
      <p className="text-text-muted">{p.label}</p>
      <p className={`mt-1 tabular-nums font-semibold ${tone(v)}`}>{money(v)}</p>
    </div>
  )
}

function BreakdownTable({ title, icon, iconBg, rows, emptyText }) {
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.pnl)))
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="border-b border-border px-6 py-4">
        <Head icon={icon} iconBg={iconBg} title={title} sub="Sorted by net P&L" />
      </div>
      {rows.length === 0 ? <div className="p-6"><Empty text={emptyText} h="h-32" /></div> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-surface/60 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                <th className="py-3 pl-6 pr-4">Name</th><th className="py-3 pr-4">Trades</th>
                <th className="py-3 pr-4">Win Rate</th><th className="py-3 pr-4">Avg RR</th>
                <th className="py-3 pr-4">PF</th><th className="py-3 pr-6">P&L</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-border/70 last:border-0 hover:bg-surface">
                  <td className="py-3 pl-6 pr-4 font-semibold text-text-primary">{r.key}</td>
                  <td className="py-3 pr-4 tabular-nums text-text-secondary">{r.count}</td>
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <ProgressBar value={r.winRate} tone={r.winRate >= 50 ? 'success' : 'warning'} className="w-20" />
                      <span className="tabular-nums text-xs font-semibold text-text-secondary">{r.winRate.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 tabular-nums text-text-secondary">{r.avgRR ? `1:${r.avgRR.toFixed(2)}` : '—'}</td>
                  <td className={`py-3 pr-4 tabular-nums font-medium ${r.pf != null && r.pf < 1 ? 'text-danger' : 'text-text-primary'}`}>{r.pf == null ? '—' : r.pf === Infinity ? '∞' : r.pf.toFixed(2)}</td>
                  <td className="py-3 pr-6">
                    <span className={`tabular-nums font-semibold ${tone(r.pnl)}`}>{money(r.pnl)}</span>
                    <div className="mt-1 h-1 w-24 rounded-full bg-surface"><div className={`h-1 rounded-full ${r.pnl >= 0 ? 'bg-success' : 'bg-danger'}`} style={{ width: `${(Math.abs(r.pnl) / maxAbs) * 100}%` }} /></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function FactorCard({ title, icon, iconBg, groups }) {
  return (
    <Card>
      <Head icon={icon} iconBg={iconBg} title={title} sub="Win rate and P&L for each choice" />
      {groups.every((g) => g.length === 0) ? <Empty text="Not enough data yet." h="h-32" /> : (
        <div className="flex flex-col gap-5">
          {groups.map((rows, gi) => rows.length > 0 && (
            <div key={gi}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">{rows[0].label}</p>
              <div className="flex flex-col gap-2.5">
                {rows.map((r) => (
                  <div key={r.key}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-text-secondary">{r.key} <span className="text-xs text-text-muted">({r.count})</span></span>
                      <span className="tabular-nums text-xs"><b className="text-text-primary">{r.winRate.toFixed(0)}%</b> · <span className={tone(r.pnl)}>{money(r.pnl)}</span></span>
                    </div>
                    <ProgressBar value={r.winRate} tone={r.winRate >= 50 ? 'success' : 'warning'} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

export default function Analytics() {
  const { accounts = [] } = useAccounts()
  const { trades: allTrades = [], loading, error, refresh } = useTrades()
  const { trades: btTrades = [] } = useBacktestTrades()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [filters, setFilters] = useState(defaultFilters)
  const [curveView, setCurveView] = useState('equity')
  const [timeView, setTimeView] = useState('day')
  const set = (k) => (v) => setFilters((f) => ({ ...f, [k]: v }))

  const symbols = useMemo(() => [...new Set(allTrades.map((t) => t.symbol).filter(Boolean))], [allTrades])
  const setups = useMemo(() => [...new Set(allTrades.map((t) => t.setup).filter(Boolean))], [allTrades])
  const sessions = useMemo(() => [...new Set(allTrades.map((t) => t.session).filter(Boolean))], [allTrades])

  const rangeDays = RANGES.find((r) => r.value === filters.range)?.days

  const base = useMemo(() => allTrades.filter((t) => {
    if (filters.account !== 'all' && t.account_id !== filters.account) return false
    if (filters.symbol !== 'all' && t.symbol !== filters.symbol) return false
    if (filters.setup !== 'all' && t.setup !== filters.setup) return false
    if (filters.session !== 'all' && t.session !== filters.session) return false
    return true
  }), [allTrades, filters])

  const current = useMemo(() => {
    if (!rangeDays) return base
    const cutoff = addDays(new Date(), -rangeDays).getTime()
    return base.filter((t) => timeOf(t) >= cutoff)
  }, [base, rangeDays])

  const previous = useMemo(() => {
    if (!rangeDays) return []
    const end = addDays(new Date(), -rangeDays).getTime()
    const start = addDays(new Date(), -rangeDays * 2).getTime()
    return base.filter((t) => timeOf(t) >= start && timeOf(t) < end)
  }, [base, rangeDays])

  const s = useMemo(() => core(current), [current])
  const p = useMemo(() => core(previous), [previous])

  /* ----- breakdowns ----- */
  const byPair = useMemo(() => groupBy(current, (t) => t.symbol).sort((a, b) => b.pnl - a.pnl), [current])
  const bySetup = useMemo(() => groupBy(current, (t) => t.setup).sort((a, b) => b.pnl - a.pnl), [current])
  const bySession = useMemo(() => groupBy(current, (t) => t.session).sort((a, b) => b.pnl - a.pnl), [current])
  const byDirection = useMemo(() => groupBy(current, (t) => (t.direction === 'BUY' ? 'Buy' : t.direction === 'SELL' ? 'Sell' : null)).sort((a, b) => b.pnl - a.pnl), [current])

  const weekday = useMemo(() => {
    const g = groupBy(current, (t) => (t.opened_at ? new Date(t.opened_at).getDay() : null))
    return DAYS.map((name, i) => {
      const r = g.find((x) => x.key === i)
      return { name, pnl: r ? Math.round(r.pnl * 100) / 100 : 0, count: r?.count || 0, winRate: r?.winRate || 0 }
    })
  }, [current])

  const hourly = useMemo(() => {
    const g = groupBy(current, (t) => (t.opened_at ? new Date(t.opened_at).getHours() : null))
    return g.sort((a, b) => a.key - b.key).map((r) => ({
      name: `${pad(r.key)}:00`, pnl: Math.round(r.pnl * 100) / 100, count: r.count, winRate: r.winRate,
    }))
  }, [current])

  const monthly = useMemo(() => {
    const g = groupBy(current, (t) => (t.opened_at ? t.opened_at.slice(0, 7) : null)).sort((a, b) => a.key.localeCompare(b.key)).slice(-12)
    return g.map((r) => {
      const [y, m] = r.key.split('-')
      return { name: new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), pnl: Math.round(r.pnl * 100) / 100, count: r.count }
    })
  }, [current])

  const rrBuckets = useMemo(() => {
    const bucket = (t) => {
      const rr = parseRR(t.rr)
      if (!rr) return null
      return rr < 1 ? 'Below 1:1' : rr < 2 ? '1:1 – 1:2' : rr < 3 ? '1:2 – 1:3' : '1:3 and above'
    }
    const order = ['Below 1:1', '1:1 – 1:2', '1:2 – 1:3', '1:3 and above']
    return groupBy(current, bucket).sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
  }, [current])

  const withLabel = (rows, label) => rows.map((r) => ({ ...r, label }))
  const trendG = useMemo(() => withLabel(groupBy(current, (t) => t.trend_type), '1. Trend'), [current])
  const zoneG = useMemo(() => withLabel(groupBy(current, (t) => t.supply_demand_zone), '2. Supply & Demand Zone'), [current])
  const liqG = useMemo(() => withLabel(groupBy(current, (t) => t.liquidity_manipulation), '3. Liquidity & Manipulation'), [current])
  const cbG = useMemo(() => withLabel(groupBy(current, (t) => t.counter_break), '4. Counter Break'), [current])
  const emotionG = useMemo(() => groupBy(current, (t) => t.emotion).sort((a, b) => b.pnl - a.pnl).map((r) => ({ ...r, label: 'Emotion' })), [current])
  const outcomeG = useMemo(() => {
    const names = { FULL_TP: 'Full TP', TP1_ONLY: 'TP1 Only', BREAK_EVEN: 'Break Even', LOSS: 'Loss', OPEN: 'Still Open' }
    return groupBy(current, (t) => t.outcome || (t.result === 'WIN' ? 'FULL_TP' : t.result === 'LOSS' ? 'LOSS' : t.result === 'BREAK_EVEN' ? 'BREAK_EVEN' : null))
      .map((r) => ({ ...r, key: names[r.key] || r.key })).sort((a, b) => b.count - a.count)
  }, [current])

  /* ----- backtest vs live ----- */
  const bt = useMemo(() => {
    const wins = btTrades.filter((t) => t.result === 'WIN').length
    const losses = btTrades.filter((t) => t.result === 'LOSS').length
    const done = wins + losses + btTrades.filter((t) => t.result === 'BREAK_EVEN').length
    const rrs = btTrades.map((t) => parseRR(t.rr)).filter((n) => n > 0)
    return { total: btTrades.length, winRate: pct(wins, done), avgRR: rrs.length ? rrs.reduce((a, b) => a + b, 0) / rrs.length : 0 }
  }, [btTrades])

  /* ----- insights ----- */
  const insights = useMemo(() => {
    const out = []
    if (s.resolved < 3) return out
    const need = s.avgRR > 0 ? (1 / (1 + s.avgRR)) * 100 : null
    if (need != null) {
      out.push(s.winRate >= need
        ? { tone: 'success', title: 'You are above the break-even win rate', text: `With an average RR of 1:${s.avgRR.toFixed(2)} you need ${need.toFixed(0)}% wins to break even. Your win rate is ${s.winRate.toFixed(0)}%.` }
        : { tone: 'danger', title: 'Win rate is below break-even', text: `With an average RR of 1:${s.avgRR.toFixed(2)} you need ${need.toFixed(0)}% wins to break even, but you are at ${s.winRate.toFixed(0)}%. Improve selectivity or raise your RR.` })
    }
    if (s.profitFactor != null && s.profitFactor !== Infinity) {
      out.push(s.profitFactor >= 1.5
        ? { tone: 'success', title: 'Strong profit factor', text: `Profit factor is ${s.profitFactor.toFixed(2)}. Your winners pay for your losers comfortably.` }
        : s.profitFactor < 1
          ? { tone: 'danger', title: 'Losses are bigger than profits', text: `Profit factor is ${s.profitFactor.toFixed(2)}. Review your stop placement and your worst trades.` }
          : { tone: 'warning', title: 'Profit factor is thin', text: `Profit factor is ${s.profitFactor.toFixed(2)}. A small drop in win rate could turn this negative.` })
    }
    const pick = (rows, fn) => rows.filter((r) => r.count >= 2).sort(fn)[0]
    const bestPair = pick(byPair, (a, b) => b.pnl - a.pnl)
    if (bestPair && bestPair.pnl > 0) out.push({ tone: 'success', title: `${bestPair.key} is your best pair`, text: `${money(bestPair.pnl)} from ${bestPair.count} trades with a ${bestPair.winRate.toFixed(0)}% win rate.` })
    const worstPair = pick(byPair, (a, b) => a.pnl - b.pnl)
    if (worstPair && worstPair.pnl < 0) out.push({ tone: 'danger', title: `${worstPair.key} is costing you`, text: `${money(worstPair.pnl)} from ${worstPair.count} trades. Consider trading it less or reviewing the setups.` })
    const worstSetup = pick(bySetup, (a, b) => a.pnl - b.pnl)
    if (worstSetup && worstSetup.pnl < 0) out.push({ tone: 'warning', title: `Weak setup: ${worstSetup.key}`, text: `${money(worstSetup.pnl)} across ${worstSetup.count} trades (${worstSetup.winRate.toFixed(0)}% win rate).` })
    const days = weekday.filter((d) => d.count >= 2)
    if (days.length) {
      const bd = [...days].sort((a, b) => b.pnl - a.pnl)[0]
      const wd = [...days].sort((a, b) => a.pnl - b.pnl)[0]
      if (bd.pnl > 0) out.push({ tone: 'success', title: `${bd.name} is your strongest day`, text: `${money(bd.pnl)} over ${bd.count} trades.` })
      if (wd.pnl < 0 && wd.name !== bd.name) out.push({ tone: 'warning', title: `${wd.name} is your weakest day`, text: `${money(wd.pnl)} over ${wd.count} trades. Consider skipping it or trading smaller.` })
    }
    const badEmotion = emotionG.filter((r) => r.count >= 2 && r.pnl < 0).sort((a, b) => a.pnl - b.pnl)[0]
    if (badEmotion) out.push({ tone: 'danger', title: `Trading while "${badEmotion.key}" hurts`, text: `${money(badEmotion.pnl)} across ${badEmotion.count} trades. Step away from the screen in this state.` })
    if (s.maxL >= 3) out.push({ tone: 'warning', title: `Longest losing streak: ${s.maxL}`, text: 'After 2 losses in a row, pause and review before the next trade.' })
    return out.slice(0, 6)
  }, [s, byPair, bySetup, weekday, emotionG])

  const donut = [
    { key: 'win', name: 'Wins', value: s.wins },
    { key: 'loss', name: 'Losses', value: s.losses },
    { key: 'be', name: 'Breakeven', value: s.be },
  ].filter((d) => d.value > 0)
  const curveColor = curveView === 'dd' ? '#DC2626' : s.net >= 0 ? '#16A34A' : '#DC2626'
  const timeData = timeView === 'day' ? weekday : hourly
  const alertStyle = { success: 'bg-green-50 text-success border-green-100', danger: 'bg-red-50 text-danger border-red-100', warning: 'bg-amber-50 text-warning border-amber-100' }

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onMenuClick={() => setSidebarOpen(true)}
          accounts={accounts.map((a) => ({ id: a.id, label: a.name, status: a.mt5_connected ? 'connected' : 'disconnected' }))}
          selectedAccount={filters.account === 'all' ? { label: 'All Accounts' } : { label: accounts.find((a) => a.id === filters.account)?.name || 'Account' }}
          onSelectAccount={(a) => set('account')(a.id)}
          breadcrumb="Analytics / Analytics"
        />

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-start gap-3">
            <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-brand"><BarChart3 className="h-5 w-5" /></div>
            <div>
              <h1 className="text-[28px] font-bold tracking-tight text-text-primary sm:text-[32px]">Analytics</h1>
              <p className="mt-1 text-sm text-text-secondary">Understand what works, what does not, and where your edge really is.</p>
            </div>
          </div>

          <div className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-card">
            <div className="flex flex-wrap items-end gap-3">
              <FilterSelect label="Account" value={filters.account} onChange={set('account')} options={[['all', 'All Accounts'], ...accounts.map((a) => [a.id, a.name])]} />
              <FilterSelect label="Period" value={filters.range} onChange={set('range')} options={RANGES.map((r) => [r.value, r.label])} />
              <FilterSelect label="Pair" value={filters.symbol} onChange={set('symbol')} options={[['all', 'All Pairs'], ...symbols.map((x) => [x, x])]} />
              <FilterSelect label="Setup" value={filters.setup} onChange={set('setup')} options={[['all', 'All Setups'], ...setups.map((x) => [x, x])]} />
              <FilterSelect label="Session" value={filters.session} onChange={set('session')} options={[['all', 'All Sessions'], ...sessions.map((x) => [x, x])]} />
              <Button variant="ghost" size="md" icon={RotateCcw} onClick={() => setFilters(defaultFilters)}>Reset</Button>
            </div>
          </div>

          {loading && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[...Array(8)].map((_, i) => <Card key={i} padded><LoadingSkeleton className="h-3 w-16" /><LoadingSkeleton className="mt-3 h-6 w-16" /></Card>)}
            </div>
          )}

          {!loading && error && (
            <Card className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-danger"><AlertTriangle className="h-5 w-5" /></div>
              <p className="text-sm font-semibold text-text-primary">Couldn't load analytics</p>
              <p className="max-w-xs text-sm text-text-muted">{error}</p>
              <Button variant="secondary" icon={RefreshCw} onClick={refresh}>Retry</Button>
            </Card>
          )}

          {!loading && !error && (
            <div className="flex flex-col gap-6">
              {/* KPIs */}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Kpi icon={DollarSign} iconBg={s.net >= 0 ? 'bg-green-50 text-success' : 'bg-red-50 text-danger'} label="Net P&L" value={money(s.net)} valueTone={tone(s.net)} delta={deltaPct(s.net, p.net)} hint={`${s.resolved} closed trades`} />
                <Kpi icon={Target} iconBg="bg-blue-50 text-brand" label="Win Rate" value={`${s.winRate.toFixed(1)}%`} delta={deltaPct(s.winRate, p.winRate)} hint={`${s.wins}W · ${s.losses}L · ${s.be}BE`} />
                <Kpi icon={Scale} iconBg="bg-amber-50 text-warning" label="Profit Factor" value={s.profitFactor == null ? '—' : s.profitFactor === Infinity ? '∞' : s.profitFactor.toFixed(2)} valueTone={s.profitFactor != null && s.profitFactor < 1 ? 'text-danger' : 'text-text-primary'} hint="Gross profit ÷ gross loss" />
                <Kpi icon={Activity} iconBg="bg-violet-50 text-ai" label="Expectancy" value={money(s.expectancy)} valueTone={tone(s.expectancy)} hint="Average per trade" />
                <Kpi icon={TrendingUp} iconBg="bg-green-50 text-success" label="Avg Win / Avg Loss" value={`${money(s.avgWin)} / -$${s.avgLoss.toFixed(2)}`} hint={s.payoff ? `Payoff ratio ${s.payoff.toFixed(2)}` : ''} />
                <Kpi icon={TrendingUp} iconBg="bg-violet-50 text-ai" label="Average RR" value={`1:${s.avgRR.toFixed(2)}`} delta={deltaPct(s.avgRR, p.avgRR)} hint="Planned reward" />
                <Kpi icon={ShieldAlert} iconBg="bg-red-50 text-danger" label="Max Drawdown" value={s.maxDd > 0 ? `-$${s.maxDd.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '$0'} valueTone={s.maxDd > 0 ? 'text-danger' : 'text-text-primary'} hint="Peak to trough" />
                <Kpi icon={Flame} iconBg="bg-amber-50 text-warning" label="Streaks" value={`${s.maxW}W / ${s.maxL}L`} hint={`Best ${money(s.best)} · Worst ${money(s.worst)}`} />
              </div>

              {/* Insights */}
              <Card>
                <Head icon={Lightbulb} iconBg="bg-amber-50 text-warning" title="Insights" sub="Generated automatically from your trades" />
                {insights.length === 0 ? <Empty text="Log at least 3 closed trades to unlock insights." h="h-28" /> : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {insights.map((i) => (
                      <div key={i.title} className={`flex items-start gap-2.5 rounded-xl border p-3.5 ${alertStyle[i.tone]}`}>
                        {i.tone === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                        <div>
                          <p className="text-sm font-semibold">{i.title}</p>
                          <p className="mt-0.5 text-xs text-text-secondary">{i.text}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* Equity + results */}
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <Card className="xl:col-span-2">
                  <Head icon={Activity} iconBg="bg-violet-50 text-ai" title="Equity Curve" sub="Based on your filtered trades"
                    right={<Segmented value={curveView} onChange={setCurveView} options={[['equity', 'Cumulative P&L'], ['dd', 'Drawdown']]} />} />
                  {s.curve.length > 1 ? (
                    <div className="h-[290px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={s.curve} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                          <defs>
                            <linearGradient id="anEq" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={curveColor} stopOpacity={0.25} /><stop offset="100%" stopColor={curveColor} stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                          <XAxis dataKey="n" tickFormatter={(n) => (n === 0 ? 'Start' : `#${n}`)} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                          <YAxis tickFormatter={(v) => `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString()}`} tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={64} />
                          <Tooltip content={<CurveTip />} />
                          <Area type="monotone" dataKey={curveView} stroke={curveColor} strokeWidth={2.5} fill="url(#anEq)" baseValue={0} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : <Empty text="No closed trades in this selection yet." h="h-[290px]" />}
                </Card>

                <Card className="flex flex-col">
                  <Head icon={Target} title="Trade Results" sub="Win / loss distribution" />
                  {s.resolved === 0 ? <Empty text="No closed trades yet." /> : (
                    <>
                      <div className="relative mx-auto h-44 w-44">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={[]}><XAxis hide /></BarChart>
                        </ResponsiveContainer>
                        <svg viewBox="0 0 36 36" className="absolute inset-0 h-full w-full -rotate-90">
                          {(() => {
                            let offset = 0
                            return donut.map((d) => {
                              const frac = (d.value / s.resolved) * 100
                              const el = <circle key={d.key} cx="18" cy="18" r="15.9155" fill="none" stroke={PIE[d.key]} strokeWidth="3.4" strokeDasharray={`${Math.max(frac - 1, 0)} ${100 - Math.max(frac - 1, 0)}`} strokeDashoffset={-offset} />
                              offset += frac
                              return el
                            })
                          })()}
                        </svg>
                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                          <p className="text-2xl font-bold text-text-primary">{s.resolved}</p>
                          <p className="text-xs text-text-muted">Closed</p>
                        </div>
                      </div>
                      <div className="mt-5 flex flex-col gap-3">
                        {[['win', 'Wins', s.wins], ['loss', 'Losses', s.losses], ['be', 'Breakeven', s.be]].map(([k, l, v]) => (
                          <div key={k} className="flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2 text-text-secondary"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE[k] }} />{l}</span>
                            <span className="tabular-nums font-semibold text-text-primary">{v} <span className="ml-1 text-xs font-normal text-text-muted">({pct(v, s.resolved).toFixed(0)}%)</span></span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </Card>
              </div>

              {/* Time analysis + monthly */}
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <Card>
                  <Head icon={Clock} title="When You Trade Best" sub="Net P&L by time"
                    right={<Segmented value={timeView} onChange={setTimeView} options={[['day', 'Weekday'], ['hour', 'Hour']]} />} />
                  {timeData.every((d) => d.count === 0) ? <Empty text="No closed trades yet." h="h-[240px]" /> : (
                    <div className="h-[240px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={timeData} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={52} />
                          <Tooltip content={<PnlTip />} />
                          <Bar dataKey="pnl" radius={[5, 5, 0, 0]} maxBarSize={36}>
                            {timeData.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? '#16A34A' : '#DC2626'} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </Card>

                <Card>
                  <Head icon={Calendar} title="Monthly P&L" sub="Last 12 months in your selection" />
                  {monthly.length === 0 ? <Empty text="No closed trades yet." h="h-[240px]" /> : (
                    <div className="h-[240px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={monthly} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} width={52} />
                          <Tooltip content={<PnlTip />} />
                          <Bar dataKey="pnl" radius={[5, 5, 0, 0]} maxBarSize={36}>
                            {monthly.map((d, i) => <Cell key={i} fill={d.pnl >= 0 ? '#16A34A' : '#DC2626'} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </Card>
              </div>

              {/* Tables */}
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <BreakdownTable title="Performance by Pair" icon={Trophy} iconBg="bg-blue-50 text-brand" rows={byPair} emptyText="No closed trades yet." />
                <BreakdownTable title="Performance by Setup" icon={Target} iconBg="bg-violet-50 text-ai" rows={bySetup} emptyText="No setups logged yet." />
                <BreakdownTable title="Performance by Session" icon={Clock} iconBg="bg-amber-50 text-warning" rows={bySession} emptyText="No sessions logged yet." />
                <BreakdownTable title="Buy vs Sell" icon={TrendingUp} iconBg="bg-green-50 text-success" rows={byDirection} emptyText="No closed trades yet." />
              </div>

              {/* Strategy + psychology */}
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <FactorCard title="Strategy Checklist Analysis" icon={CheckCircle2} iconBg="bg-green-50 text-success" groups={[trendG, zoneG, liqG, cbG]} />
                <div className="flex flex-col gap-6">
                  <FactorCard title="Emotion vs Results" icon={Brain} iconBg="bg-violet-50 text-ai" groups={[emotionG]} />
                  <Card>
                    <Head icon={Scale} iconBg="bg-blue-50 text-brand" title="Results by Risk-to-Reward" sub="Do bigger targets hit as often?" />
                    {rrBuckets.length === 0 ? <Empty text="No RR data yet." h="h-28" /> : (
                      <div className="flex flex-col gap-3">
                        {rrBuckets.map((r) => (
                          <div key={r.key}>
                            <div className="mb-1 flex items-center justify-between text-sm">
                              <span className="text-text-secondary">{r.key} <span className="text-xs text-text-muted">({r.count})</span></span>
                              <span className="tabular-nums text-xs"><b className="text-text-primary">{r.winRate.toFixed(0)}%</b> · <span className={tone(r.pnl)}>{money(r.pnl)}</span></span>
                            </div>
                            <ProgressBar value={r.winRate} tone={r.winRate >= 50 ? 'success' : 'warning'} />
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </div>
              </div>

              {/* Outcomes + backtest */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card>
                  <Head icon={Target} iconBg="bg-green-50 text-success" title="Trade Outcomes" sub="How your trades actually ended" />
                  {outcomeG.length === 0 ? <Empty text="No outcomes yet." h="h-28" /> : (
                    <div className="flex flex-col gap-3">
                      {outcomeG.map((r) => (
                        <div key={r.key} className="flex items-center justify-between rounded-xl border border-border p-3">
                          <div className="flex items-center gap-2">
                            <Badge tone={r.pnl > 0 ? 'success' : r.pnl < 0 ? 'danger' : 'neutral'}>{r.key}</Badge>
                            <span className="text-xs text-text-muted">{r.count} trades · {pct(r.count, s.resolved).toFixed(0)}%</span>
                          </div>
                          <span className={`tabular-nums text-sm font-semibold ${tone(r.pnl)}`}>{money(r.pnl)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card>
                  <Head icon={History} iconBg="bg-violet-50 text-ai" title="Live vs Backtest" sub="Is your live trading matching your tests?" />
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div />
                    <p className="text-xs font-semibold text-text-muted">Live</p>
                    <p className="text-xs font-semibold text-text-muted">Backtest</p>
                    {[
                      ['Trades', s.resolved, bt.total],
                      ['Win Rate', `${s.winRate.toFixed(1)}%`, `${bt.winRate.toFixed(1)}%`],
                      ['Average RR', `1:${s.avgRR.toFixed(2)}`, `1:${bt.avgRR.toFixed(2)}`],
                    ].map(([l, a, b]) => (
                      <div key={l} className="contents">
                        <p className="self-center text-left text-sm text-text-secondary">{l}</p>
                        <p className="rounded-xl bg-surface py-2.5 text-sm font-bold tabular-nums text-text-primary">{a}</p>
                        <p className="rounded-xl bg-surface py-2.5 text-sm font-bold tabular-nums text-text-primary">{b}</p>
                      </div>
                    ))}
                  </div>
                  {bt.total > 0 && s.resolved > 0 && (
                    <p className={`mt-4 rounded-xl px-3 py-2.5 text-xs font-medium ${s.winRate >= bt.winRate - 5 ? 'bg-green-50 text-success' : 'bg-amber-50 text-warning'}`}>
                      {s.winRate >= bt.winRate - 5
                        ? 'Your live win rate is close to your backtests. You are executing the plan.'
                        : `Your live win rate is ${(bt.winRate - s.winRate).toFixed(0)} points below your backtests. Check if you are following the same rules.`}
                    </p>
                  )}
                </Card>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}