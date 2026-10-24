import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Hash, Target, TrendingUp, ShieldAlert, Activity, LineChart as LineChartIcon,
  Plus, RotateCcw, AlertTriangle, RefreshCw, ImagePlus, X, Eye, Trash2,
  ChevronLeft, ChevronRight, ChevronDown, Flame, TrendingDown, Lightbulb, Pencil,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from 'recharts'

import Sidebar from '../components/layout/Sidebar'
import Topbar from '../components/layout/Topbar'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Badge from '../components/ui/Badge'
import ProgressBar from '../components/ui/ProgressBar'
import LoadingSkeleton from '../components/ui/LoadingSkeleton'
import { useToast } from '../components/ui/Toast'

import { useAccounts } from '../hooks/useAccounts'
import { useBacktestTrades } from '../hooks/useBacktestTrades'
import { computeBacktestStats, getBacktestTradeById } from '../services/backtestService'
import { uploadToImageKit } from '../services/imagekitService'

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

// The Log Backtest Trade form can't be saved with an empty field.
// Set to false if you ever want the Before / After screenshots to be optional.
const REQUIRE_SCREENSHOTS = true

const isBlank = (v) => String(v ?? '').trim() === ''

function isoDate(d) {
  return d.toISOString().slice(0, 10)
}

function deltaPct(current, previous) {
  if (!previous) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

function average(nums) {
  const valid = nums.filter((n) => n != null && !Number.isNaN(n))
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 0
}

// Total pips across a set of trades — WIN adds the take-profit distance,
// LOSS subtracts the stop-loss distance, BREAK_EVEN contributes nothing.
function computeTotalPips(trades) {
  return trades.reduce((sum, t) => {
    if (t.result === 'WIN') return sum + (Number(t.tp_pips) || 0)
    if (t.result === 'LOSS') return sum - (Number(t.sl_pips) || 0)
    return sum
  }, 0)
}

// Net pips for a single trade — used in the detail modal now that
// dollar profit/loss isn't tracked for backtests anymore.
function tradePips(trade) {
  if (trade.result === 'WIN') return Number(trade.tp_pips) || 0
  if (trade.result === 'LOSS') return -(Number(trade.sl_pips) || 0)
  return 0
}

function monthKey(dateStr) {
  return dateStr.slice(0, 7) // YYYY-MM
}

function monthLabel(key) {
  const [y, m] = key.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function parseLocalDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`)
}

// Monday-start week key (YYYY-MM-DD of that week's Monday).
function weekStartKey(dateStr) {
  const d = parseLocalDate(dateStr)
  const day = d.getDay() // 0 = Sunday
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day))
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

function weekLabel(key) {
  const start = parseLocalDate(key)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(start)} – ${fmt(end)}, ${end.getFullYear()}`
}

function periodKeyFor(dateStr, granularity) {
  if (granularity === 'yearly') return dateStr.slice(0, 4)
  if (granularity === 'weekly') return weekStartKey(dateStr)
  return monthKey(dateStr)
}

function periodLabelFor(key, granularity) {
  if (granularity === 'yearly') return key
  if (granularity === 'weekly') return weekLabel(key)
  return monthLabel(key)
}

// Groups trades into weekly / monthly / yearly buckets (newest first)
// with trades / TP (wins) / SL (losses) / BE counts and net pips.
function computePeriodBuckets(trades, granularity) {
  const map = new Map()
  for (const t of trades) {
    const key = periodKeyFor(t.trade_date, granularity)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(t)
  }
  return [...map.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, list]) => {
      const tradesCount = list.length
      const winCount = list.filter((t) => t.result === 'WIN').length
      const lossCount = list.filter((t) => t.result === 'LOSS').length
      const beCount = list.filter((t) => t.result === 'BREAK_EVEN').length
      const winRate = tradesCount ? (winCount / tradesCount) * 100 : 0
      return {
        key,
        label: periodLabelFor(key, granularity),
        tradesCount, winCount, lossCount, beCount, winRate,
        pips: computeTotalPips(list),
      }
    })
}

// Pip-based performance stats + cumulative pips curve (replaces the
// dollar-based figures — backtests are tracked in pips, not $).
function computePipsStats(trades) {
  const winPips = trades.filter((t) => t.result === 'WIN').map(tradePips)
  const lossPips = trades.filter((t) => t.result === 'LOSS').map((t) => Math.abs(tradePips(t)))
  const sum = (arr) => arr.reduce((a, b) => a + b, 0)
  const grossProfit = sum(winPips)
  const grossLoss = sum(lossPips)

  const chronological = [...trades].sort((a, b) => a.trade_date.localeCompare(b.trade_date))
  let running = 0
  let peak = 0
  let maxDrawdown = 0
  const equityCurve = []
  chronological.forEach((t, i) => {
    running += tradePips(t)
    peak = Math.max(peak, running)
    maxDrawdown = Math.max(maxDrawdown, peak - running)
    const windowVals = equityCurve.slice(Math.max(0, i - 2)).map((p) => p.equity).concat(running)
    const smooth = sum(windowVals) / windowVals.length
    equityCurve.push({
      date: parseLocalDate(t.trade_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      equity: Number(running.toFixed(1)),
      balance: Number(smooth.toFixed(1)),
    })
  })

  return {
    grossProfit,
    grossLoss,
    netPips: grossProfit - grossLoss,
    avgWin: winPips.length ? grossProfit / winPips.length : 0,
    avgLoss: lossPips.length ? grossLoss / lossPips.length : 0,
    maxWin: winPips.length ? Math.max(...winPips) : 0,
    maxLoss: lossPips.length ? Math.max(...lossPips) : 0,
    maxDrawdown,
    equityCurve,
  }
}

const resultTone = { WIN: 'success', LOSS: 'danger', BREAK_EVEN: 'neutral' }
const resultLabel = { WIN: 'Win', LOSS: 'Loss', BREAK_EVEN: 'Breakeven' }
const PIE_COLORS = { WIN: '#16A34A', LOSS: '#DC2626', BREAK_EVEN: '#9CA3AF' }
const PAGE_SIZE = 12
const PAIR_OPTIONS = [
  { value: 'GBPUSD', label: 'GBPUSD' },
  { value: 'EURUSD', label: 'EURUSD' },
  { value: 'USDCHF', label: 'USDCHF' },
  { value: 'USDCAD', label: 'USDCAD' },
  { value: 'XAUUSD', label: 'XAUUSD' },
]

/* ------------------------------------------------------------------ */
/* Zoomable screenshots (click to open a full-screen viewer)            */
/* ------------------------------------------------------------------ */

function ImageLightbox({ src, alt, onClose }) {
  const [zoomed, setZoomed] = useState(false)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-text-secondary transition-colors hover:text-danger"
      >
        <X className="h-5 w-5" />
      </button>
      <div className="max-h-[92vh] max-w-[96vw] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <img
          src={src}
          alt={alt}
          onClick={() => setZoomed((z) => !z)}
          title={zoomed ? 'Click to fit screen' : 'Click for full size'}
          className={zoomed ? 'max-w-none cursor-zoom-out' : 'max-h-[90vh] max-w-[95vw] cursor-zoom-in object-contain'}
        />
      </div>
    </div>,
    document.body
  )
}

function ZoomableImage({ src, alt, className }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <img src={src} alt={alt} title="Click to zoom" onClick={() => setOpen(true)} className={`${className} cursor-zoom-in`} />
      {open && <ImageLightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* KpiRow                                                               */
/* ------------------------------------------------------------------ */

function KpiCard({ icon: Icon, iconBg, label, value, delta }) {
  return (
    <Card padded className="flex flex-col gap-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-popover">
      <div className="flex items-center gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-xs font-medium text-text-secondary">{label}</span>
      </div>
      <p className="tabular-nums text-xl font-bold tracking-tight text-text-primary">{value}</p>
      {delta != null && (
        <span className={`inline-flex w-fit items-center gap-1 text-xs font-medium ${delta >= 0 ? 'text-success' : 'text-danger'}`}>
          {delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {delta >= 0 ? '+' : ''}{delta.toFixed(0)}%
        </span>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Equity Curve card                                                    */
/* ------------------------------------------------------------------ */

function EquityCurveCard({ equityCurve }) {
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-brand">
            <LineChartIcon className="h-4 w-4" />
          </div>
          <h3 className="text-[18px] font-semibold text-text-primary">Equity Curve</h3>
        </div>
        <div className="flex items-center gap-4 text-xs text-text-secondary">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-brand" /> Pips</span>
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded border-t-2 border-dashed border-text-muted" /> Smoothed</span>
        </div>
      </div>
      {equityCurve.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm text-text-muted">
          No backtest trades in this range yet.
        </div>
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={equityCurve} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="btEquityFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563EB" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#9CA3AF' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}`} width={56} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 12 }} formatter={(v) => `${Number(v).toFixed(1)} pips`} />
              <Area type="monotone" dataKey="equity" name="Pips" stroke="#2563EB" strokeWidth={2.5} fill="url(#btEquityFill)" />
              <Area type="monotone" dataKey="balance" name="Smoothed" stroke="#9CA3AF" strokeWidth={1.5} strokeDasharray="5 4" fill="none" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Trade Results donut                                                  */
/* ------------------------------------------------------------------ */

function TradeResultsDonut({ stats }) {
  const data = [
    { key: 'WIN', name: 'Wins', value: stats.wins },
    { key: 'LOSS', name: 'Losses', value: stats.losses },
    { key: 'BREAK_EVEN', name: 'Breakeven', value: stats.breakEven },
  ].filter((d) => d.value > 0)

  return (
    <Card className="flex flex-col">
      <h3 className="mb-4 text-[18px] font-semibold text-text-primary">Trade Results</h3>
      {stats.total === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-text-muted">No trades yet.</div>
      ) : (
        <>
          <div className="relative mx-auto h-44 w-44">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={3} strokeWidth={0}>
                  {data.map((d) => <Cell key={d.key} fill={PIE_COLORS[d.key]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <p className="text-2xl font-bold text-text-primary">{stats.total}</p>
              <p className="text-xs text-text-muted">Total Trades</p>
            </div>
          </div>
          <div className="mt-5 flex flex-col gap-3">
            {[
              { key: 'WIN', label: 'Wins', value: stats.wins },
              { key: 'LOSS', label: 'Losses', value: stats.losses },
              { key: 'BREAK_EVEN', label: 'Breakeven', value: stats.breakEven },
            ].map((row) => (
              <div key={row.key} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-text-secondary">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[row.key] }} />
                  {row.label}
                </span>
                <span className="tabular-nums font-semibold text-text-primary">
                  {row.value} <span className="ml-1 text-xs font-normal text-text-muted">({stats.total ? ((row.value / stats.total) * 100).toFixed(1) : '0.0'}%)</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Period Breakdown card — click a month to see Trades / TP / SL / BE   */
/* ------------------------------------------------------------------ */

function PeriodBreakdownCard({ trades }) {
  const [granularity, setGranularity] = useState('monthly')
  const [expanded, setExpanded] = useState(null)
  const buckets = useMemo(() => computePeriodBuckets(trades, granularity), [trades, granularity])

  return (
    <Card>
      <h3 className="mb-4 text-[18px] font-semibold text-text-primary">Period Breakdown</h3>
      <div className="mb-4 flex items-center gap-1 rounded-lg bg-surface p-1">
        {['weekly', 'monthly', 'yearly'].map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => { setGranularity(g); setExpanded(null) }}
            className={`flex-1 rounded-md px-2.5 py-1.5 text-xs font-semibold capitalize transition-colors ${
              granularity === g ? 'bg-white text-brand shadow-sm' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            {g}
          </button>
        ))}
      </div>
      {buckets.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-muted">No data yet.</p>
      ) : (
        <div className="flex max-h-[440px] flex-col gap-2 overflow-y-auto pr-1">
          {buckets.map((b) => {
            const isOpen = expanded === b.key
            return (
              <div key={b.key} className="shrink-0 overflow-hidden rounded-xl border border-border">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : b.key)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface"
                >
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-medium text-text-primary">{b.label}</span>
                      <span className="shrink-0 text-xs text-text-muted">{b.tradesCount} trades</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ProgressBar value={b.winRate} tone={b.winRate >= 50 ? 'success' : 'warning'} className="flex-1" />
                      <span className="tabular-nums w-12 text-right text-xs font-semibold text-text-secondary">{b.winRate.toFixed(1)}%</span>
                    </div>
                  </div>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="grid grid-cols-5 gap-2 border-t border-border bg-surface/60 px-3 py-3">
                    <div className="text-center">
                      <p className="text-[11px] text-text-muted">Trades</p>
                      <p className="tabular-nums text-sm font-bold text-text-primary">{b.tradesCount}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[11px] text-text-muted">TP</p>
                      <p className="tabular-nums text-sm font-bold text-success">{b.winCount}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[11px] text-text-muted">SL</p>
                      <p className="tabular-nums text-sm font-bold text-danger">{b.lossCount}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[11px] text-text-muted">BE</p>
                      <p className="tabular-nums text-sm font-bold text-text-secondary">{b.beCount}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[11px] text-text-muted">Pips</p>
                      <p className={`tabular-nums text-sm font-bold ${b.pips >= 0 ? 'text-success' : 'text-danger'}`}>
                        {b.pips >= 0 ? '+' : ''}{b.pips.toFixed(1)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Performance Summary card                                             */
/* ------------------------------------------------------------------ */

function PerformanceSummaryCard({ stats, pipsStats }) {
  const fmtPips = (n, sign = false) => `${sign && n > 0 ? '+' : ''}${n.toFixed(1)} pips`
  const rows = [
    { icon: TrendingUp, tone: 'text-success', bg: 'bg-green-50', label: 'Gross Profit', value: fmtPips(pipsStats.grossProfit, true) },
    { icon: TrendingDown, tone: 'text-danger', bg: 'bg-red-50', label: 'Gross Loss', value: `-${pipsStats.grossLoss.toFixed(1)} pips` },
    { icon: TrendingUp, tone: pipsStats.netPips >= 0 ? 'text-success' : 'text-danger', bg: pipsStats.netPips >= 0 ? 'bg-green-50' : 'bg-red-50', label: 'Net Pips', value: fmtPips(pipsStats.netPips, true) },
    { icon: ShieldAlert, tone: 'text-brand', bg: 'bg-blue-50', label: 'Average Win', value: fmtPips(pipsStats.avgWin) },
    { icon: ShieldAlert, tone: 'text-danger', bg: 'bg-red-50', label: 'Average Loss', value: `-${pipsStats.avgLoss.toFixed(1)} pips` },
    { icon: TrendingUp, tone: 'text-success', bg: 'bg-green-50', label: 'Max Win', value: fmtPips(pipsStats.maxWin) },
    { icon: TrendingDown, tone: 'text-danger', bg: 'bg-red-50', label: 'Max Loss', value: `-${pipsStats.maxLoss.toFixed(1)} pips` },
    { icon: Flame, tone: 'text-warning', bg: 'bg-amber-50', label: 'Win Streak', value: stats.maxWinStreak },
    { icon: Flame, tone: 'text-danger', bg: 'bg-red-50', label: 'Loss Streak', value: stats.maxLossStreak },
    { icon: ShieldAlert, tone: 'text-warning', bg: 'bg-amber-50', label: 'Max Drawdown', value: fmtPips(pipsStats.maxDrawdown) },
  ]

  return (
    <Card>
      <h3 className="mb-4 text-[18px] font-semibold text-text-primary">Performance Summary</h3>
      <div className="grid grid-cols-2 gap-4">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-2.5">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${row.bg} ${row.tone}`}>
              <row.icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs text-text-muted">{row.label}</p>
              <p className={`tabular-nums text-sm font-bold ${row.tone}`}>{row.value}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Filters                                                              */
/* ------------------------------------------------------------------ */

// Backtesting has no account dimension anymore — filter by month instead
// (which month the logged backtest trades fall in), plus strategy, pair,
// trade type and result.
const defaultFilters = { month: 'all', strategy: 'all', pair: 'all', direction: 'all', result: 'all' }

function BacktestFilters({ filters, setFilters, months, strategies, pairs }) {
  const update = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }))
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Select label="Month" value={filters.month} onChange={update('month')} className="min-w-[150px]"
        options={[{ value: 'all', label: 'All Months' }, ...months.map((m) => ({ value: m.key, label: m.label }))]} />
      <Select label="Strategy" value={filters.strategy} onChange={update('strategy')} className="min-w-[160px]"
        options={[{ value: 'all', label: 'All Strategies' }, ...strategies.map((s) => ({ value: s, label: s }))]} />
      <Select label="Pair" value={filters.pair} onChange={update('pair')} className="min-w-[140px]"
        options={[{ value: 'all', label: 'All Pairs' }, ...pairs.map((p) => ({ value: p, label: p }))]} />
      <Select label="Trade Type" value={filters.direction} onChange={update('direction')} className="min-w-[140px]"
        options={[{ value: 'all', label: 'All Types' }, { value: 'Long', label: 'Long' }, { value: 'Short', label: 'Short' }]} />
      <Select label="Result" value={filters.result} onChange={update('result')} className="min-w-[140px]"
        options={[{ value: 'all', label: 'All Results' }, { value: 'WIN', label: 'Win' }, { value: 'LOSS', label: 'Loss' }, { value: 'BREAK_EVEN', label: 'Breakeven' }]} />
      <Button variant="ghost" size="md" icon={RotateCcw} onClick={() => setFilters(defaultFilters)}>Reset</Button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Results table                                                       */
/* ------------------------------------------------------------------ */

function BacktestTable({ trades, onView, onEdit, onDelete }) {
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(trades.length / PAGE_SIZE))
  const pageTrades = trades.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  useEffect(() => { setPage(1) }, [trades.length])

  if (trades.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <p className="text-sm font-medium text-text-primary">No backtest trades match your filters</p>
        <p className="text-sm text-text-muted">Log a backtest trade or adjust your filters.</p>
      </Card>
    )
  }

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-6 py-4">
        <h3 className="text-[18px] font-semibold text-text-primary">Backtest Results</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface/60 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
              <th className="py-3 pl-6 pr-4">#</th>
              <th className="py-3 pr-4">Date</th>
              <th className="py-3 pr-4">Type</th>
              <th className="py-3 pr-4">Pair</th>
              <th className="py-3 pr-4">SL (Pips)</th>
              <th className="py-3 pr-4">TP (Pips)</th>
              <th className="py-3 pr-4">Result</th>
              <th className="py-3 pr-6">Screenshots</th>
            </tr>
          </thead>
          <tbody>
            {pageTrades.map((t, i) => (
              <tr key={t.id} className="border-b border-border/70 transition-colors last:border-0 hover:bg-surface">
                <td className="py-3 pl-6 pr-4 text-text-muted">{(page - 1) * PAGE_SIZE + i + 1}</td>
                <td className="py-3 pr-4 text-text-secondary">{new Date(t.trade_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                <td className="py-3 pr-4">
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold ${t.direction === 'Long' ? 'text-success' : 'text-danger'}`}>
                    {t.direction === 'Long' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {t.direction}
                  </span>
                </td>
                <td className="py-3 pr-4 font-semibold text-text-primary">{t.pair}</td>
                <td className="py-3 pr-4 tabular-nums text-text-secondary">{t.sl_pips ?? '—'}</td>
                <td className="py-3 pr-4 tabular-nums text-text-secondary">{t.tp_pips ?? '—'}</td>
                <td className="py-3 pr-4"><Badge tone={resultTone[t.result]}>{resultLabel[t.result]}</Badge></td>
                <td className="py-3 pr-6">
                  <div className="flex items-center gap-2">
                    <button onClick={() => onView(t)} className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface">
                      <Eye className="h-3.5 w-3.5" /> View
                    </button>
                    <button onClick={() => onEdit(t)} title="Edit" className="flex items-center justify-center rounded-lg border border-border p-1.5 text-text-muted transition-colors hover:border-blue-100 hover:bg-blue-50 hover:text-brand">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => onDelete(t)} title="Delete" className="flex items-center justify-center rounded-lg border border-border p-1.5 text-text-muted transition-colors hover:border-red-100 hover:bg-red-50 hover:text-danger">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-border px-6 py-4">
        <p className="text-sm text-text-muted">
          Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, trades.length)} of {trades.length} results
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-secondary transition-colors hover:bg-surface disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {[...Array(totalPages)].slice(0, 6).map((_, i) => (
            <button
              key={i}
              onClick={() => setPage(i + 1)}
              className={`flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition-colors ${
                page === i + 1 ? 'bg-brand text-white' : 'text-text-secondary hover:bg-surface'
              }`}
            >
              {i + 1}
            </button>
          ))}
          {totalPages > 6 && <span className="px-1 text-text-muted">…</span>}
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-secondary transition-colors hover:bg-surface disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Detail modal (fetches full row incl. screenshots on demand)          */
/* ------------------------------------------------------------------ */

function BacktestDetailModal({ tradeId, open, onClose }) {
  const [trade, setTrade] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open && tradeId) {
      setLoading(true)
      getBacktestTradeById(tradeId)
        .then(setTrade)
        .finally(() => setLoading(false))
    } else {
      setTrade(null)
    }
  }, [open, tradeId])

  return (
    <Modal open={open} onClose={onClose} title="Backtest Trade">
      {loading && <LoadingSkeleton className="h-48 w-full" />}
      {!loading && trade && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={resultTone[trade.result]}>{resultLabel[trade.result]}</Badge>
            <Badge tone="neutral">{trade.pair}</Badge>
            <Badge tone="neutral">{trade.direction}</Badge>
            <span className={`ml-auto tabular-nums text-lg font-bold ${tradePips(trade) >= 0 ? 'text-success' : 'text-danger'}`}>
              {tradePips(trade) >= 0 ? '+' : ''}{tradePips(trade).toFixed(1)} pips
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div><p className="text-xs text-text-muted">Strategy</p><p className="font-medium text-text-primary">{trade.strategy || '—'}</p></div>
            <div><p className="text-xs text-text-muted">SL / TP (pips)</p><p className="font-medium text-text-primary">{trade.sl_pips ?? '—'} / {trade.tp_pips ?? '—'}</p></div>
            <div><p className="text-xs text-text-muted">RR</p><p className="font-medium text-text-primary">{trade.rr || '—'}</p></div>
          </div>
          {trade.notes && (
            <div>
              <p className="text-xs font-medium text-text-muted">Notes</p>
              <p className="mt-0.5 text-sm text-text-primary">{trade.notes}</p>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {['Before', 'After'].map((label) => {
              const src = label === 'Before' ? trade.screenshot_before_url : trade.screenshot_after_url
              return (
                <div key={label}>
                  <p className="mb-1.5 text-xs font-medium text-text-muted">{label}</p>
                  {src ? (
                    <ZoomableImage src={src} alt={label} className="aspect-video w-full rounded-xl border border-border object-cover" />
                  ) : (
                    <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-border bg-surface text-xs text-text-muted">No image</div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Log Backtest Trade form (every field is required)                    */
/* ------------------------------------------------------------------ */

function ScreenshotSlot({ label, required, error, dataUrl, onChange, onClear }) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [uploadError, setUploadError] = useState('')

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadError('')
    setProgress(0)
    setUploading(true)

    try {
      const folderName = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')

      const response = await uploadToImageKit(file, {
        folder: `/tradora/backtesting/${folderName}`,
        onProgress: (value) => {
          setProgress(Math.round(value))
        },
      })

      if (!response?.url) {
        throw new Error('ImageKit did not return an image URL.')
      }

      onChange({ url: response.url, fileId: response.fileId || null })
      setProgress(100)
    } catch (err) {
      console.error('[TRADORA] Backtest screenshot upload failed:', err)
      setUploadError(
        err?.message ||
          'Screenshot upload failed. Please try again.'
      )
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-text-primary">
        {label}
        {required && <span className="text-danger"> *</span>}
      </p>

      {dataUrl ? (
        <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border">
          <ZoomableImage src={dataUrl} alt={label} className="h-full w-full object-cover" />

          <button
            type="button"
            onClick={onClear}
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-text-secondary shadow-popover transition-colors hover:bg-white hover:text-danger"
            aria-label={`Remove ${label}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <label
          className={`relative flex aspect-video w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed bg-surface text-text-muted transition-colors ${
            error ? 'border-danger' : 'border-border'
          } ${
            uploading
              ? 'cursor-wait'
              : 'cursor-pointer hover:border-brand hover:text-brand'
          }`}
        >
          {uploading ? (
            <>
              <RefreshCw className="h-5 w-5 animate-spin text-brand" />
              <span className="text-xs font-medium text-text-secondary">
                Uploading... {progress}%
              </span>

              <div className="absolute bottom-3 left-4 right-4 h-1.5 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-brand transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <ImagePlus className="h-5 w-5" />
              <span className="text-xs font-medium">Upload screenshot</span>
              <span className="text-[10px] text-text-muted">
                Stored securely in ImageKit
              </span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFile}
              />
            </>
          )}
        </label>
      )}

      {(uploadError || error) && (
        <p className="mt-1.5 text-xs text-danger">
          {uploadError || error}
        </p>
      )}
    </div>
  )
}

// No accountId and no profit/loss field — backtesting isn't tied to a
// live/demo account, and results are tracked in pips (SL/TP), not dollars.
const emptyBtForm = {
  strategy: '', pair: 'GBPUSD', direction: 'Long',
  tradeDate: new Date().toISOString().slice(0, 10),
  slPips: '', tpPips: '', result: 'WIN', notes: '',
}

function LogBacktestForm({ open, onClose, onSubmit, submitting, trade }) {
  const isEdit = !!trade
  const [form, setForm] = useState(emptyBtForm)
  const [errors, setErrors] = useState({})
  const [missing, setMissing] = useState([])
  const [before, setBefore] = useState(null)
  const [after, setAfter] = useState(null)
  const [beforeFileId, setBeforeFileId] = useState(null)
  const [afterFileId, setAfterFileId] = useState(null)
  const formRef = useRef(null)

  useEffect(() => {
    if (open) {
      if (trade) {
        // Edit mode — prefill from the full row (incl. screenshots).
        setForm({
          strategy: trade.strategy || '',
          pair: trade.pair || 'GBPUSD',
          direction: trade.direction || 'Long',
          tradeDate: trade.trade_date || emptyBtForm.tradeDate,
          slPips: trade.sl_pips ?? '',
          tpPips: trade.tp_pips ?? '',
          result: trade.result || 'WIN',
          notes: trade.notes || '',
        })
        setBefore(trade.screenshot_before_url || null)
        setAfter(trade.screenshot_after_url || null)
        setBeforeFileId(trade.screenshot_before_file_id || null)
        setAfterFileId(trade.screenshot_after_file_id || null)
      } else {
        setForm(emptyBtForm)
        setBefore(null)
        setAfter(null)
        setBeforeFileId(null)
        setAfterFileId(null)
      }
      setErrors({})
      setMissing([])
    }
  }, [open, trade])

  const clearError = (key) => setErrors((er) => {
    if (!er[key]) return er
    const next = { ...er }
    delete next[key]
    return next
  })

  const set = (key) => (e) => {
    const value = e.target.value
    setForm((f) => ({ ...f, [key]: value }))
    clearError(key)
  }

  const rr = useMemo(() => {
    const sl = Number(form.slPips)
    const tp = Number(form.tpPips)
    return sl ? (tp / sl).toFixed(2) : '0.00'
  }, [form.slPips, form.tpPips])

  // Nothing can be left empty: Strategy, Pair, Type, Date, SL, TP, Result,
  // Notes and both screenshots are all required.
  const validate = () => {
    const next = {}
    const blanks = []
    const need = (key, label, cond, msg = 'Required: please fill in this field.') => {
      if (cond) { next[key] = msg; blanks.push(label) }
    }

    need('strategy', 'Strategy', isBlank(form.strategy))
    need('pair', 'Pair', !form.pair, 'Select a pair.')
    need('direction', 'Trade Type', !form.direction, 'Select a trade type.')
    need('tradeDate', 'Date', !form.tradeDate, 'Pick a date.')
    need('slPips', 'SL (pips)', isBlank(form.slPips))
    need('tpPips', 'TP (pips)', isBlank(form.tpPips))
    need('result', 'Result', !form.result, 'Select a result.')
    need('notes', 'Notes', isBlank(form.notes))
    if (REQUIRE_SCREENSHOTS) {
      need('before', 'Before screenshot', !before, 'Upload the Before screenshot.')
      need('after', 'After screenshot', !after, 'Upload the After screenshot.')
    }

    if (!next.slPips && !(Number(form.slPips) > 0)) next.slPips = 'Enter a number greater than 0.'
    if (!next.tpPips && !(Number(form.tpPips) > 0)) next.tpPips = 'Enter a number greater than 0.'

    setErrors(next)
    setMissing(blanks)
    return Object.keys(next).length === 0
  }

  const handleSubmit = (e) => {
    e?.preventDefault?.()
    if (!validate()) {
      formRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    onSubmit({
      strategy: form.strategy.trim(),
      pair: form.pair,
      direction: form.direction,
      trade_date: form.tradeDate,
      sl_pips: Number(form.slPips),
      tp_pips: Number(form.tpPips),
      rr: `1:${rr}`,
      result: form.result,
      notes: form.notes.trim(),
      screenshot_before_url: before,
      screenshot_after_url: after,
      screenshot_before_file_id: beforeFileId,
      screenshot_after_file_id: afterFileId,
    })
  }

  const errorCount = Object.keys(errors).length

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Backtest Trade' : 'Log Backtest Trade'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} loading={submitting}>{isEdit ? 'Save Changes' : 'Save Result'}</Button>
        </>
      }
    >
      <form ref={formRef} noValidate className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1" onSubmit={handleSubmit}>
        {errorCount > 0 && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm">
            <p className="flex items-center gap-2 font-semibold text-danger">
              <AlertTriangle className="h-4 w-4" />
              {missing.length > 0
                ? `Please fill in ${missing.length} empty field${missing.length > 1 ? 's' : ''} before saving.`
                : 'Please fix the highlighted fields.'}
            </p>
            {missing.length > 0 && <p className="mt-1 text-xs text-text-secondary">Missing: {missing.join(', ')}</p>}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Strategy *" placeholder="e.g. Liquidity Sweep + OB" value={form.strategy} error={errors.strategy} onChange={set('strategy')} />
          <Select label="Pair *" value={form.pair} onChange={set('pair')} error={errors.pair} options={PAIR_OPTIONS} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Trade Type *" value={form.direction} onChange={set('direction')} error={errors.direction}
            options={[{ value: 'Long', label: 'Long' }, { value: 'Short', label: 'Short' }]} />
          <Input label="Date *" type="date" value={form.tradeDate} error={errors.tradeDate} onChange={set('tradeDate')} />
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Input label="SL (pips) *" type="number" step="0.1" value={form.slPips} error={errors.slPips} onChange={set('slPips')} />
          <Input label="TP (pips) *" type="number" step="0.1" value={form.tpPips} error={errors.tpPips} onChange={set('tpPips')} />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-primary">RR</label>
            <div className="flex h-11 items-center rounded-xl border border-border bg-surface px-3 text-[15px] tabular-nums text-text-secondary">1:{rr}</div>
          </div>
        </div>
        <Select label="Result *" value={form.result} onChange={set('result')} error={errors.result}
          options={[{ value: 'WIN', label: 'Win' }, { value: 'LOSS', label: 'Loss' }, { value: 'BREAK_EVEN', label: 'Breakeven' }]} />
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text-primary">Notes <span className="text-danger">*</span></label>
          <textarea rows={2} value={form.notes} onChange={set('notes')} placeholder="What did this test tell you?"
            className={`w-full rounded-xl border bg-white px-3 py-2.5 text-[15px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand/20 ${
              errors.notes ? 'border-danger' : 'border-border focus:border-brand'
            }`} />
          {errors.notes && <p className="text-xs text-danger">{errors.notes}</p>}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ScreenshotSlot
            label="Before"
            required={REQUIRE_SCREENSHOTS}
            error={errors.before}
            dataUrl={before}
            onChange={(image) => { setBefore(image.url); setBeforeFileId(image.fileId || null); clearError('before') }}
            onClear={() => { setBefore(null); setBeforeFileId(null) }}
          />
          <ScreenshotSlot
            label="After"
            required={REQUIRE_SCREENSHOTS}
            error={errors.after}
            dataUrl={after}
            onChange={(image) => { setAfter(image.url); setAfterFileId(image.fileId || null); clearError('after') }}
            onClear={() => { setAfter(null); setAfterFileId(null) }}
          />
        </div>
        <p className="text-xs text-text-muted">All fields marked * are required.</p>
      </form>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Loading / error states                                               */
/* ------------------------------------------------------------------ */

function BacktestingSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {[...Array(6)].map((_, i) => (
          <Card key={i} padded><LoadingSkeleton className="h-3 w-16" /><LoadingSkeleton className="mt-3 h-6 w-12" /></Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><Card><LoadingSkeleton className="h-72 w-full" /></Card></div>
        <Card><LoadingSkeleton className="h-72 w-full" /></Card>
      </div>
    </div>
  )
}

function ErrorState({ message, onRetry }) {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-danger"><AlertTriangle className="h-5 w-5" /></div>
      <p className="text-sm font-semibold text-text-primary">Couldn't load backtest results</p>
      <p className="max-w-xs text-sm text-text-muted">{message}</p>
      <Button variant="secondary" icon={RefreshCw} onClick={onRetry} className="mt-2">Retry</Button>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

export default function Backtesting() {
  const { showToast } = useToast()
  const { accounts } = useAccounts()
  const { trades: allTrades, loading, error, mutating, refresh, createTrade, updateTrade, deleteTrade } = useBacktestTrades()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState(null)
  const [filters, setFilters] = useState(defaultFilters)
  const [formOpen, setFormOpen] = useState(false)
  const [editingTrade, setEditingTrade] = useState(null)
  const [viewingId, setViewingId] = useState(null)
  const [deletingTrade, setDeletingTrade] = useState(null)

  const today = new Date()
  const defaultStart = new Date(today)
  // Backtest trades are usually logged for historical dates far in the
  // past, unlike the live Journal — default to a 1-year window instead
  // of 30 days so recently-run backtests actually show up by default.
  defaultStart.setDate(defaultStart.getDate() - 365)
  const [startDate, setStartDate] = useState(isoDate(defaultStart))
  const [endDate, setEndDate] = useState(isoDate(today))

  useEffect(() => {
    if (accounts.length && !selectedAccount) setSelectedAccount(accounts[0])
  }, [accounts, selectedAccount])

  const strategies = useMemo(() => [...new Set(allTrades.map((t) => t.strategy).filter(Boolean))], [allTrades])
  const pairs = useMemo(() => [...new Set(allTrades.map((t) => t.pair))], [allTrades])
  const months = useMemo(() => {
    const keys = [...new Set(allTrades.map((t) => monthKey(t.trade_date)))].sort().reverse()
    return keys.map((key) => ({ key, label: monthLabel(key) }))
  }, [allTrades])

  // No account dimension anymore — filters cover month, strategy, pair,
  // trade type and result.
  const applyFilters = (list) =>
    list.filter((t) => {
      if (filters.month !== 'all' && monthKey(t.trade_date) !== filters.month) return false
      if (filters.strategy !== 'all' && t.strategy !== filters.strategy) return false
      if (filters.pair !== 'all' && t.pair !== filters.pair) return false
      if (filters.direction !== 'all' && t.direction !== filters.direction) return false
      if (filters.result !== 'all' && t.result !== filters.result) return false
      return true
    })

  const currentPeriod = useMemo(
    () => applyFilters(allTrades).filter((t) => t.trade_date >= startDate && t.trade_date <= endDate),
    [allTrades, filters, startDate, endDate]
  )

  const periodLengthDays = Math.max(1, Math.round((new Date(endDate) - new Date(startDate)) / 86400000))
  const prevEnd = new Date(startDate); prevEnd.setDate(prevEnd.getDate() - 1)
  const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - periodLengthDays)
  const previousPeriod = useMemo(
    () => applyFilters(allTrades).filter((t) => t.trade_date >= isoDate(prevStart) && t.trade_date <= isoDate(prevEnd)),
    [allTrades, filters, startDate]
  )

  const stats = useMemo(() => computeBacktestStats(currentPeriod), [currentPeriod])
  const pipsStats = useMemo(() => computePipsStats(currentPeriod), [currentPeriod])
  const prevStats = useMemo(() => computeBacktestStats(previousPeriod), [previousPeriod])

  const totalPips = useMemo(() => computeTotalPips(currentPeriod), [currentPeriod])
  const prevTotalPips = useMemo(() => computeTotalPips(previousPeriod), [previousPeriod])

  const avgSl = useMemo(() => average(currentPeriod.map((t) => Number(t.sl_pips))), [currentPeriod])
  const prevAvgSl = useMemo(() => average(previousPeriod.map((t) => Number(t.sl_pips))), [previousPeriod])
  const avgTp = useMemo(() => average(currentPeriod.map((t) => Number(t.tp_pips))), [currentPeriod])
  const prevAvgTp = useMemo(() => average(previousPeriod.map((t) => Number(t.tp_pips))), [previousPeriod])

  // The list intentionally excludes screenshot data, so fetch the full
  // row (screenshots included) before opening the edit form.
  const handleEditClick = async (t) => {
    try {
      const full = await getBacktestTradeById(t.id)
      setEditingTrade(full)
    } catch (err) {
      showToast({ type: 'error', title: 'Could not load trade', description: err.message })
    }
  }

  const closeForm = () => {
    setFormOpen(false)
    setEditingTrade(null)
  }

  const handleSaveTrade = async (payload) => {
    try {
      if (editingTrade) {
        await updateTrade(editingTrade.id, payload)
        showToast({ type: 'success', title: 'Backtest trade updated' })
      } else {
        await createTrade(payload)
        showToast({ type: 'success', title: 'Backtest trade logged' })
      }
      closeForm()
    } catch (err) {
      showToast({ type: 'error', title: 'Could not save', description: err.message })
    }
  }

  const confirmDelete = async () => {
    try {
      await deleteTrade(deletingTrade.id)
      showToast({ type: 'success', title: 'Backtest trade deleted' })
    } catch (err) {
      showToast({ type: 'error', title: 'Could not delete', description: err.message })
    } finally {
      setDeletingTrade(null)
    }
  }

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onMenuClick={() => setSidebarOpen(true)}
          accounts={accounts.map((a) => ({ id: a.id, label: a.name, status: a.mt5_connected ? 'connected' : 'disconnected' }))}
          selectedAccount={selectedAccount ? { label: selectedAccount.name } : { label: 'No Account' }}
          onSelectAccount={(a) => setSelectedAccount(accounts.find((acc) => acc.id === a.id))}
          breadcrumb="Overview / Backtesting"
        />

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-[28px] font-bold text-text-primary sm:text-[32px]">Backtesting</h1>
              <p className="mt-1 text-sm text-text-secondary">Test your trading strategies with historical data. Log results and analyze your performance.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2">
                <input type="date" value={startDate} max={endDate} onChange={(e) => setStartDate(e.target.value)} className="bg-transparent text-sm text-text-primary outline-none" />
                <span className="text-text-muted">–</span>
                <input type="date" value={endDate} min={startDate} max={isoDate(today)} onChange={(e) => setEndDate(e.target.value)} className="bg-transparent text-sm text-text-primary outline-none" />
              </div>
              <Button icon={Plus} onClick={() => setFormOpen(true)}>Log Backtest Trade</Button>
            </div>
          </div>

          {loading && <BacktestingSkeleton />}
          {!loading && error && <ErrorState message={error} onRetry={refresh} />}

          {!loading && !error && (
            <>
              <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
                <KpiCard icon={Hash} iconBg="bg-blue-50 text-brand" label="Total Trades" value={stats.total} delta={deltaPct(stats.total, prevStats.total)} />
                <KpiCard icon={Target} iconBg="bg-blue-50 text-brand" label="Win Rate" value={`${stats.winRate.toFixed(1)}%`} delta={deltaPct(stats.winRate, prevStats.winRate)} />
                <KpiCard icon={Activity} iconBg="bg-violet-50 text-ai" label="Total Pips" value={`${totalPips >= 0 ? '+' : ''}${totalPips.toFixed(1)}`} delta={deltaPct(totalPips, prevTotalPips)} />
                <KpiCard icon={TrendingUp} iconBg="bg-blue-50 text-brand" label="Average RR" value={`1:${stats.avgRR.toFixed(2)}`} delta={deltaPct(stats.avgRR, prevStats.avgRR)} />
                <KpiCard icon={ShieldAlert} iconBg="bg-red-50 text-danger" label="Average SL" value={`${avgSl.toFixed(1)} pips`} delta={deltaPct(avgSl, prevAvgSl)} />
                <KpiCard icon={Target} iconBg="bg-green-50 text-success" label="Average TP" value={`${avgTp.toFixed(1)} pips`} delta={deltaPct(avgTp, prevAvgTp)} />
              </div>

              <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="flex flex-col gap-6 lg:col-span-2">
                  <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
                    <BacktestFilters filters={filters} setFilters={setFilters} months={months} strategies={strategies} pairs={pairs} />
                  </div>
                  <BacktestTable trades={currentPeriod} onView={(t) => setViewingId(t.id)} onEdit={handleEditClick} onDelete={setDeletingTrade} />
                </div>

                <div className="flex flex-col gap-6">
                  <PeriodBreakdownCard trades={applyFilters(allTrades)} />
                  <PerformanceSummaryCard stats={stats} pipsStats={pipsStats} />
                  <Card className="flex flex-col gap-3 border-blue-100 bg-blue-50/40">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-brand">
                      <Lightbulb className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-semibold text-text-primary">Improve Your Strategy</p>
                    <p className="text-sm text-text-secondary">Log more backtest trades to sharpen your win rate and find your best setups.</p>
                    <Button onClick={() => setFormOpen(true)} className="mt-1 w-full">Log Backtest Trade</Button>
                  </Card>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2"><EquityCurveCard equityCurve={pipsStats.equityCurve} /></div>
                <TradeResultsDonut stats={stats} />
              </div>
            </>
          )}
        </main>
      </div>

      <LogBacktestForm open={formOpen || !!editingTrade} trade={editingTrade} onClose={closeForm} onSubmit={handleSaveTrade} submitting={mutating} />
      <BacktestDetailModal tradeId={viewingId} open={!!viewingId} onClose={() => setViewingId(null)} />

      <Modal
        open={!!deletingTrade}
        onClose={() => setDeletingTrade(null)}
        title="Delete Backtest Trade?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeletingTrade(null)}>Cancel</Button>
            <Button variant="danger" onClick={confirmDelete} loading={mutating}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-text-secondary">
          This will permanently remove this logged backtest trade from your results. This action cannot be undone.
        </p>
      </Modal>
    </div>
  )
}