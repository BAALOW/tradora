import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Plus,
  Download,
  Search,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Loader2,
  RotateCcw,
  CheckCircle2,
  XCircle,
  ImagePlus,
  Hash,
  Target,
  TrendingUp,
  DollarSign,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  X,
  Pencil,
  Trash2,
  Layers,
  Crosshair,
  Compass,
  NotebookPen,
  Camera,
  Wallet,
  Coins,
  Clock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Boxes,
  Waves,
  Scale,
  Activity,
  TrendingDown,
  Trophy,
  Flame,
  FileSpreadsheet,
  FileText,
  ArrowUpDown,
  ExternalLink,
  ZoomIn,
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

// Shared / reusable components (used across multiple pages)
import Sidebar from '../components/layout/Sidebar'
import Topbar from '../components/layout/Topbar'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Modal from '../components/ui/Modal'
import Drawer from '../components/ui/Drawer'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Badge from '../components/ui/Badge'
import ProgressBar from '../components/ui/ProgressBar'
import LoadingSkeleton from '../components/ui/LoadingSkeleton'
import { useToast } from '../components/ui/Toast'

import { useAccounts } from '../hooks/useAccounts'
import { useTrades } from '../hooks/useTrades'
import { supabase } from '../lib/supabaseClient'
import { computeJournalStats, getTradeById } from '../services/tradeService'
import { uploadToImageKit } from '../services/imagekitService'

/* ------------------------------------------------------------------ */
/* Page-only components (used exclusively on the Journal page)         */
/* ------------------------------------------------------------------ */

const resultTone = { WIN: 'success', LOSS: 'danger', BREAK_EVEN: 'neutral', NONE: 'neutral' }
const resultLabel = { WIN: 'WIN', LOSS: 'LOSS', BREAK_EVEN: 'BE', NONE: 'OPEN' }

// Outcome = how the trader is journaling the trade's result. Picking a
// resolved outcome (Full TP / TP1 Only / Break Even / Loss) is what
// actually drives the trade's Result, Status, and Net P&L — "Still Open"
// means the trade hasn't reached an outcome yet and stays untouched.
const OUTCOME_OPTIONS = [
  { value: 'OPEN', label: 'Still Open' },
  { value: 'FULL_TP', label: 'Full TP' },
  { value: 'TP1_ONLY', label: 'TP1 Only' },
  { value: 'BREAK_EVEN', label: 'Break Even' },
  { value: 'LOSS', label: 'Loss' },
]

const outcomeTone = {
  OPEN: 'neutral',
  FULL_TP: 'success',
  TP1_ONLY: 'success',
  BREAK_EVEN: 'neutral',
  LOSS: 'danger',
}

const outcomeLabel = {
  OPEN: 'Still Open',
  FULL_TP: 'Full TP',
  TP1_ONLY: 'TP1 Only',
  BREAK_EVEN: 'Break Even',
  LOSS: 'Loss',
}

// Icon accent color per outcome — purely visual, mirrors outcomeTone.
const outcomeIconBg = {
  OPEN: 'bg-violet-50 text-ai',
  FULL_TP: 'bg-green-50 text-success',
  TP1_ONLY: 'bg-green-50 text-success',
  BREAK_EVEN: 'bg-surface text-text-secondary',
  LOSS: 'bg-red-50 text-danger',
}

// Strategy setups — the trader's own scenario playbook.
const SETUP_OPTIONS = [
  { value: 'Scenario 1', label: 'Scenario 1' },
  { value: 'Scenario 2', label: 'Scenario 2' },
  { value: 'Scenario 3', label: 'Scenario 3' },
  { value: 'Scenario 4', label: 'Scenario 4' },
  { value: 'Momentum Trade', label: 'Momentum Trade' },
]

const STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Open' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'CANCELLED', label: 'Cancelled' },
]

// Once an Evaluation (demo) account hits its profit target it becomes Funded · Live
// and starts a fresh payout target (same value as the Accounts page).
const FUNDED_TARGET_PCT = 3

const isBlank = (v) => String(v ?? '').trim() === ''

// Turns a journaled Outcome into the actual Result the stats/badges use.
function outcomeToResult(outcome) {
  if (outcome === 'FULL_TP' || outcome === 'TP1_ONLY') return 'WIN'
  if (outcome === 'BREAK_EVEN') return 'BREAK_EVEN'
  if (outcome === 'LOSS') return 'LOSS'
  return 'NONE' // 'OPEN' / unset — trade hasn't resolved yet
}

// Derives P&L from the chosen outcome using the trade's own risk sizing
// and reward ratio — no separate broker statement required. TP1 Only is
// treated as roughly half the full reward, which the trader can always
// override later with exact numbers via Edit Trade → Close Trade.
function computeOutcomePnl(outcome, riskAmount, rrRatio) {
  const risk = Number(riskAmount) || 0
  const rr = Number(rrRatio) || 0
  switch (outcome) {
    case 'FULL_TP':
      return risk * rr
    case 'TP1_ONLY':
      return risk * rr * 0.5
    case 'BREAK_EVEN':
      return 0
    case 'LOSS':
      return -risk
    default:
      return 0
  }
}

// Derives the outcome badge for a trade. Uses trade.outcome if it's
// already set, otherwise falls back to a mapping based on trade.result
// so MT5-synced trades (which don't set `outcome`) still render sensibly.
function getOutcome(trade) {
  if (trade.outcome && outcomeLabel[trade.outcome]) return trade.outcome
  if (trade.result === 'LOSS') return 'LOSS'
  if (trade.result === 'BREAK_EVEN') return 'BREAK_EVEN'
  if (trade.result === 'WIN') return 'FULL_TP'
  return 'OPEN'
}

function fmtMoney(n) {
  const num = Number(n || 0)
  return `${num >= 0 ? '+' : ''}$${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function pipMultiplier(symbol) {
  if (symbol === 'XAUUSD') return 1
  if (symbol === 'USDJPY') return 100
  return 10000
}

function JournalStats({ stats }) {
  const items = [
    { icon: Hash, label: 'Total Trades', value: stats.total, iconBg: 'bg-blue-50 text-brand' },
    { icon: Target, label: 'Win Rate', value: `${stats.winRate.toFixed(1)}%`, iconBg: 'bg-blue-50 text-brand' },
    { icon: TrendingUp, label: 'Average RR', value: `1:${stats.avgRR.toFixed(2)}`, iconBg: 'bg-violet-50 text-ai' },
    {
      icon: DollarSign,
      label: 'Net P&L',
      value: `${stats.netPnl >= 0 ? '+' : ''}$${stats.netPnl.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      tone: stats.netPnl >= 0 ? 'text-success' : 'text-danger',
      iconBg: stats.netPnl >= 0 ? 'bg-green-50 text-success' : 'bg-red-50 text-danger',
    },
    { icon: ShieldAlert, label: 'Average Risk', value: `${stats.avgRisk.toFixed(2)}%`, iconBg: 'bg-amber-50 text-warning' },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
      {items.map((item) => (
        <Card
          key={item.label}
          padded
          className="flex flex-col gap-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-popover"
        >
          <div className="flex items-center gap-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${item.iconBg}`}>
              <item.icon className="h-4 w-4" />
            </div>
            <span className="text-xs font-medium text-text-secondary">{item.label}</span>
          </div>
          <p className={`tabular-nums text-xl font-bold tracking-tight ${item.tone || 'text-text-primary'}`}>{item.value}</p>
        </Card>
      ))}
    </div>
  )
}

const defaultFilters = {
  account: 'all',
  symbol: 'all',
  direction: 'all',
  setup: 'all',
  session: 'all',
  result: 'all',
  dateRange: 'all',
}

function TradeFilters({ filters, setFilters, accounts, symbols, setups }) {
  const update = (key) => (e) => setFilters((f) => ({ ...f, [key]: e.target.value }))

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Select
        label="Account"
        value={filters.account}
        onChange={update('account')}
        options={[{ value: 'all', label: 'All Accounts' }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]}
        className="min-w-[160px]"
      />
      <Select
        label="Pair"
        value={filters.symbol}
        onChange={update('symbol')}
        options={[{ value: 'all', label: 'All Pairs' }, ...symbols.map((s) => ({ value: s, label: s }))]}
        className="min-w-[140px]"
      />
      <Select
        label="Direction"
        value={filters.direction}
        onChange={update('direction')}
        options={[
          { value: 'all', label: 'All Directions' },
          { value: 'BUY', label: 'Buy' },
          { value: 'SELL', label: 'Sell' },
        ]}
        className="min-w-[140px]"
      />
      <Select
        label="Setup"
        value={filters.setup}
        onChange={update('setup')}
        options={[{ value: 'all', label: 'All Setups' }, ...setups.map((s) => ({ value: s, label: s }))]}
        className="min-w-[160px]"
      />
      <Select
        label="Session"
        value={filters.session}
        onChange={update('session')}
        options={[
          { value: 'all', label: 'All Sessions' },
          { value: 'London', label: 'London' },
          { value: 'New York', label: 'New York' },
          { value: 'Tokyo', label: 'Tokyo' },
        ]}
        className="min-w-[140px]"
      />
      <Select
        label="Result"
        value={filters.result}
        onChange={update('result')}
        options={[
          { value: 'all', label: 'All Results' },
          { value: 'WIN', label: 'Win' },
          { value: 'LOSS', label: 'Loss' },
          { value: 'BREAK_EVEN', label: 'Break Even' },
        ]}
        className="min-w-[140px]"
      />
      <Select
        label="Date Range"
        value={filters.dateRange}
        onChange={update('dateRange')}
        options={[
          { value: 'all', label: 'All Time' },
          { value: '7d', label: 'Last 7 Days' },
          { value: '30d', label: 'Last 30 Days' },
          { value: '90d', label: 'Last 90 Days' },
        ]}
        className="min-w-[140px]"
      />
      <Button variant="ghost" size="md" icon={RotateCcw} onClick={() => setFilters(defaultFilters)}>
        Reset Filters
      </Button>
    </div>
  )
}

function TradeCard({ trade, accountName, onClick }) {
  const outcome = getOutcome(trade)
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-xl border border-border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-popover"
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${
            trade.direction === 'BUY' ? 'bg-green-50 text-success' : 'bg-red-50 text-danger'
          }`}
        >
          {trade.direction === 'BUY' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
        </div>
        <div>
          <p className="text-sm font-semibold text-text-primary">{trade.symbol}</p>
          <p className="text-xs text-text-muted">{trade.setup || 'Manual entry'} · {accountName}</p>
        </div>
      </div>
      <div className="text-right">
        <p className={`tabular-nums text-sm font-semibold ${Number(trade.net_profit) > 0 ? 'text-success' : Number(trade.net_profit) < 0 ? 'text-danger' : 'text-text-secondary'}`}>
          {fmtMoney(trade.net_profit)}
        </p>
        <div className="mt-1 flex items-center justify-end gap-1.5">
          <Badge tone={resultTone[trade.result]}>{resultLabel[trade.result]}</Badge>
          <Badge tone={outcomeTone[outcome]}>{outcomeLabel[outcome]}</Badge>
        </div>
      </div>
    </button>
  )
}

const PAGE_SIZE_OPTIONS = [10, 25, 50]

// Sort value for each sortable table column.
function getSortValue(trade, key, accountsById) {
  switch (key) {
    case 'date':
      return trade.opened_at ? new Date(trade.opened_at).getTime() || 0 : 0
    case 'account':
      return accountsById[trade.account_id]?.name ?? ''
    case 'pair':
      return trade.symbol ?? ''
    case 'direction':
      return trade.direction ?? ''
    case 'setup':
      return trade.setup ?? ''
    case 'sl':
      return Number(trade.stop_loss) || 0
    case 'tp':
      return Number(trade.take_profit) || 0
    case 'rr':
      return parseFloat(String(trade.rr ?? '').split(':')[1]) || 0
    case 'risk':
      return Number(trade.risk_amount) || 0
    case 'pnl':
      return Number(trade.net_profit) || 0
    case 'result':
      return resultLabel[trade.result] ?? ''
    case 'outcome':
      return outcomeLabel[getOutcome(trade)] ?? ''
    default:
      return 0
  }
}

// Numeric / date columns feel natural starting from highest → lowest.
const DESC_FIRST_COLUMNS = ['date', 'sl', 'tp', 'rr', 'risk', 'pnl']

function TradeTable({ trades, accountsById, onSelect }) {
  const [sortKey, setSortKey] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0])

  const sorted = useMemo(() => {
    if (!sortKey) return trades
    const dir = sortDir === 'asc' ? 1 : -1
    return [...trades].sort((a, b) => {
      const av = getSortValue(a, sortKey, accountsById)
      const bv = getSortValue(b, sortKey, accountsById)
      if (typeof av === 'string' || typeof bv === 'string') {
        return String(av).localeCompare(String(bv)) * dir
      }
      return (av - bv) * dir
    })
  }, [trades, sortKey, sortDir, accountsById])

  // Jump back to the first page whenever the result set or ordering changes.
  useEffect(() => {
    setPage(1)
  }, [trades.length, sortKey, sortDir, pageSize])

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize))
  const currentPage = Math.min(page, pageCount)
  const startIndex = (currentPage - 1) * pageSize
  const pageTrades = sorted.slice(startIndex, startIndex + pageSize)

  // Click cycle: first direction → opposite direction → back to default order.
  const toggleSort = (key) => {
    const firstDir = DESC_FIRST_COLUMNS.includes(key) ? 'desc' : 'asc'
    if (sortKey !== key) {
      setSortKey(key)
      setSortDir(firstDir)
    } else if (sortDir === firstDir) {
      setSortDir(firstDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(null)
      setSortDir('asc')
    }
  }

  const renderTh = (id, label, className) => {
    const active = sortKey === id
    return (
      <th
        className={className}
        aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button
          type="button"
          onClick={() => toggleSort(id)}
          className={`inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-text-primary ${
            active ? 'text-brand' : ''
          }`}
        >
          {label}
          {active ? (
            sortDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
          ) : (
            <ArrowUpDown className="h-3 w-3 opacity-40" />
          )}
        </button>
      </th>
    )
  }

  if (trades.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <p className="text-sm font-medium text-text-primary">No trades match your filters</p>
        <p className="text-sm text-text-muted">Try adjusting or resetting your filters.</p>
      </Card>
    )
  }

  return (
    <Card padded={false} className="overflow-hidden">
      {/* Desktop / tablet table */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface/60 text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
              {renderTh('date', 'Date', 'py-3 pl-6 pr-4')}
              {renderTh('account', 'Account', 'py-3 pr-4')}
              {renderTh('pair', 'Pair', 'py-3 pr-4')}
              {renderTh('direction', 'Direction', 'py-3 pr-4')}
              {renderTh('setup', 'Setup', 'hidden py-3 pr-4 lg:table-cell')}
              {renderTh('sl', 'SL', 'hidden py-3 pr-4 xl:table-cell')}
              {renderTh('tp', 'TP', 'hidden py-3 pr-4 xl:table-cell')}
              {renderTh('rr', 'RR', 'hidden py-3 pr-4 md:table-cell')}
              {renderTh('risk', 'Risk', 'hidden py-3 pr-4 md:table-cell')}
              {renderTh('pnl', 'P&L', 'py-3 pr-4')}
              {renderTh('result', 'Result', 'py-3 pr-4')}
              {renderTh('outcome', 'Outcome', 'py-3 pr-6')}
            </tr>
          </thead>
          <tbody>
            {pageTrades.map((trade) => {
              const outcome = getOutcome(trade)
              return (
                <tr
                  key={trade.id}
                  onClick={() => onSelect(trade)}
                  className="cursor-pointer border-b border-border/70 transition-colors last:border-0 hover:bg-surface"
                >
                  <td className="py-3 pl-6 pr-4 text-text-muted">
                    {trade.opened_at ? new Date(trade.opened_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                  </td>
                  <td className="py-3 pr-4 text-text-secondary">{accountsById[trade.account_id]?.name}</td>
                  <td className="py-3 pr-4 font-semibold text-text-primary">{trade.symbol}</td>
                  <td className="py-3 pr-4">
                    <span
                      className={`inline-flex items-center gap-1 text-xs font-semibold ${
                        trade.direction === 'BUY' ? 'text-success' : 'text-danger'
                      }`}
                    >
                      {trade.direction === 'BUY' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                      {trade.direction}
                    </span>
                  </td>
                  <td className="hidden py-3 pr-4 text-text-secondary lg:table-cell">{trade.setup || '—'}</td>
                  <td className="hidden py-3 pr-4 tabular-nums text-text-secondary xl:table-cell">
                    {trade.stop_loss ?? '—'}{trade.sl_pips ? <span className="text-text-muted"> ({trade.sl_pips}p)</span> : null}
                  </td>
                  <td className="hidden py-3 pr-4 tabular-nums text-text-secondary xl:table-cell">
                    {trade.take_profit ?? '—'}{trade.tp_pips ? <span className="text-text-muted"> ({trade.tp_pips}p)</span> : null}
                  </td>
                  <td className="hidden py-3 pr-4 tabular-nums text-text-secondary md:table-cell">{trade.rr || '—'}</td>
                  <td className="hidden py-3 pr-4 tabular-nums font-medium text-danger md:table-cell">
                    ${Number(trade.risk_amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td
                    className={`tabular-nums py-3 pr-4 font-semibold ${
                      Number(trade.net_profit) > 0 ? 'text-success' : Number(trade.net_profit) < 0 ? 'text-danger' : 'text-text-secondary'
                    }`}
                  >
                    {fmtMoney(trade.net_profit)}
                  </td>
                  <td className="py-3 pr-4">
                    <Badge tone={resultTone[trade.result]}>{resultLabel[trade.result]}</Badge>
                  </td>
                  <td className="py-3 pr-6">
                    <Badge tone={outcomeTone[outcome]}>{outcomeLabel[outcome]}</Badge>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="flex flex-col gap-3 p-4 sm:hidden">
        {pageTrades.map((trade) => (
          <TradeCard
            key={trade.id}
            trade={trade}
            accountName={accountsById[trade.account_id]?.name}
            onClick={() => onSelect(trade)}
          />
        ))}
      </div>

      {/* Pagination */}
      {trades.length > PAGE_SIZE_OPTIONS[0] && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-text-secondary sm:px-6">
          <span>
            Showing{' '}
            <span className="font-semibold text-text-primary">
              {startIndex + 1}–{Math.min(startIndex + pageSize, sorted.length)}
            </span>{' '}
            of <span className="font-semibold text-text-primary">{sorted.length}</span> trades
          </span>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              Rows
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="h-8 rounded-lg border border-border bg-white px-2 text-xs text-text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </label>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-secondary transition-colors hover:bg-surface hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[88px] text-center tabular-nums">
                Page <span className="font-semibold text-text-primary">{currentPage}</span> of {pageCount}
              </span>
              <button
                type="button"
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= pageCount}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-text-secondary transition-colors hover:bg-surface hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

const executionRows = [
  { label: 'Setup Quality', key: 'setup_quality' },
  { label: 'Entry Execution', key: 'entry_execution' },
  { label: 'Risk Management', key: 'risk_management_score' },
  { label: 'Plan Compliance', key: 'plan_compliance' },
]

function ExecutionScore({ trade }) {
  const toneFor = (v) => (v >= 80 ? 'success' : v >= 50 ? 'warning' : 'danger')
  const hasScore = trade.execution_score != null

  if (!hasScore) {
    return (
      <div className="rounded-xl border border-dashed border-border p-4 text-center transition-shadow duration-200 hover:shadow-card">
        <p className="text-sm font-semibold text-text-primary">Execution Score</p>
        <p className="mt-1 text-sm text-text-muted">
          Not scored yet — this fills in automatically once the trade is reviewed by the AI Coach.
        </p>
      </div>
    )
  }

  const score = trade.execution_score

  return (
    <div className="rounded-xl border border-border p-4 transition-shadow duration-200 hover:shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm font-semibold text-text-primary">Execution Score</p>
        <span className={`tabular-nums text-lg font-bold ${score >= 80 ? 'text-success' : score >= 50 ? 'text-warning' : 'text-danger'}`}>
          {score} / 100
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {executionRows.map((row) => (
          <div key={row.key}>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="text-text-secondary">{row.label}</span>
              <span className="tabular-nums font-medium text-text-primary">{trade[row.key] ?? 0}%</span>
            </div>
            <ProgressBar value={trade[row.key] ?? 0} tone={toneFor(trade[row.key] ?? 0)} />
          </div>
        ))}
      </div>
    </div>
  )
}

// Trade Review only shows data that is actually saved with the trade:
// the Emotion and (for losing trades) the Lesson learned.
function TradeReview({ trade }) {
  return (
    <div className="rounded-xl border border-border p-4 transition-shadow duration-200 hover:shadow-card">
      <p className="mb-4 text-sm font-semibold text-text-primary">Trade Review</p>
      <div className="flex flex-col gap-4 text-sm">
        <div>
          <p className="text-text-muted">Emotion</p>
          <p className="mt-0.5 font-medium text-text-primary">{trade.emotion || '—'}</p>
        </div>
        <div>
          <p className="text-text-muted">Lesson</p>
          <p className={`mt-0.5 ${trade.lesson ? 'text-text-primary' : 'text-text-muted'}`}>{trade.lesson || '—'}</p>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-text-primary">{value ?? '—'}</p>
    </div>
  )
}

// Full-screen image viewer. Rendered in a portal so it always sits above
// the trade drawer; Esc or a click anywhere closes it.
function ImageLightbox({ src, label, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 sm:p-8"
      onClick={(e) => {
        e.stopPropagation()
        onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>
      <img
        src={src}
        alt={label}
        className="max-h-full max-w-full rounded-xl object-contain shadow-popover"
        onClick={(e) => e.stopPropagation()}
      />
      <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs font-medium text-white">
        {label}
      </p>
    </div>,
    document.body
  )
}

function ScreenshotView({ label, src }) {
  const [zoomed, setZoomed] = useState(false)

  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-text-muted">{label}</p>
      {src ? (
        <>
          <button
            type="button"
            onClick={() => setZoomed(true)}
            className="group relative block w-full overflow-hidden rounded-xl border border-border"
            aria-label={`Zoom ${label}`}
          >
            <img
              src={src}
              alt={label}
              className="aspect-video w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
            />
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
              <ZoomIn className="h-6 w-6" />
            </span>
          </button>
          {zoomed && <ImageLightbox src={src} label={label} onClose={() => setZoomed(false)} />}
        </>
      ) : (
        <div className="flex aspect-video flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-surface text-text-muted">
          <span className="text-xs font-medium">No image</span>
        </div>
      )}
    </div>
  )
}

// Opens the pair on TradingView's chart page — no extra data needed.
function tradingViewUrl(symbol) {
  return `https://www.tradingview.com/chart/?symbol=OANDA:${symbol}`
}

function TradeDetailDrawer({ trade, accountName, open, onClose, onEdit, onDelete }) {
  const [aiLoading, setAiLoading] = useState(false)
  const [aiReview, setAiReview] = useState(null)

  if (!trade) return null

  const outcome = getOutcome(trade)

  const runAiReview = () => {
    setAiLoading(true)
    setAiReview(null)
    // Placeholder for a real AI Coach call — wire this up to your backend / edge function.
    setTimeout(() => {
      setAiReview(
        trade.result === 'WIN'
          ? `Strong execution on this ${trade.symbol} ${trade.direction.toLowerCase()}. Your entry aligned with the strategy checklist and confirmation was clear — this is the process worth repeating.`
          : `This ${trade.symbol} trade shows a pattern worth watching: ${(trade.lesson || trade.mistake || 'no notes recorded').toLowerCase()} Consider tightening your entry checklist before the next ${(trade.setup || 'similar').toLowerCase()} setup.`
      )
      setAiLoading(false)
    }, 1400)
  }

  return (
    <Drawer open={open} onClose={onClose} title={`${trade.symbol} · ${trade.direction}`} subtitle={accountName} widthClass="sm:max-w-2xl">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 text-xs font-semibold ${
              trade.direction === 'BUY' ? 'text-success' : 'text-danger'
            }`}
          >
            {trade.direction === 'BUY' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
            {trade.direction}
          </span>
          <Badge tone={resultTone[trade.result]}>{resultLabel[trade.result]}</Badge>
          <Badge tone={outcomeTone[outcome]}>{outcomeLabel[outcome]}</Badge>
          {trade.setup && <Badge tone="neutral">{trade.setup}</Badge>}
          {trade.session && <Badge tone="neutral">{trade.session} Session</Badge>}
          {trade.mt5_ticket && <Badge tone="brand">MT5 · {trade.mt5_ticket}</Badge>}
          <span className="ml-auto tabular-nums text-lg font-bold text-text-primary">
            <span className={Number(trade.net_profit) > 0 ? 'text-success' : Number(trade.net_profit) < 0 ? 'text-danger' : 'text-text-secondary'}>
              {fmtMoney(trade.net_profit)}
            </span>
          </span>
        </div>

        {/* Edit / Delete actions */}
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={Pencil} onClick={() => onEdit(trade)}>Edit Trade</Button>
          <Button
            variant="secondary"
            size="sm"
            icon={Trash2}
            className="border-red-100 text-danger hover:bg-red-50"
            onClick={() => onDelete(trade)}
          >
            Delete
          </Button>
          <a
            href={tradingViewUrl(trade.symbol)}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium text-text-primary transition-colors hover:bg-surface"
          >
            <ExternalLink className="h-3.5 w-3.5" /> View on TradingView
          </a>
        </div>

        {/* Trade details */}
        <div className="rounded-xl border border-border p-4 transition-shadow duration-200 hover:shadow-card">
          <p className="mb-4 text-sm font-semibold text-text-primary">Trade Details</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Account" value={accountName} />
            <Field label="Entry" value={trade.entry_price} />
            <Field label="Stop Loss" value={trade.stop_loss != null ? `${trade.stop_loss}${trade.sl_pips ? ` (${trade.sl_pips} pips)` : ''}` : null} />
            <Field label="Take Profit" value={trade.take_profit != null ? `${trade.take_profit}${trade.tp_pips ? ` (${trade.tp_pips} pips)` : ''}` : null} />
            <Field label="Lot Size" value={trade.volume} />
            <Field label="Risk $" value={trade.risk_amount != null ? `$${trade.risk_amount}` : null} />
            <Field label="Risk %" value={trade.risk_percent != null ? `${trade.risk_percent}%` : null} />
            <Field label="RR" value={trade.rr} />
            <Field label="Outcome" value={outcomeLabel[outcome]} />
            <Field
              label="Date"
              value={trade.opened_at ? new Date(trade.opened_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null}
            />
          </div>
        </div>

        {/* Strategy checklist */}
        <div className="rounded-xl border border-border p-4 transition-shadow duration-200 hover:shadow-card">
          <p className="mb-4 text-sm font-semibold text-text-primary">Strategy Checklist</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
            <Field label="1. Trend" value={trade.trend_type} />
            <Field label="2. Supply & Demand Zone" value={trade.supply_demand_zone} />
            <Field label="3. Liquidity & Manipulation" value={trade.liquidity_manipulation} />
            <Field label="4. Counter Break" value={trade.counter_break} />
          </div>
          {trade.entry_reason && (
            <div className="mt-4">
              <p className="text-xs font-medium text-text-muted">Entry Reason</p>
              <p className="mt-0.5 text-sm text-text-primary">{trade.entry_reason}</p>
            </div>
          )}
        </div>

        {/* Screenshots */}
        <div className="rounded-xl border border-border p-4 transition-shadow duration-200 hover:shadow-card">
          <p className="mb-4 text-sm font-semibold text-text-primary">Screenshots</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ScreenshotView label="Before Entry" src={trade.screenshot_before_url} />
            <ScreenshotView label="After Close" src={trade.screenshot_after_url} />
          </div>
        </div>

        <ExecutionScore trade={trade} />
        <TradeReview trade={trade} />

        {/* AI Review */}
        <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-ai">
              <Sparkles className="h-4 w-4" />
              <p className="text-sm font-semibold">AI Review</p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="border-violet-200 text-ai hover:bg-violet-100"
              loading={aiLoading}
              onClick={runAiReview}
            >
              Analyze Trade with AI
            </Button>
          </div>
          {aiLoading && (
            <div className="flex items-center gap-2 text-sm text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Reviewing this trade...
            </div>
          )}
          {!aiLoading && aiReview && <p className="text-sm text-text-secondary">{aiReview}</p>}
          {!aiLoading && !aiReview && (
            <p className="text-sm text-text-muted">Run an AI review to get a quick read on this trade's execution.</p>
          )}
        </div>
      </div>
    </Drawer>
  )
}

function TradeScreenshotInput({ label, dataUrl, onChange, onClear }) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError('')
    setProgress(0)
    setUploading(true)

    try {
      const folderName = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')

      const response = await uploadToImageKit(file, {
        folder: `/tradora/journal/${folderName}`,
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
      console.error('[TRADORA] Journal screenshot upload failed:', err)
      setError(
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
      <p className="mb-1.5 text-sm font-medium text-text-primary">{label}</p>

      {dataUrl ? (
        <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-border">
          <img src={dataUrl} alt={label} className="h-full w-full object-cover" />

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
          className={`relative flex aspect-video w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border bg-surface text-text-muted transition-colors ${
            uploading
              ? 'cursor-wait'
              : 'cursor-pointer hover:border-brand hover:text-brand'
          }`}
        >
          {uploading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin text-brand" />
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

      {error && (
        <p className="mt-1.5 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

const emptyForm = {
  accountId: '',
  symbol: 'GBPUSD',
  direction: 'BUY',
  session: 'London',
  setup: 'Scenario 1',
  entry: '',
  slPips: '',
  tpPips: '',
  lotSize: '',
  riskPct: '1',
  trendType: 'Momentum Trend',
  supplyDemandZone: 'Demand Zone',
  liquidityManipulation: 'Liquidity Swept',
  counterBreak: 'Confirmed',
  entryReason: '',
  emotion: 'Calm',
  notes: '',
  lesson: '',
  outcome: 'OPEN',
}

const pairPipValue = { GBPUSD: 10, EURUSD: 10, USDJPY: 9.1, XAUUSD: 1 }

const NEW_TRADE_DRAFT_KEY = 'tradora_new_trade_draft'

// Small icon + label header used to visually group each section of the
// New Trade form (mirrors the badge style already used in JournalStats).
function SectionHeader({ icon: Icon, title, tone = 'bg-blue-50 text-brand' }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${tone}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <p className="text-sm font-semibold text-text-primary">{title}</p>
    </div>
  )
}

// Select field with a leading colored icon chip, styled to match the
// New Trade form's reference design. Purely presentational — same
// value/onChange contract as a native <select>, so it drops straight
// into the existing `set(key)` handlers without touching any state
// or submit logic.
function IconSelect({ icon: Icon, iconBg = 'bg-blue-50 text-brand', label, value, onChange, options, error }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-text-primary">{label}</label>
      <div className="relative">
        <span className={`pointer-events-none absolute left-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <select
          value={value}
          onChange={onChange}
          className={`h-11 w-full appearance-none rounded-xl border bg-white pl-11 pr-9 text-[15px] text-text-primary focus:outline-none focus:ring-2 focus:ring-brand/20 ${
            error ? 'border-danger' : 'border-border focus:border-brand'
          }`}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}

// Textarea with a label, optional required star and an inline error.
function TextAreaField({ label, required, optional, value, onChange, placeholder, error, rows = 2 }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-text-primary">
        {label}
        {required && <span className="text-danger"> *</span>}
        {optional && <span className="font-normal text-text-muted"> (optional)</span>}
      </label>
      <textarea
        rows={rows}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`w-full rounded-xl border bg-white px-3 py-2.5 text-[15px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand/20 ${
          error ? 'border-danger' : 'border-border focus:border-brand'
        }`}
      />
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}

// Shown only when the trade's outcome is Loss: the trader writes what the loss taught them.
function LessonField({ value, onChange, error }) {
  return (
    <div className="rounded-xl border border-red-100 bg-red-50/40 p-3">
      <TextAreaField
        label="Lesson from this loss"
        required
        value={value}
        onChange={onChange}
        error={error}
        rows={3}
        placeholder="What did this loss teach you? What will you do differently next time?"
      />
    </div>
  )
}

function FormErrorSummary({ missing, count }) {
  if (!count) return null
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm">
      <p className="flex items-center gap-2 font-semibold text-danger">
        <AlertTriangle className="h-4 w-4" />
        {missing.length > 0
          ? `Please fill in ${missing.length} empty field${missing.length > 1 ? 's' : ''} before saving.`
          : 'Please fix the highlighted fields.'}
      </p>
      {missing.length > 0 && <p className="mt-1 text-xs text-text-secondary">Missing: {missing.join(', ')}</p>}
    </div>
  )
}

function TradeForm({ open, onClose, onSubmit, accounts, submitting }) {
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})
  const [missing, setMissing] = useState([])
  const [screenshotBefore, setScreenshotBefore] = useState(null)
  const [screenshotAfter, setScreenshotAfter] = useState(null)
  const [screenshotBeforeFileId, setScreenshotBeforeFileId] = useState(null)
  const [screenshotAfterFileId, setScreenshotAfterFileId] = useState(null)
  const formRef = useRef(null)

  // Restore any in-progress draft when the modal opens (e.g. after an
  // accidental page refresh), otherwise start fresh. Screenshots aren't
  // persisted — only the form fields — to keep localStorage lightweight.
  useEffect(() => {
    if (open) {
      let restored = null
      try {
        const raw = localStorage.getItem(NEW_TRADE_DRAFT_KEY)
        if (raw) restored = JSON.parse(raw)
      } catch {
        restored = null
      }

      const fallbackAccountId = accounts[0]?.id || ''
      const accountStillExists = restored && accounts.some((a) => a.id === restored.accountId)

      setForm(
        restored
          ? { ...emptyForm, ...restored, accountId: accountStillExists ? restored.accountId : fallbackAccountId }
          : { ...emptyForm, accountId: fallbackAccountId }
      )
      setErrors({})
      setMissing([])
      setScreenshotBefore(null)
      setScreenshotAfter(null)
      setScreenshotBeforeFileId(null)
      setScreenshotAfterFileId(null)
    } else {
      // Modal closed (either submitted successfully or cancelled) — the
      // draft's job is done.
      localStorage.removeItem(NEW_TRADE_DRAFT_KEY)
    }
  }, [open, accounts])

  // Persist every keystroke while the modal is open so a refresh never
  // loses what's been typed.
  useEffect(() => {
    if (open) {
      try {
        localStorage.setItem(NEW_TRADE_DRAFT_KEY, JSON.stringify(form))
      } catch {
        // Storage full or unavailable — not critical, just skip persisting.
      }
    }
  }, [form, open])

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
  const account = accounts.find((a) => a.id === form.accountId)

  const calc = useMemo(() => {
    const balance = Number(account?.current_balance) || 0
    const riskPct = Number(form.riskPct) || 0
    const riskAmount = (riskPct / 100) * balance

    const entry = Number(form.entry)
    const slPips = Number(form.slPips) || 0
    const tpPips = Number(form.tpPips) || 0
    const multiplier = pipMultiplier(form.symbol)

    let stopLossPrice = null
    let takeProfitPrice = null
    if (entry && slPips) {
      stopLossPrice = form.direction === 'BUY' ? entry - slPips / multiplier : entry + slPips / multiplier
    }
    if (entry && tpPips) {
      takeProfitPrice = form.direction === 'BUY' ? entry + tpPips / multiplier : entry - tpPips / multiplier
    }

    const rrRatio = slPips ? tpPips / slPips : 0
    const rr = rrRatio.toFixed(2)
    const potentialProfit = riskAmount * rrRatio
    const pipValue = pairPipValue[form.symbol] || 10
    const lotSize = slPips ? (riskAmount / (slPips * pipValue)).toFixed(2) : '0.00'

    return { riskAmount, rr, rrRatio, potentialProfit, lotSize, stopLossPrice, takeProfitPrice }
  }, [account, form.riskPct, form.entry, form.slPips, form.tpPips, form.symbol, form.direction])

  // Every field must be filled (Notes and screenshots are optional) — the
  // Lesson is required only when the outcome is Loss.
  const validate = () => {
    const next = {}
    const blanks = []
    const need = (key, label, cond, msg = 'Required: please fill in this field.') => {
      if (cond) { next[key] = msg; blanks.push(label) }
    }

    need('accountId', 'Account', !form.accountId, 'Select an account.')
    need('entry', 'Entry (price)', isBlank(form.entry))
    need('slPips', 'Stop Loss (pips)', isBlank(form.slPips))
    need('tpPips', 'Take Profit (pips)', isBlank(form.tpPips))
    need('riskPct', 'Risk %', isBlank(form.riskPct))
    need('entryReason', 'Entry Reason', isBlank(form.entryReason))
    if (form.outcome === 'LOSS') need('lesson', 'Lesson', isBlank(form.lesson))

    if (!next.entry && !(Number(form.entry) > 0)) next.entry = 'Enter a valid price.'
    if (!next.slPips && !(Number(form.slPips) > 0)) next.slPips = 'Enter a number greater than 0.'
    if (!next.tpPips && !(Number(form.tpPips) > 0)) next.tpPips = 'Enter a number greater than 0.'
    if (!next.riskPct && !(Number(form.riskPct) > 0)) next.riskPct = 'Enter a number greater than 0.'

    const lot = Number(form.lotSize || calc.lotSize)
    if (!(lot > 0)) {
      next.lotSize = 'Lot size must be greater than 0.'
      if (!next.slPips && !next.riskPct) blanks.push('Lot Size')
    }

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

    // The chosen Outcome is what actually drives Result / Status / Net
    // P&L — "Still Open" leaves the trade unresolved (all stats stay 0
    // for it until the trader marks how it played out).
    const result = outcomeToResult(form.outcome)
    const resolved = result !== 'NONE'
    const netProfit = resolved ? computeOutcomePnl(form.outcome, calc.riskAmount, calc.rrRatio) : 0
    const now = new Date().toISOString()

    onSubmit({
      account_id: form.accountId,
      symbol: form.symbol,
      direction: form.direction,
      session: form.session,
      setup: form.setup,
      entry_price: Number(form.entry),
      sl_pips: Number(form.slPips),
      tp_pips: Number(form.tpPips),
      stop_loss: calc.stopLossPrice != null ? Number(calc.stopLossPrice.toFixed(6)) : null,
      take_profit: calc.takeProfitPrice != null ? Number(calc.takeProfitPrice.toFixed(6)) : null,
      volume: Number(form.lotSize || calc.lotSize),
      risk_percent: Number(form.riskPct),
      risk_amount: Number(calc.riskAmount.toFixed(2)),
      rr: `1:${calc.rr}`,
      trend_type: form.trendType,
      supply_demand_zone: form.supplyDemandZone,
      liquidity_manipulation: form.liquidityManipulation,
      counter_break: form.counterBreak,
      entry_reason: form.entryReason.trim(),
      emotion: form.emotion,
      notes: form.notes.trim(),
      lesson: form.outcome === 'LOSS' ? form.lesson.trim() : null,
      outcome: form.outcome,
      screenshot_before_url: screenshotBefore,
      screenshot_after_url: screenshotAfter,
      screenshot_before_file_id: screenshotBeforeFileId,
      screenshot_after_file_id: screenshotAfterFileId,
      status: resolved ? 'CLOSED' : 'OPEN',
      result,
      profit: Number(netProfit.toFixed(2)),
      commission: 0,
      swap: 0,
      net_profit: Number(netProfit.toFixed(2)),
      opened_at: now,
      closed_at: resolved ? now : null,
    })
  }

  const errorCount = Object.keys(errors).length

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Trade"
      footer={
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={onClose} className="w-32 justify-center">Cancel</Button>
          <Button onClick={handleSubmit} loading={submitting} className="w-32 justify-center">Save Trade</Button>
        </div>
      }
    >
      <form ref={formRef} noValidate className="flex w-[500px] min-w-[500px] max-w-[500px] max-h-[70vh] flex-col gap-5 overflow-y-auto pr-1" onSubmit={handleSubmit}>
        <FormErrorSummary missing={missing} count={errorCount} />

        {/* Trade information */}
        <div className="rounded-xl border border-border p-4 transition-shadow duration-200 hover:shadow-card">
          <SectionHeader icon={Layers} title="Trade Information" tone="bg-blue-50 text-brand" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <IconSelect
              icon={Wallet}
              iconBg="bg-blue-50 text-brand"
              label="Account *"
              value={form.accountId}
              onChange={set('accountId')}
              error={errors.accountId}
              options={accounts.map((a) => ({ value: a.id, label: a.name }))}
            />
            <IconSelect
              icon={Coins}
              iconBg="bg-blue-50 text-brand"
              label="Pair"
              value={form.symbol}
              onChange={set('symbol')}
              options={[
                { value: 'GBPUSD', label: 'GBPUSD' },
                { value: 'EURUSD', label: 'EURUSD' },
                { value: 'USDJPY', label: 'USDJPY' },
                { value: 'XAUUSD', label: 'XAUUSD' },
              ]}
            />
            <IconSelect
              icon={form.direction === 'BUY' ? ArrowUp : ArrowDown}
              iconBg={form.direction === 'BUY' ? 'bg-green-50 text-success' : 'bg-red-50 text-danger'}
              label="Direction"
              value={form.direction}
              onChange={set('direction')}
              options={[{ value: 'BUY', label: 'Buy' }, { value: 'SELL', label: 'Sell' }]}
            />
            <IconSelect
              icon={Layers}
              iconBg="bg-violet-50 text-ai"
              label="Setup"
              value={form.setup}
              onChange={set('setup')}
              options={SETUP_OPTIONS}
            />
            <IconSelect
              icon={Clock}
              iconBg="bg-amber-50 text-warning"
              label="Session"
              value={form.session}
              onChange={set('session')}
              options={[
                { value: 'London', label: 'London' },
                { value: 'New York', label: 'New York' },
                { value: 'Tokyo', label: 'Tokyo' },
              ]}
            />
            <IconSelect
              icon={Target}
              iconBg={outcomeIconBg[form.outcome]}
              label="Outcome"
              value={form.outcome}
              onChange={set('outcome')}
              options={OUTCOME_OPTIONS}
            />
          </div>
          {form.outcome !== 'OPEN' && (
            <p className="mt-2 text-xs text-text-muted">
              This trade will be logged as <span className="font-medium text-text-secondary">{outcomeLabel[form.outcome]}</span> and
              counted in your stats immediately.
            </p>
          )}
        </div>

        {/* Execution — SL/TP entered as pip distance, price derived from entry */}
        <div className="rounded-xl border border-border p-4 transition-shadow duration-200 hover:shadow-card">
          <SectionHeader icon={Crosshair} title="Execution" tone="bg-blue-50 text-brand" />
          <div className="grid grid-cols-2 items-end gap-4 sm:grid-cols-4">
            <Input label="Entry (price) *" type="number" step="0.000001" className="tabular-nums" value={form.entry} error={errors.entry} onChange={set('entry')} />
            <Input label="Stop Loss (pips) *" type="number" step="0.1" className="tabular-nums" placeholder="e.g. 10" value={form.slPips} error={errors.slPips} onChange={set('slPips')} />
            <Input label="Take Profit (pips) *" type="number" step="0.1" className="tabular-nums" placeholder="e.g. 40" value={form.tpPips} error={errors.tpPips} onChange={set('tpPips')} />
            <Input label="Lot Size (auto) *" type="number" step="0.01" className="tabular-nums" value={form.lotSize || calc.lotSize} error={errors.lotSize} onChange={set('lotSize')} />
          </div>
          {(calc.stopLossPrice != null || calc.takeProfitPrice != null) && (
            <div className="mt-3 flex flex-wrap gap-4 rounded-xl bg-surface px-3 py-2.5 text-xs text-text-secondary">
              {calc.stopLossPrice != null && <span>Stop Loss price: <span className="tabular-nums font-semibold text-text-primary">{calc.stopLossPrice.toFixed(6)}</span></span>}
              {calc.takeProfitPrice != null && <span>Take Profit price: <span className="tabular-nums font-semibold text-text-primary">{calc.takeProfitPrice.toFixed(6)}</span></span>}
            </div>
          )}
        </div>

        {/* Risk (auto-calculated) */}
        <div className="rounded-xl border border-border p-4 transition-shadow duration-200 hover:shadow-card">
          <SectionHeader icon={ShieldAlert} title="Risk" tone="bg-amber-50 text-warning" />
          <div className="grid grid-cols-2 items-end gap-4 sm:grid-cols-4">
            <Input label="Risk % *" type="number" step="any" value={form.riskPct} error={errors.riskPct} onChange={set('riskPct')} />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-primary">Risk $</label>
              <div className="flex h-11 items-center rounded-xl border border-border bg-surface px-3 text-[15px] tabular-nums text-danger">
                ${calc.riskAmount.toFixed(2)}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-primary">RR</label>
              <div className="flex h-11 items-center rounded-xl border border-border bg-surface px-3 text-[15px] tabular-nums text-text-secondary">
                1:{calc.rr}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-primary">Potential Profit</label>
              <div className="flex h-11 items-center rounded-xl border border-border bg-surface px-3 text-[15px] tabular-nums text-success">
                ${calc.potentialProfit.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Market Context — the trader's 4-rule strategy checklist */}
        <div className="rounded-xl border border-border p-4 transition-shadow duration-200 hover:shadow-card">
          <SectionHeader icon={Compass} title="Market Context" tone="bg-violet-50 text-ai" />
          <div className="grid grid-cols-2 gap-4">
            <IconSelect
              icon={TrendingUp}
              iconBg="bg-blue-50 text-brand"
              label="1. Trend"
              value={form.trendType}
              onChange={set('trendType')}
              options={[
                { value: 'Momentum Trend', label: 'Momentum Trend' },
                { value: 'Real Trend', label: 'Real Trend' },
              ]}
            />
            <IconSelect
              icon={Boxes}
              iconBg="bg-violet-50 text-ai"
              label="2. Supply & Demand Zone"
              value={form.supplyDemandZone}
              onChange={set('supplyDemandZone')}
              options={[
                { value: 'Supply Zone', label: 'Supply Zone' },
                { value: 'Demand Zone', label: 'Demand Zone' },
                { value: 'None', label: 'None' },
              ]}
            />
            <IconSelect
              icon={Waves}
              iconBg="bg-blue-50 text-brand"
              label="3. Liquidity & Manipulation"
              value={form.liquidityManipulation}
              onChange={set('liquidityManipulation')}
              options={[
                { value: 'Liquidity Swept', label: 'Liquidity Swept' },
                { value: 'Manipulation Detected', label: 'Manipulation Detected' },
                { value: 'Both', label: 'Both' },
                { value: 'None', label: 'None' },
              ]}
            />
            <IconSelect
              icon={form.counterBreak === 'Confirmed' ? CheckCircle2 : XCircle}
              iconBg={form.counterBreak === 'Confirmed' ? 'bg-green-50 text-success' : 'bg-red-50 text-danger'}
              label="4. Counter Break"
              value={form.counterBreak}
              onChange={set('counterBreak')}
              options={[
                { value: 'Confirmed', label: 'Confirmed' },
                { value: 'Not Confirmed', label: 'Not Confirmed' },
              ]}
            />
          </div>
        </div>

        {/* Journal */}
        <div className="rounded-xl border border-border p-4 transition-shadow duration-200 hover:shadow-card">
          <SectionHeader icon={NotebookPen} title="Journal" tone="bg-green-50 text-success" />
          <div className="flex flex-col gap-4">
            <TextAreaField
              label="Entry Reason"
              required
              value={form.entryReason}
              onChange={set('entryReason')}
              error={errors.entryReason}
              placeholder="Why did you take this trade?"
            />
            <Select
              label="Emotion"
              value={form.emotion}
              onChange={set('emotion')}
              options={[
                { value: 'Calm', label: 'Calm' },
                { value: 'Confident', label: 'Confident' },
                { value: 'Impatient', label: 'Impatient' },
                { value: 'Frustrated', label: 'Frustrated' },
                { value: 'Revenge trading', label: 'Revenge trading' },
              ]}
            />
            <TextAreaField
              label="Notes"
              optional
              value={form.notes}
              onChange={set('notes')}
              placeholder="Any additional notes..."
            />
            {form.outcome === 'LOSS' && (
              <LessonField value={form.lesson} onChange={set('lesson')} error={errors.lesson} />
            )}
          </div>
        </div>

        {/* Screenshots — actually uploaded, previewed, and saved with the trade */}
        <div className="rounded-xl border border-border p-4 transition-shadow duration-200 hover:shadow-card">
          <SectionHeader icon={Camera} title="Screenshots" tone="bg-surface text-text-secondary" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TradeScreenshotInput
              label="Before Entry"
              dataUrl={screenshotBefore}
              onChange={(image) => { setScreenshotBefore(image?.url || null); setScreenshotBeforeFileId(image?.fileId || null) }}
              onClear={() => { setScreenshotBefore(null); setScreenshotBeforeFileId(null) }}
            />
            <TradeScreenshotInput
              label="After Close"
              dataUrl={screenshotAfter}
              onChange={(image) => { setScreenshotAfter(image?.url || null); setScreenshotAfterFileId(image?.fileId || null) }}
              onClear={() => { setScreenshotAfter(null); setScreenshotAfterFileId(null) }}
            />
          </div>
        </div>
        <p className="text-xs text-text-muted">Fields marked * are required. Notes and screenshots are optional.</p>
      </form>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Edit Trade form — includes Close Trade section for precise numbers  */
/* ------------------------------------------------------------------ */

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// Works out the trade's final Status / Result / P&L / Outcome from what the
// trader chose in the Edit form. The Outcome is the source of truth:
//  - If the trader CHANGES the Outcome (e.g. Still Open → Loss / Full TP),
//    Result and Net P&L are recalculated from risk + RR. Old numbers never
//    override it (this is what used to turn edited trades into "BE").
//  - Exact broker numbers (Profit / Commission / Swap) are only used when the
//    trader typed them, or when a trade that was already closed is saved
//    without touching its Outcome (so exact MT5 numbers are preserved).
function resolveEdit(form, trade, calc) {
  if (form.status === 'CANCELLED') {
    return {
      driven: false, status: 'CANCELLED', result: 'NONE', outcome: 'OPEN', net: 0, profit: 0,
      commission: 0, swap: 0, exitPrice: trade.exit_price ?? null, closedAt: null,
    }
  }

  const outcomeChanged = form.outcome !== getOutcome(trade)
  const wasClosed = trade.status === 'CLOSED' && trade.result && trade.result !== 'NONE'
  const useManual = form.status === 'CLOSED' && form.profit !== '' && (form.manual || (!outcomeChanged && wasClosed))

  if (useManual) {
    const profit = Number(form.profit) || 0
    const commission = Number(form.commission) || 0
    const swap = Number(form.swap) || 0
    const net = profit + commission + swap
    const result = net > 0 ? 'WIN' : net < 0 ? 'LOSS' : 'BREAK_EVEN'

    // keep the Outcome consistent with the exact numbers
    let outcome = form.outcome
    if (net > 0 && outcome !== 'FULL_TP' && outcome !== 'TP1_ONLY') outcome = 'FULL_TP'
    if (net < 0) outcome = 'LOSS'
    if (net === 0) outcome = 'BREAK_EVEN'

    return {
      driven: false, status: 'CLOSED', result, outcome, net, profit, commission, swap,
      exitPrice: form.exitPrice !== '' ? Number(form.exitPrice) : (trade.exit_price ?? null),
      closedAt: trade.closed_at || new Date().toISOString(),
    }
  }

  const result = outcomeToResult(form.outcome)
  const resolved = result !== 'NONE'
  const net = resolved ? computeOutcomePnl(form.outcome, calc.riskAmount, calc.rrRatio) : 0
  return {
    driven: true, status: resolved ? 'CLOSED' : 'OPEN', result, outcome: form.outcome, net, profit: net,
    commission: 0, swap: 0, exitPrice: trade.exit_price ?? null,
    closedAt: resolved ? (trade.closed_at || new Date().toISOString()) : null,
  }
}

function EditTradeForm({ open, onClose, onSubmit, trade, accounts, submitting }) {
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const [screenshotBefore, setScreenshotBefore] = useState(null)
  const [screenshotAfter, setScreenshotAfter] = useState(null)
  const [screenshotBeforeFileId, setScreenshotBeforeFileId] = useState(null)
  const [screenshotAfterFileId, setScreenshotAfterFileId] = useState(null)
  const formRef = useRef(null)

  useEffect(() => {
    if (open && trade) {
      const closed = trade.status === 'CLOSED'
      setForm({
        accountId: trade.account_id || '',
        symbol: trade.symbol || 'GBPUSD',
        direction: trade.direction || 'BUY',
        session: trade.session || 'London',
        setup: trade.setup || 'Scenario 1',
        status: trade.status || 'OPEN',
        entry: trade.entry_price ?? '',
        slPips: trade.sl_pips ?? '',
        tpPips: trade.tp_pips ?? '',
        lotSize: trade.volume ?? '',
        riskPct: trade.risk_percent ?? '1',
        trendType: trade.trend_type || 'Momentum Trend',
        supplyDemandZone: trade.supply_demand_zone || 'Demand Zone',
        liquidityManipulation: trade.liquidity_manipulation || 'Liquidity Swept',
        counterBreak: trade.counter_break || 'Confirmed',
        entryReason: trade.entry_reason || '',
        emotion: trade.emotion || 'Calm',
        notes: trade.notes || '',
        lesson: trade.lesson || '',
        outcome: getOutcome(trade),
        exitPrice: trade.exit_price ?? '',
        profit: closed && trade.profit != null ? trade.profit : '',
        commission: closed && trade.commission != null ? trade.commission : '',
        swap: closed && trade.swap != null ? trade.swap : '',
        manual: false, // becomes true only when the trader types exact numbers
      })
      setErrors({})
      setScreenshotBefore(trade.screenshot_before_url || null)
      setScreenshotAfter(trade.screenshot_after_url || null)
      setScreenshotBeforeFileId(trade.screenshot_before_file_id || null)
      setScreenshotAfterFileId(trade.screenshot_after_file_id || null)
    }
  }, [open, trade])

  const account = accounts.find((a) => a.id === form?.accountId)

  const calc = useMemo(() => {
    if (!form) return { riskAmount: 0, rr: '0.00', rrRatio: 0, stopLossPrice: null, takeProfitPrice: null }
    const balance = Number(account?.current_balance) || 0
    const riskPct = Number(form.riskPct) || 0
    // Keep the originally logged Risk $ when the Risk % wasn't changed, so editing
    // a trade later doesn't re-size it from today's (different) account balance.
    const sameRisk = trade && trade.risk_amount != null && Number(trade.risk_percent) === riskPct
    const riskAmount = sameRisk ? Number(trade.risk_amount) : (riskPct / 100) * balance

    const entry = Number(form.entry)
    const slPips = Number(form.slPips) || 0
    const tpPips = Number(form.tpPips) || 0
    const multiplier = pipMultiplier(form.symbol)

    let stopLossPrice = null
    let takeProfitPrice = null
    if (entry && slPips) stopLossPrice = form.direction === 'BUY' ? entry - slPips / multiplier : entry + slPips / multiplier
    if (entry && tpPips) takeProfitPrice = form.direction === 'BUY' ? entry + tpPips / multiplier : entry - tpPips / multiplier

    const rrRatio = slPips ? tpPips / slPips : 0
    const rr = rrRatio.toFixed(2)
    return { riskAmount, rr, rrRatio, stopLossPrice, takeProfitPrice }
  }, [form, account, trade])

  const resolved = useMemo(() => (form && trade ? resolveEdit(form, trade, calc) : null), [form, trade, calc])

  if (!form || !resolved) return null

  const isLoss = resolved.outcome === 'LOSS'

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

  // Exact broker numbers: typing in any of them switches the trade to manual P&L.
  const setManual = (key) => (e) => {
    const value = e.target.value
    setForm((f) => ({ ...f, [key]: value, manual: true }))
    clearError('outcome')
  }

  // Picking an Outcome is the main way to resolve a trade: it also syncs Status
  // and clears any old exact numbers so they can't override the new Outcome.
  const changeOutcome = (e) => {
    const outcome = e.target.value
    setForm((f) => ({
      ...f,
      outcome,
      manual: false,
      profit: '',
      commission: '',
      swap: '',
      status: outcome !== 'OPEN' ? 'CLOSED' : f.status === 'CANCELLED' ? 'CANCELLED' : 'OPEN',
    }))
    clearError('outcome')
  }

  const changeStatus = (e) => {
    const status = e.target.value
    setForm((f) =>
      status === 'CLOSED'
        ? { ...f, status }
        : { ...f, status, outcome: 'OPEN', manual: false, profit: '', commission: '', swap: '' }
    )
    clearError('outcome')
  }

  const handleSubmit = (e) => {
    e?.preventDefault?.()
    const r = resolved
    const errs = {}

    if (form.status === 'CLOSED' && r.result === 'NONE') {
      errs.outcome = 'Pick an outcome (Full TP, TP1 Only, Break Even or Loss) to close this trade.'
    } else if (r.driven && (r.outcome === 'FULL_TP' || r.outcome === 'TP1_ONLY') && !(calc.rrRatio > 0 && calc.riskAmount > 0)) {
      errs.outcome = 'Add Stop Loss and Take Profit pips (and a Risk %) so the P&L can be calculated.'
    } else if (r.driven && r.outcome === 'LOSS' && !(calc.riskAmount > 0)) {
      errs.outcome = 'Set a Risk % so the loss can be calculated.'
    }
    if (r.outcome === 'LOSS' && isBlank(form.lesson)) {
      errs.lesson = 'Write what you learned from this loss.'
    }

    setErrors(errs)
    if (Object.keys(errs).length) {
      formRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    onSubmit(trade.id, {
      symbol: form.symbol,
      direction: form.direction,
      session: form.session,
      setup: form.setup,
      status: r.status,
      entry_price: Number(form.entry),
      sl_pips: Number(form.slPips) || null,
      tp_pips: Number(form.tpPips) || null,
      stop_loss: calc.stopLossPrice != null ? Number(calc.stopLossPrice.toFixed(6)) : trade.stop_loss,
      take_profit: calc.takeProfitPrice != null ? Number(calc.takeProfitPrice.toFixed(6)) : trade.take_profit,
      volume: Number(form.lotSize),
      risk_percent: Number(form.riskPct),
      risk_amount: Number(calc.riskAmount.toFixed(2)),
      rr: `1:${calc.rr}`,
      trend_type: form.trendType,
      supply_demand_zone: form.supplyDemandZone,
      liquidity_manipulation: form.liquidityManipulation,
      counter_break: form.counterBreak,
      entry_reason: form.entryReason,
      emotion: form.emotion,
      notes: form.notes,
      lesson: isLoss ? form.lesson.trim() : (trade.lesson ?? null),
      outcome: r.outcome,
      screenshot_before_url: screenshotBefore,
      screenshot_after_url: screenshotAfter,
      screenshot_before_file_id: screenshotBeforeFileId,
      screenshot_after_file_id: screenshotAfterFileId,
      exit_price: r.exitPrice,
      profit: round2(r.profit),
      commission: r.commission,
      swap: r.swap,
      net_profit: round2(r.net),
      result: r.result,
      closed_at: r.closedAt,
    })
  }

  const errorCount = Object.keys(errors).length

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit Trade"
      footer={
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={onClose} className="w-32 justify-center">Cancel</Button>
          <Button onClick={handleSubmit} loading={submitting} className="w-32 justify-center">Save Changes</Button>
        </div>
      }
    >
      <form ref={formRef} noValidate className="flex w-[500px] min-w-[500px] max-w-[500px] max-h-[70vh] flex-col gap-6 overflow-y-auto pr-1" onSubmit={handleSubmit}>
        <FormErrorSummary missing={[]} count={errorCount} />

        <div>
          <p className="mb-3 text-sm font-semibold text-text-primary">Trade Information</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select label="Pair" value={form.symbol} onChange={set('symbol')} options={[
              { value: 'GBPUSD', label: 'GBPUSD' }, { value: 'EURUSD', label: 'EURUSD' },
              { value: 'USDJPY', label: 'USDJPY' }, { value: 'XAUUSD', label: 'XAUUSD' },
            ]} />
            <Select label="Direction" value={form.direction} onChange={set('direction')} options={[{ value: 'BUY', label: 'Buy' }, { value: 'SELL', label: 'Sell' }]} />
            <Select label="Session" value={form.session} onChange={set('session')} options={[
              { value: 'London', label: 'London' }, { value: 'New York', label: 'New York' }, { value: 'Tokyo', label: 'Tokyo' },
            ]} />
            <Select label="Setup" value={form.setup} onChange={set('setup')} options={SETUP_OPTIONS} />
            <Select label="Outcome" value={form.outcome} onChange={changeOutcome} options={OUTCOME_OPTIONS} error={errors.outcome} />
            <Select label="Status" value={form.status} onChange={changeStatus} options={STATUS_OPTIONS} />
          </div>
          <p className="mt-2 text-xs text-text-muted">
            Changing Outcome updates Status, Result and Net P&L automatically. Fill in the Close Trade section below
            only if you have exact broker numbers to enter instead.
          </p>
          {form.outcome !== getOutcome(trade) && (
            <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-xs text-text-secondary">
              After saving: <span className="font-semibold text-text-primary">{resultLabel[resolved.result]}</span> ·{' '}
              <span className={`tabular-nums font-semibold ${resolved.net > 0 ? 'text-success' : resolved.net < 0 ? 'text-danger' : 'text-text-primary'}`}>
                {fmtMoney(resolved.net)}
              </span>
            </p>
          )}
        </div>

        <div>
          <p className="mb-3 text-sm font-semibold text-text-primary">Execution</p>
          <div className="grid grid-cols-2 items-end gap-4 sm:grid-cols-4">
            <Input label="Entry (price)" type="number" step="0.000001" className="tabular-nums" value={form.entry} onChange={set('entry')} />
            <Input label="Stop Loss (pips)" type="number" step="0.1" className="tabular-nums" value={form.slPips} onChange={set('slPips')} />
            <Input label="Take Profit (pips)" type="number" step="0.1" className="tabular-nums" value={form.tpPips} onChange={set('tpPips')} />
            <Input label="Lot Size" type="number" step="0.01" className="tabular-nums" value={form.lotSize} onChange={set('lotSize')} />
          </div>
        </div>

        <div>
          <p className="mb-3 text-sm font-semibold text-text-primary">Risk</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Input label="Risk %" type="number" step="any" value={form.riskPct} onChange={set('riskPct')} />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-primary">Risk $</label>
              <div className="flex h-11 items-center rounded-xl border border-border bg-surface px-3 text-[15px] tabular-nums text-danger">${calc.riskAmount.toFixed(2)}</div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-primary">RR</label>
              <div className="flex h-11 items-center rounded-xl border border-border bg-surface px-3 text-[15px] tabular-nums text-text-secondary">1:{calc.rr}</div>
            </div>
          </div>
        </div>

        {/* Close Trade — optional manual override, only meaningful once Status is Closed */}
        {form.status === 'CLOSED' && (
          <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
            <p className="mb-1 text-sm font-semibold text-text-primary">Close Trade (optional exact numbers)</p>
            <p className="mb-3 text-xs text-text-muted">
              Leave these as they are to use the Outcome-based result above. Type your broker's Profit to use exact numbers instead.
            </p>
            <div className="grid grid-cols-2 items-end gap-4 sm:grid-cols-4">
              <Input label="Exit Price" type="number" step="any" value={form.exitPrice} onChange={setManual('exitPrice')} />
              <Input label="Profit" type="number" step="any" value={form.profit} onChange={setManual('profit')} />
              <Input label="Commission" type="number" step="any" value={form.commission} onChange={setManual('commission')} />
              <Input label="Swap" type="number" step="any" value={form.swap} onChange={setManual('swap')} />
            </div>
            {form.profit !== '' && (
              <div className="mt-3 flex flex-wrap items-center gap-4 rounded-xl bg-white px-3 py-2.5 text-xs">
                <span className="text-text-secondary">
                  Net P&L: <span className={`tabular-nums font-semibold ${resolved.net >= 0 ? 'text-success' : 'text-danger'}`}>{fmtMoney(resolved.net)}</span>
                </span>
                <span className="text-text-secondary">
                  Result: <Badge tone={resultTone[resolved.result]}>{resultLabel[resolved.result]}</Badge>
                </span>
              </div>
            )}
          </div>
        )}

        <div>
          <p className="mb-3 text-sm font-semibold text-text-primary">Market Context</p>
          <div className="grid grid-cols-2 gap-4">
            <Select label="1. Trend" value={form.trendType} onChange={set('trendType')} options={[
              { value: 'Momentum Trend', label: 'Momentum Trend' }, { value: 'Real Trend', label: 'Real Trend' },
            ]} />
            <Select label="2. Supply & Demand Zone" value={form.supplyDemandZone} onChange={set('supplyDemandZone')} options={[
              { value: 'Supply Zone', label: 'Supply Zone' }, { value: 'Demand Zone', label: 'Demand Zone' }, { value: 'None', label: 'None' },
            ]} />
            <Select label="3. Liquidity & Manipulation" value={form.liquidityManipulation} onChange={set('liquidityManipulation')} options={[
              { value: 'Liquidity Swept', label: 'Liquidity Swept' }, { value: 'Manipulation Detected', label: 'Manipulation Detected' },
              { value: 'Both', label: 'Both' }, { value: 'None', label: 'None' },
            ]} />
            <Select label="4. Counter Break" value={form.counterBreak} onChange={set('counterBreak')} options={[
              { value: 'Confirmed', label: 'Confirmed' }, { value: 'Not Confirmed', label: 'Not Confirmed' },
            ]} />
          </div>
        </div>

        <div>
          <p className="mb-3 text-sm font-semibold text-text-primary">Journal</p>
          <div className="flex flex-col gap-4">
            <TextAreaField label="Entry Reason" value={form.entryReason} onChange={set('entryReason')} />
            <Select label="Emotion" value={form.emotion} onChange={set('emotion')} options={[
              { value: 'Calm', label: 'Calm' }, { value: 'Confident', label: 'Confident' }, { value: 'Impatient', label: 'Impatient' },
              { value: 'Frustrated', label: 'Frustrated' }, { value: 'Revenge trading', label: 'Revenge trading' },
            ]} />
            <TextAreaField label="Notes" optional value={form.notes} onChange={set('notes')} />
            {isLoss && (
              <LessonField value={form.lesson} onChange={set('lesson')} error={errors.lesson} />
            )}
          </div>
        </div>

        <div>
          <p className="mb-3 text-sm font-semibold text-text-primary">Screenshots</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TradeScreenshotInput label="Before Entry" dataUrl={screenshotBefore} onChange={(image) => { setScreenshotBefore(image?.url || null); setScreenshotBeforeFileId(image?.fileId || null) }} onClear={() => { setScreenshotBefore(null); setScreenshotBeforeFileId(null) }} />
            <TradeScreenshotInput label="After Close" dataUrl={screenshotAfter} onChange={(image) => { setScreenshotAfter(image?.url || null); setScreenshotAfterFileId(image?.fileId || null) }} onClear={() => { setScreenshotAfter(null); setScreenshotAfterFileId(null) }} />
          </div>
        </div>
      </form>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Journal calendar — automatically reflects the current trade list    */
/* ------------------------------------------------------------------ */

const CALENDAR_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function calendarDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function calendarMoney(value) {
  const amount = Number(value || 0)
  return `${amount >= 0 ? '+' : '-'}$${Math.abs(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function getCalendarMonthTrades(trades) {
  const grouped = {}

  trades.forEach((trade) => {
    if (!trade.opened_at) return

    const date = new Date(trade.opened_at)
    if (Number.isNaN(date.getTime())) return

    const key = calendarDateKey(date)
    if (!grouped[key]) grouped[key] = { count: 0, pnl: 0, trades: [] }

    grouped[key].count += 1
    grouped[key].pnl += Number(trade.net_profit ?? trade.profit ?? 0) || 0
    grouped[key].trades.push(trade)
  })

  return grouped
}

function CalendarDay({ date, currentMonth, data, onClick }) {
  const isCurrentMonth = date.getMonth() === currentMonth
  const isToday = isCurrentMonth && calendarDateKey(date) === calendarDateKey(new Date())
  const hasTrades = Boolean(data)
  const clickable = hasTrades && isCurrentMonth
  const pnl = Number(data?.pnl || 0)

  const tone = !hasTrades
    ? ''
    : pnl > 0
      ? 'border-green-200 bg-green-50'
      : pnl < 0
        ? 'border-red-200 bg-red-50'
        : 'border-border bg-white'

  // Current-month days: normal (today gets a blue tint + ring).
  // Days from the previous/next month: dashed, faded, and labelled with the month.
  const cellStyle = isCurrentMonth
    ? `${tone || (isToday ? 'border-border bg-blue-50/60' : 'border-border bg-white')} ${isToday ? 'ring-2 ring-brand' : ''}`
    : 'border-dashed border-border/60 bg-surface/40 opacity-60'

  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      className={`min-h-[96px] rounded-xl border p-2.5 transition-all ${cellStyle} ${
        clickable ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-popover focus:outline-none focus:ring-2 focus:ring-brand/20' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        {isToday ? (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-brand">Today</span>
        ) : (
          <span />
        )}
        {isToday ? (
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-semibold text-white">
            {date.getDate()}
          </span>
        ) : (
          <span className={`text-xs font-medium ${isCurrentMonth ? 'text-text-primary' : 'text-text-muted'}`}>
            {isCurrentMonth
              ? date.getDate()
              : `${date.toLocaleDateString('en-US', { month: 'short' })} ${date.getDate()}`}
          </span>
        )}
      </div>

      {hasTrades && isCurrentMonth && (
        <div className="mt-1">
          <p className={`text-[11px] font-medium ${pnl > 0 ? 'text-success' : pnl < 0 ? 'text-danger' : 'text-text-muted'}`}>
            {data.count} {data.count === 1 ? 'trade' : 'trades'}
          </p>
          <p className={`tabular-nums text-sm font-bold ${pnl > 0 ? 'text-success' : pnl < 0 ? 'text-danger' : 'text-text-secondary'}`}>
            {calendarMoney(pnl)}
          </p>
          {data.count > 1 && <p className="mt-0.5 text-[10px] text-text-muted">Click for details</p>}
        </div>
      )}
    </div>
  )
}

// Detail list shown when a calendar day is clicked — one compact card per
// trade so days with 2–3 trades can be told apart (pair, SL, TP, P&L).
function CalendarDayDetails({ data }) {
  const dayTrades = [...data.trades].sort((a, b) => new Date(a.opened_at) - new Date(b.opened_at))
  const totalPnl = Number(data.pnl || 0)

  return (
    <div className="flex w-[500px] max-w-full max-h-[65vh] flex-col gap-3 overflow-y-auto pr-1">
      <div className="flex items-center justify-between rounded-xl bg-surface px-3 py-2.5 text-xs">
        <span className="text-text-secondary">
          {data.count} {data.count === 1 ? 'trade' : 'trades'}
        </span>
        <span className="text-text-secondary">
          Day P&L:{' '}
          <span className={`tabular-nums font-semibold ${totalPnl > 0 ? 'text-success' : totalPnl < 0 ? 'text-danger' : 'text-text-secondary'}`}>
            {calendarMoney(totalPnl)}
          </span>
        </span>
      </div>

      {dayTrades.map((trade, index) => {
        const tradePnl = Number(trade.net_profit ?? trade.profit ?? 0) || 0
        const outcome = getOutcome(trade)

        return (
          <div key={trade.id ?? index} className="rounded-xl border border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                    trade.direction === 'BUY' ? 'bg-green-50 text-success' : 'bg-red-50 text-danger'
                  }`}
                >
                  {trade.direction === 'BUY' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary">
                    {index + 1}. {trade.symbol} · {trade.direction}
                  </p>
                  <p className="text-xs text-text-muted">{trade.setup || 'Manual entry'}</p>
                </div>
              </div>
              <div className="text-right">
                <p className={`tabular-nums text-sm font-bold ${tradePnl > 0 ? 'text-success' : tradePnl < 0 ? 'text-danger' : 'text-text-secondary'}`}>
                  {calendarMoney(tradePnl)}
                </p>
                <div className="mt-1 flex items-center justify-end gap-1.5">
                  <Badge tone={resultTone[trade.result]}>{resultLabel[trade.result]}</Badge>
                  <Badge tone={outcomeTone[outcome]}>{outcomeLabel[outcome]}</Badge>
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-3 border-t border-border/70 pt-3">
              <Field label="Entry" value={trade.entry_price} />
              <Field
                label="Stop Loss"
                value={trade.stop_loss != null ? `${trade.stop_loss}${trade.sl_pips ? ` (${trade.sl_pips}p)` : ''}` : null}
              />
              <Field
                label="Take Profit"
                value={trade.take_profit != null ? `${trade.take_profit}${trade.tp_pips ? ` (${trade.tp_pips}p)` : ''}` : null}
              />
              <Field label="RR" value={trade.rr} />
              <Field label="Risk" value={trade.risk_amount != null ? `$${trade.risk_amount}` : null} />
              <Field label="Lot Size" value={trade.volume} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Month-at-a-glance strip shown above the calendar grid.
function CalendarSummaryBar({ summary, year, month }) {
  const dayLabel = (day) => new Date(year, month, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  const toneFor = (v) => (v > 0 ? 'text-success' : v < 0 ? 'text-danger' : 'text-text-primary')
  const winRate = summary.tradingDays ? Math.round((summary.winDays / summary.tradingDays) * 100) : 0

  const items = [
    {
      label: 'Month P&L',
      value: summary.trades ? calendarMoney(summary.pnl) : '—',
      tone: summary.trades ? toneFor(summary.pnl) : 'text-text-primary',
      sub: `${summary.trades} ${summary.trades === 1 ? 'trade' : 'trades'}`,
    },
    {
      label: 'Winning Days',
      value: summary.tradingDays ? `${summary.winDays} of ${summary.tradingDays}` : '—',
      tone: summary.winDays > 0 ? 'text-success' : 'text-text-primary',
      sub: summary.tradingDays ? `${summary.lossDays} losing · ${winRate}% green` : 'No trading days',
    },
    {
      label: 'Best Day',
      value: summary.best && summary.best.pnl > 0 ? calendarMoney(summary.best.pnl) : '—',
      tone: summary.best && summary.best.pnl > 0 ? 'text-success' : 'text-text-primary',
      sub: summary.best && summary.best.pnl > 0 ? dayLabel(summary.best.day) : 'No winning day',
    },
    {
      label: 'Worst Day',
      value: summary.worst && summary.worst.pnl < 0 ? calendarMoney(summary.worst.pnl) : '—',
      tone: summary.worst && summary.worst.pnl < 0 ? 'text-danger' : 'text-text-primary',
      sub: summary.worst && summary.worst.pnl < 0 ? dayLabel(summary.worst.day) : 'No losing day',
    },
  ]

  return (
    <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-surface p-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg bg-white px-3 py-2.5">
          <p className="text-[11px] font-medium text-text-muted">{item.label}</p>
          <p className={`tabular-nums mt-0.5 text-base font-bold ${item.tone}`}>{item.value}</p>
          <p className="mt-0.5 text-[11px] text-text-muted">{item.sub}</p>
        </div>
      ))}
    </div>
  )
}

// Right-hand "Week N" cell: total trades + P&L for that row's in-month days.
function CalendarWeekTotal({ week }) {
  if (!week.inMonth) {
    return <div className="min-h-[96px] rounded-xl border border-dashed border-border/60 bg-surface/40 opacity-60" />
  }

  const hasTrades = week.count > 0
  const tone = !hasTrades
    ? 'border-border bg-surface/60'
    : week.pnl > 0
      ? 'border-green-200 bg-green-50'
      : week.pnl < 0
        ? 'border-red-200 bg-red-50'
        : 'border-border bg-white'
  const text = week.pnl > 0 ? 'text-success' : week.pnl < 0 ? 'text-danger' : 'text-text-secondary'

  return (
    <div className={`flex min-h-[96px] flex-col justify-between rounded-xl border p-2.5 ${tone}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Week {week.number}</p>
      {hasTrades ? (
        <div>
          <p className={`text-[11px] font-medium ${text}`}>
            {week.count} {week.count === 1 ? 'trade' : 'trades'}
          </p>
          <p className={`tabular-nums text-sm font-bold ${text}`}>{calendarMoney(week.pnl)}</p>
        </div>
      ) : (
        <p className="text-xs text-text-muted">No trades</p>
      )}
    </div>
  )
}

function JournalCalendar({ trades }) {
  const [viewDate, setViewDate] = useState(() => new Date())
  const [viewMode, setViewMode] = useState('month')
  const [selectedDay, setSelectedDay] = useState(null)

  const groupedTrades = useMemo(() => getCalendarMonthTrades(trades), [trades])

  const selectedDayData = selectedDay ? groupedTrades[calendarDateKey(selectedDay)] : null

  const monthLabel = viewDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  const moveCalendar = (direction) => {
    setViewDate((current) => {
      const next = new Date(current)
      if (viewMode === 'year') {
        next.setFullYear(next.getFullYear() + direction)
      } else {
        next.setMonth(next.getMonth() + direction)
      }
      return next
    })
  }

  const monthCells = useMemo(() => {
    const year = viewDate.getFullYear()
    const month = viewDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const mondayOffset = (firstDay.getDay() + 6) % 7
    const start = new Date(year, month, 1 - mondayOffset)

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start)
      date.setDate(start.getDate() + index)
      return date
    })
  }, [viewDate])

  // Rows of 7 days + that week's total (only days inside the viewed month count).
  const monthWeeks = useMemo(() => {
    const month = viewDate.getMonth()
    let weekNumber = 0

    return Array.from({ length: 6 }, (_, weekIndex) => {
      const days = monthCells.slice(weekIndex * 7, weekIndex * 7 + 7)
      let count = 0
      let pnl = 0
      let inMonth = false

      days.forEach((date) => {
        if (date.getMonth() !== month) return
        inMonth = true
        const data = groupedTrades[calendarDateKey(date)]
        if (data) {
          count += data.count
          pnl += data.pnl
        }
      })

      return { key: calendarDateKey(days[0]), days, count, pnl, inMonth, number: inMonth ? ++weekNumber : null }
    })
  }, [monthCells, groupedTrades, viewDate])

  // Whole-month totals for the summary bar.
  const monthSummary = useMemo(() => {
    const year = viewDate.getFullYear()
    const month = viewDate.getMonth()
    const summary = { pnl: 0, trades: 0, tradingDays: 0, winDays: 0, lossDays: 0, best: null, worst: null }

    Object.entries(groupedTrades).forEach(([key, data]) => {
      const [y, m, d] = key.split('-').map(Number)
      if (y !== year || m - 1 !== month) return

      summary.pnl += data.pnl
      summary.trades += data.count
      summary.tradingDays += 1
      if (data.pnl > 0) summary.winDays += 1
      else if (data.pnl < 0) summary.lossDays += 1
      if (!summary.best || data.pnl > summary.best.pnl) summary.best = { day: d, pnl: data.pnl }
      if (!summary.worst || data.pnl < summary.worst.pnl) summary.worst = { day: d, pnl: data.pnl }
    })

    return summary
  }, [groupedTrades, viewDate])

  const yearMonths = useMemo(() => {
    const year = viewDate.getFullYear()

    return Array.from({ length: 12 }, (_, monthIndex) => {
      const monthStart = new Date(year, monthIndex, 1)
      const monthEnd = new Date(year, monthIndex + 1, 0)
      let totalPnl = 0
      let totalTrades = 0

      for (let day = 1; day <= monthEnd.getDate(); day += 1) {
        const key = calendarDateKey(new Date(year, monthIndex, day))
        const data = groupedTrades[key]
        if (data) {
          totalTrades += data.count
          totalPnl += data.pnl
        }
      }

      return {
        monthStart,
        totalPnl,
        totalTrades,
      }
    })
  }, [viewDate, groupedTrades])

  const yearTotal = yearMonths.reduce((sum, month) => sum + month.totalPnl, 0)
  const yearTrades = yearMonths.reduce((sum, month) => sum + month.totalTrades, 0)

  return (
    <>
      <Card padded={false} className="overflow-hidden">
        <div className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => moveCalendar(-1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
                aria-label="Previous period"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <h2 className="min-w-[170px] text-center text-base font-semibold text-text-primary">
                {viewMode === 'month' ? monthLabel : viewDate.getFullYear()}
              </h2>

              <button
                type="button"
                onClick={() => moveCalendar(1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface hover:text-text-primary"
                aria-label="Next period"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-4 text-xs text-text-secondary">
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full border-2 border-success" />
                  Initial Balance
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full border-2 border-brand" />
                  Current Balance
                </span>
              </div>

              <div className="flex items-center rounded-lg border border-border p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('month')}
                  className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-colors ${
                    viewMode === 'month' ? 'bg-brand text-white' : 'text-text-secondary hover:bg-surface'
                  }`}
                >
                  Month
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('year')}
                  className={`rounded-md px-4 py-1.5 text-xs font-semibold transition-colors ${
                    viewMode === 'year' ? 'bg-brand text-white' : 'text-text-secondary hover:bg-surface'
                  }`}
                >
                  Year
                </button>
              </div>
            </div>
          </div>

          {viewMode === 'month' ? (
            <>
              <CalendarSummaryBar summary={monthSummary} year={viewDate.getFullYear()} month={viewDate.getMonth()} />

              <div className="mt-4 overflow-x-auto">
                <div className="min-w-[880px]">
                  <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_112px] gap-1.5 px-1 text-center">
                    {CALENDAR_WEEKDAYS.map((day) => (
                      <div key={day} className="py-1.5 text-xs font-medium text-text-muted">
                        {day}
                      </div>
                    ))}
                    <div className="py-1.5 text-xs font-medium text-text-muted">Week</div>
                  </div>

                  <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_112px] gap-1.5">
                    {monthWeeks.map((week) => (
                      <Fragment key={week.key}>
                        {week.days.map((date) => (
                          <CalendarDay
                            key={calendarDateKey(date)}
                            date={date}
                            currentMonth={viewDate.getMonth()}
                            data={groupedTrades[calendarDateKey(date)]}
                            onClick={() => setSelectedDay(date)}
                          />
                        ))}
                        <CalendarWeekTotal week={week} />
                      </Fragment>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="mt-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface px-3 py-2.5 text-xs">
                <span className="text-text-secondary">{yearTrades} {yearTrades === 1 ? 'trade' : 'trades'} in {viewDate.getFullYear()}</span>
                <span className={`tabular-nums font-semibold ${yearTotal > 0 ? 'text-success' : yearTotal < 0 ? 'text-danger' : 'text-text-secondary'}`}>
                  {calendarMoney(yearTotal)}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {yearMonths.map((month) => (
                  <button
                    type="button"
                    key={month.monthStart.getMonth()}
                    onClick={() => {
                      setViewDate(new Date(month.monthStart))
                      setViewMode('month')
                    }}
                    className="rounded-xl border border-border bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-blue-100 hover:shadow-popover"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-text-primary">
                        {month.monthStart.toLocaleDateString('en-US', { month: 'long' })}
                      </span>
                      <span className="text-xs text-text-muted">
                        {month.totalTrades} {month.totalTrades === 1 ? 'trade' : 'trades'}
                      </span>
                    </div>
                    <p className={`mt-3 tabular-nums text-lg font-bold ${month.totalPnl > 0 ? 'text-success' : month.totalPnl < 0 ? 'text-danger' : 'text-text-secondary'}`}>
                      {calendarMoney(month.totalPnl)}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Day details — opens when a calendar day with trades is clicked */}
      <Modal
        open={!!selectedDayData}
        onClose={() => setSelectedDay(null)}
        title={
          selectedDay
            ? selectedDay.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
            : 'Trades'
        }
        footer={
          <Button variant="secondary" onClick={() => setSelectedDay(null)} className="w-32 justify-center">Close</Button>
        }
      >
        {selectedDayData && <CalendarDayDetails data={selectedDayData} />}
      </Modal>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Analytics — equity curve, advanced stats, prop rules, export        */
/* ------------------------------------------------------------------ */

const isResolvedTrade = (t) => t.result === 'WIN' || t.result === 'LOSS' || t.result === 'BREAK_EVEN'
const tradePnlValue = (t) => Number(t.net_profit ?? t.profit ?? 0) || 0
const tradeTime = (t) => {
  const d = new Date(t.opened_at || t.closed_at || 0)
  return Number.isNaN(d.getTime()) ? 0 : d.getTime()
}
// When the trade was closed (falls back to when it was opened).
const tradeClosedTime = (t) => {
  const d = new Date(t.closed_at || t.opened_at || 0)
  return Number.isNaN(d.getTime()) ? 0 : d.getTime()
}

function sortedResolvedTrades(trades) {
  return trades.filter(isResolvedTrade).sort((a, b) => tradeTime(a) - tradeTime(b))
}

/* ---------- Equity curve ---------- */

function buildEquitySeries(trades) {
  let cumulative = 0
  let peak = 0
  const points = [{ n: 0, date: 'Start', symbol: null, pnl: 0, drawdown: 0 }]

  sortedResolvedTrades(trades).forEach((trade, index) => {
    cumulative += tradePnlValue(trade)
    peak = Math.max(peak, cumulative)
    points.push({
      n: index + 1,
      date: trade.opened_at
        ? new Date(trade.opened_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : `Trade ${index + 1}`,
      symbol: trade.symbol,
      pnl: round2(cumulative),
      drawdown: round2(cumulative - peak),
    })
  })

  return points
}

function EquityTooltip({ active, payload, view }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  const value = view === 'pnl' ? p.pnl : p.drawdown

  return (
    <div className="rounded-xl border border-border bg-white px-3 py-2 text-xs shadow-popover">
      <p className="font-semibold text-text-primary">{p.n === 0 ? 'Start' : `#${p.n} · ${p.symbol || 'Trade'}`}</p>
      <p className="text-text-muted">{p.date}</p>
      <p className={`mt-1 tabular-nums font-semibold ${value > 0 ? 'text-success' : value < 0 ? 'text-danger' : 'text-text-secondary'}`}>
        {calendarMoney(value)}
      </p>
    </div>
  )
}

function EquityCurveCard({ trades }) {
  const [view, setView] = useState('pnl')
  const data = useMemo(() => buildEquitySeries(trades), [trades])
  const hasData = data.length > 1
  const last = data[data.length - 1]
  const current = view === 'pnl' ? last.pnl : last.drawdown
  const color = view === 'drawdown' ? '#ef4444' : last.pnl >= 0 ? '#16a34a' : '#ef4444'

  return (
    <Card padded className="flex h-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-ai">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">Equity Curve</p>
            <p className="text-xs text-text-muted">Based on your filtered trades</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {hasData && (
            <span className={`tabular-nums text-sm font-bold ${current > 0 ? 'text-success' : current < 0 ? 'text-danger' : 'text-text-secondary'}`}>
              {calendarMoney(current)}
            </span>
          )}
          <div className="flex items-center rounded-lg border border-border p-0.5">
            <button
              type="button"
              onClick={() => setView('pnl')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                view === 'pnl' ? 'bg-brand text-white' : 'text-text-secondary hover:bg-surface'
              }`}
            >
              Cumulative P&L
            </button>
            <button
              type="button"
              onClick={() => setView('drawdown')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                view === 'drawdown' ? 'bg-brand text-white' : 'text-text-secondary hover:bg-surface'
              }`}
            >
              Drawdown
            </button>
          </div>
        </div>
      </div>

      {hasData ? (
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis
                dataKey="n"
                tickFormatter={(n) => (n === 0 ? 'Start' : `#${n}`)}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString()}`}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                width={64}
              />
              <Tooltip content={<EquityTooltip view={view} />} />
              <Area
                type="monotone"
                dataKey={view === 'pnl' ? 'pnl' : 'drawdown'}
                stroke={color}
                strokeWidth={2}
                fill="url(#equityFill)"
                baseValue={0}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-[260px] flex-col items-center justify-center rounded-xl border border-dashed border-border text-center">
          <p className="text-sm font-medium text-text-primary">No closed trades yet</p>
          <p className="mt-1 max-w-xs text-xs text-text-muted">
            Log a trade with an outcome (Full TP, Loss, etc.) to see your equity curve.
          </p>
        </div>
      )}
    </Card>
  )
}

/* ---------- Advanced statistics ---------- */

function computeAdvancedStats(trades) {
  const pnls = sortedResolvedTrades(trades).map(tradePnlValue)
  const wins = pnls.filter((p) => p > 0)
  const losses = pnls.filter((p) => p < 0)
  const grossProfit = wins.reduce((sum, p) => sum + p, 0)
  const grossLoss = Math.abs(losses.reduce((sum, p) => sum + p, 0))
  const net = grossProfit - grossLoss

  let cumulative = 0
  let peak = 0
  let maxDrawdown = 0
  let winStreak = 0
  let lossStreak = 0
  let currentWin = 0
  let currentLoss = 0

  pnls.forEach((p) => {
    cumulative += p
    peak = Math.max(peak, cumulative)
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative)

    if (p > 0) {
      currentWin += 1
      currentLoss = 0
    } else if (p < 0) {
      currentLoss += 1
      currentWin = 0
    } else {
      currentWin = 0
      currentLoss = 0
    }
    winStreak = Math.max(winStreak, currentWin)
    lossStreak = Math.max(lossStreak, currentLoss)
  })

  return {
    count: pnls.length,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : null,
    expectancy: pnls.length ? net / pnls.length : null,
    avgWin: wins.length ? grossProfit / wins.length : null,
    avgLoss: losses.length ? -grossLoss / losses.length : null,
    maxDrawdown,
    best: pnls.length ? Math.max(...pnls) : null,
    worst: pnls.length ? Math.min(...pnls) : null,
    winStreak,
    lossStreak,
  }
}

function AdvancedStats({ trades }) {
  const s = useMemo(() => computeAdvancedStats(trades), [trades])
  const money = (v) => (v == null ? '—' : calendarMoney(v))
  const signTone = (v) => (v == null || v === 0 ? 'text-text-primary' : v > 0 ? 'text-success' : 'text-danger')

  const items = [
    {
      icon: Scale,
      label: 'Profit Factor',
      hint: 'gross profit ÷ gross loss',
      value: s.profitFactor == null ? '—' : s.profitFactor === Infinity ? '∞' : s.profitFactor.toFixed(2),
      tone: s.profitFactor == null ? 'text-text-primary' : s.profitFactor >= 1 ? 'text-success' : 'text-danger',
      iconBg: 'bg-blue-50 text-brand',
    },
    {
      icon: Activity,
      label: 'Expectancy',
      hint: 'average per trade',
      value: money(s.expectancy),
      tone: signTone(s.expectancy),
      iconBg: 'bg-violet-50 text-ai',
    },
    {
      icon: TrendingUp,
      label: 'Avg Win',
      hint: 'winning trades',
      value: money(s.avgWin),
      tone: s.avgWin == null ? 'text-text-primary' : 'text-success',
      iconBg: 'bg-green-50 text-success',
    },
    {
      icon: TrendingDown,
      label: 'Avg Loss',
      hint: 'losing trades',
      value: money(s.avgLoss),
      tone: s.avgLoss == null ? 'text-text-primary' : 'text-danger',
      iconBg: 'bg-red-50 text-danger',
    },
    {
      icon: ShieldAlert,
      label: 'Max Drawdown',
      hint: 'peak to trough',
      value: s.count
        ? s.maxDrawdown > 0
          ? `-$${s.maxDrawdown.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          : '$0.00'
        : '—',
      tone: s.maxDrawdown > 0 ? 'text-danger' : 'text-text-primary',
      iconBg: 'bg-amber-50 text-warning',
    },
    {
      icon: Trophy,
      label: 'Best Trade',
      hint: 'single highest P&L',
      value: money(s.best),
      tone: signTone(s.best),
      iconBg: 'bg-green-50 text-success',
    },
    {
      icon: AlertTriangle,
      label: 'Worst Trade',
      hint: 'single lowest P&L',
      value: money(s.worst),
      tone: signTone(s.worst),
      iconBg: 'bg-red-50 text-danger',
    },
    {
      icon: Flame,
      label: 'Streaks',
      hint: 'longest win / loss run',
      value: s.count ? `${s.winStreak}W / ${s.lossStreak}L` : '—',
      tone: 'text-text-primary',
      iconBg: 'bg-amber-50 text-warning',
    },
  ]

  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-text-primary">Advanced Statistics</p>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {items.map((item) => (
          <Card
            key={item.label}
            padded
            className="flex flex-col gap-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-popover"
          >
            <div className="flex items-center gap-2">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${item.iconBg}`}>
                <item.icon className="h-4 w-4" />
              </div>
              <span className="text-xs font-medium text-text-secondary">{item.label}</span>
            </div>
            <div>
              <p className={`tabular-nums text-xl font-bold tracking-tight ${item.tone}`}>{item.value}</p>
              <p className="mt-0.5 text-[11px] text-text-muted">{item.hint}</p>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

/* ---------- Prop firm rules tracker ---------- */

const usageTone = (pct) => (pct >= 85 ? 'danger' : pct >= 60 ? 'warning' : 'success')

// Reads the rules already stored on the account (profit_target_percent,
// daily_loss_limit_percent, max_drawdown_percent, starting_balance) and
// measures them against that account's logged trades.
//
// Same behaviour as the Accounts page: when an Evaluation (demo) account
// becomes Funded · Live, its rules start fresh, so only trades closed AFTER
// `funded_started_at` count (earlier trades stay in the journal but don't
// count toward the new payout target / daily loss / drawdown).
function computePropRules(account, accountTrades) {
  const starting = Number(account?.starting_balance) || 0
  const targetPct = Number(account?.profit_target_percent) || 0
  const dailyPct = Number(account?.daily_loss_limit_percent) || 0
  const ddPct = Number(account?.max_drawdown_percent) || 0
  const isFunded = account?.account_type === 'funded'
  const since = account?.funded_started_at ? new Date(account.funded_started_at).getTime() : 0

  const resolved = accountTrades
    .filter(isResolvedTrade)
    .filter((t) => !since || tradeClosedTime(t) >= since)
  const dayKeyOf = (t) => (t.opened_at ? calendarDateKey(new Date(t.opened_at)) : null)
  const todayKey = calendarDateKey(new Date())

  const totalPnl = resolved.reduce((sum, t) => sum + tradePnlValue(t), 0)
  const todayPnl = resolved.filter((t) => dayKeyOf(t) === todayKey).reduce((sum, t) => sum + tradePnlValue(t), 0)
  const tradingDays = new Set(resolved.map(dayKeyOf).filter(Boolean)).size

  const clamp = (n) => Math.min(100, Math.max(0, n))
  const targetAmount = (starting * targetPct) / 100
  const dailyLimit = (starting * dailyPct) / 100
  const ddLimit = (starting * ddPct) / 100
  const dailyUsed = Math.max(0, -todayPnl)
  const ddUsed = Math.max(0, -totalPnl)

  const target =
    targetAmount > 0
      ? {
          amount: targetAmount,
          pct: targetPct,
          progress: clamp((totalPnl / targetAmount) * 100),
          reached: totalPnl >= targetAmount,
          currentPct: (totalPnl / starting) * 100,
        }
      : null
  const daily =
    dailyLimit > 0
      ? { limit: dailyLimit, pct: dailyPct, used: dailyUsed, progress: clamp((dailyUsed / dailyLimit) * 100), breached: dailyUsed >= dailyLimit }
      : null
  const drawdown =
    ddLimit > 0
      ? { limit: ddLimit, pct: ddPct, used: ddUsed, progress: clamp((ddUsed / ddLimit) * 100), breached: ddUsed >= ddLimit }
      : null

  const alerts = []
  if (daily?.breached) alerts.push({ tone: 'danger', text: 'Daily loss limit reached.' })
  else if (daily && daily.progress >= 80) alerts.push({ tone: 'warning', text: `Daily loss is at ${daily.progress.toFixed(0)}% of the limit.` })
  if (drawdown?.breached) alerts.push({ tone: 'danger', text: 'Max drawdown limit reached.' })
  else if (drawdown && drawdown.progress >= 80) alerts.push({ tone: 'warning', text: `Drawdown is at ${drawdown.progress.toFixed(0)}% of the limit.` })
  if (target?.reached) alerts.push({ tone: 'success', text: isFunded ? 'Payout target reached. Payout ready.' : 'Profit target reached.' })

  let status = { label: 'On track', tone: 'success' }
  if (daily?.breached || drawdown?.breached) status = { label: 'Rule breached', tone: 'danger' }
  else if (target?.reached) status = { label: isFunded ? 'Payout ready' : 'Target reached', tone: 'success' }
  else if ((daily && daily.progress >= 80) || (drawdown && drawdown.progress >= 80)) status = { label: 'At risk', tone: 'warning' }

  return {
    totalPnl,
    todayPnl,
    tradingDays,
    target,
    daily,
    drawdown,
    alerts,
    status,
    isFunded,
    hasRules: Boolean(target || daily || drawdown),
  }
}

function RuleRow({ label, value, sub, progress, tone }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="text-text-secondary">{label}</span>
        <span className="tabular-nums font-medium text-text-primary">{value}</span>
      </div>
      <ProgressBar value={progress} tone={tone} />
      <p className="mt-1 text-xs text-text-muted">{sub}</p>
    </div>
  )
}

const alertStyles = {
  danger: 'bg-red-50 text-danger',
  warning: 'bg-amber-50 text-warning',
  success: 'bg-green-50 text-success',
}

function PropRulesCard({ account, trades }) {
  const rules = useMemo(() => (account ? computePropRules(account, trades) : null), [account, trades])
  const money2 = (v) => `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const isFunded = account?.account_type === 'funded'
  const isEvaluation = account?.account_type === 'evaluation'

  return (
    <Card padded className="flex h-full flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-brand">
            <Target className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">Prop Firm Rules</p>
            <p className="text-xs text-text-muted">
              {account ? `${account.name}${account.firm ? ` · ${account.firm}` : ''}` : 'No account selected'}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {rules?.hasRules && <Badge tone={rules.status.tone}>{rules.status.label}</Badge>}
          {isFunded && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-2.5 py-1 text-[11px] font-semibold text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-white" /> Funded · Live
            </span>
          )}
          {isEvaluation && (
            <span className="inline-flex items-center rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-text-secondary">
              Demo · Evaluation
            </span>
          )}
        </div>
      </div>

      {!account && (
        <p className="text-sm text-text-muted">Pick an account from the top bar to track its rules.</p>
      )}

      {account && rules && !rules.hasRules && (
        <div className="rounded-xl border border-dashed border-border p-4 text-center">
          <p className="text-sm font-medium text-text-primary">No rules set for this account</p>
          <p className="mt-1 text-xs text-text-muted">
            Add a starting balance, Profit Target, Daily Loss Limit and Max Drawdown from Accounts → Edit.
          </p>
        </div>
      )}

      {account && rules?.hasRules && (
        <>
          {rules.alerts.length > 0 && (
            <div className="flex flex-col gap-2">
              {rules.alerts.map((alert) => (
                <div
                  key={alert.text}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium ${alertStyles[alert.tone]}`}
                >
                  {alert.tone === 'success' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                  {alert.text}
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-4">
            {rules.target && (
              <RuleRow
                label={isFunded ? 'Payout Target' : 'Profit Target'}
                value={`${calendarMoney(rules.totalPnl)} / ${money2(rules.target.amount)}`}
                sub={`${rules.target.currentPct.toFixed(2)}% of ${rules.target.pct}% target${
                  isEvaluation ? ' · reach it to unlock Funded · Live' : ''
                }`}
                progress={rules.target.progress}
                tone="success"
              />
            )}
            {rules.daily && (
              <RuleRow
                label="Daily Loss"
                value={`${money2(rules.daily.used)} / ${money2(rules.daily.limit)}`}
                sub={`Today's P&L ${calendarMoney(rules.todayPnl)} · limit ${rules.daily.pct}%`}
                progress={rules.daily.progress}
                tone={usageTone(rules.daily.progress)}
              />
            )}
            {rules.drawdown && (
              <RuleRow
                label="Max Drawdown"
                value={`${money2(rules.drawdown.used)} / ${money2(rules.drawdown.limit)}`}
                sub={`Loss from starting balance · limit ${rules.drawdown.pct}%`}
                progress={rules.drawdown.progress}
                tone={usageTone(rules.drawdown.progress)}
              />
            )}
          </div>

          <div className="mt-auto flex items-center justify-between border-t border-border/70 pt-3 text-xs text-text-muted">
            <span>
              Trading days: <span className="font-semibold text-text-primary">{rules.tradingDays}</span>
            </span>
            <span>
              {isFunded && account?.funded_started_at
                ? `Funded since ${new Date(account.funded_started_at).toLocaleDateString()}`
                : 'Based on logged trades'}
            </span>
          </div>
        </>
      )}
    </Card>
  )
}

/* ---------- Export (CSV + PDF) ---------- */

function csvEscape(value) {
  const s = value == null ? '' : String(value)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function exportTradesCsv(trades, accountsById) {
  const headers = [
    'Date', 'Account', 'Pair', 'Direction', 'Setup', 'Session', 'Entry',
    'Stop Loss', 'SL Pips', 'Take Profit', 'TP Pips', 'Lot Size', 'RR',
    'Risk $', 'Risk %', 'Outcome', 'Result', 'Status', 'Net P&L', 'Lesson',
  ]

  const rows = trades.map((t) => [
    t.opened_at ? calendarDateKey(new Date(t.opened_at)) : '',
    accountsById[t.account_id]?.name ?? '',
    t.symbol,
    t.direction,
    t.setup ?? '',
    t.session ?? '',
    t.entry_price ?? '',
    t.stop_loss ?? '',
    t.sl_pips ?? '',
    t.take_profit ?? '',
    t.tp_pips ?? '',
    t.volume ?? '',
    t.rr ?? '',
    t.risk_amount ?? '',
    t.risk_percent ?? '',
    outcomeLabel[getOutcome(t)],
    t.result ?? '',
    t.status ?? '',
    tradePnlValue(t),
    t.lesson ?? '',
  ])

  // BOM so Excel opens the file as UTF-8.
  const csv = '\uFEFF' + [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `tradora-journal-${calendarDateKey(new Date())}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Opens a print-ready report in a new tab; the browser's "Save as PDF"
// destination turns it into a PDF — no extra library needed.
function exportTradesPdf(trades, accountsById, stats) {
  const win = window.open('', '_blank')
  if (!win) return false

  const rows = trades
    .map((t) => {
      const pnl = tradePnlValue(t)
      const pnlClass = pnl > 0 ? 'pos' : pnl < 0 ? 'neg' : ''
      return `<tr>
        <td>${escapeHtml(t.opened_at ? calendarDateKey(new Date(t.opened_at)) : '—')}</td>
        <td>${escapeHtml(accountsById[t.account_id]?.name ?? '—')}</td>
        <td><strong>${escapeHtml(t.symbol)}</strong></td>
        <td>${escapeHtml(t.direction)}</td>
        <td>${escapeHtml(t.setup ?? '—')}</td>
        <td>${escapeHtml(t.stop_loss ?? '—')}${t.sl_pips ? ` (${escapeHtml(t.sl_pips)}p)` : ''}</td>
        <td>${escapeHtml(t.take_profit ?? '—')}${t.tp_pips ? ` (${escapeHtml(t.tp_pips)}p)` : ''}</td>
        <td>${escapeHtml(t.rr ?? '—')}</td>
        <td>${escapeHtml(t.risk_amount != null ? `$${t.risk_amount}` : '—')}</td>
        <td class="${pnlClass}">${escapeHtml(calendarMoney(pnl))}</td>
        <td>${escapeHtml(resultLabel[t.result] ?? '—')}</td>
        <td>${escapeHtml(outcomeLabel[getOutcome(t)])}</td>
      </tr>`
    })
    .join('')

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>TRADORA Trading Journal Report</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 0; font-size: 11px; }
  h1 { font-size: 20px; margin: 0; }
  .sub { color: #64748b; margin: 4px 0 16px; }
  .stats { display: flex; gap: 12px; margin-bottom: 16px; }
  .stat { flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; }
  .stat span { display: block; color: #64748b; font-size: 10px; }
  .stat strong { font-size: 15px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .04em; color: #64748b; background: #f1f5f9; padding: 8px 6px; }
  td { padding: 7px 6px; border-bottom: 1px solid #e2e8f0; }
  .pos { color: #16a34a; font-weight: 600; }
  .neg { color: #dc2626; font-weight: 600; }
  tr { page-break-inside: avoid; }
</style>
</head>
<body>
  <h1>TRADORA — Trading Journal Report</h1>
  <p class="sub">Generated ${escapeHtml(new Date().toLocaleString('en-US'))} · ${trades.length} trades</p>
  <div class="stats">
    <div class="stat"><span>Total Trades</span><strong>${escapeHtml(stats.total)}</strong></div>
    <div class="stat"><span>Win Rate</span><strong>${escapeHtml(stats.winRate.toFixed(1))}%</strong></div>
    <div class="stat"><span>Average RR</span><strong>1:${escapeHtml(stats.avgRR.toFixed(2))}</strong></div>
    <div class="stat"><span>Net P&amp;L</span><strong class="${stats.netPnl >= 0 ? 'pos' : 'neg'}">${escapeHtml(calendarMoney(stats.netPnl))}</strong></div>
    <div class="stat"><span>Average Risk</span><strong>${escapeHtml(stats.avgRisk.toFixed(2))}%</strong></div>
  </div>
  <table>
    <thead>
      <tr><th>Date</th><th>Account</th><th>Pair</th><th>Dir</th><th>Setup</th><th>SL</th><th>TP</th><th>RR</th><th>Risk</th><th>P&amp;L</th><th>Result</th><th>Outcome</th></tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`

  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 400)
  return true
}

function ExportMenu({ onCsv, onPdf, disabled }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <Button variant="secondary" icon={Download} onClick={() => setOpen((v) => !v)} disabled={disabled}>
        Export
      </Button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-48 rounded-xl border border-border bg-white p-1.5 shadow-popover animate-slide-up">
          <button
            type="button"
            onClick={() => { onCsv(); setOpen(false) }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface hover:text-text-primary"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Export CSV
          </button>
          <button
            type="button"
            onClick={() => { onPdf(); setOpen(false) }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface hover:text-text-primary"
          >
            <FileText className="h-3.5 w-3.5" /> Export PDF
          </button>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Loading / error states                                              */
/* ------------------------------------------------------------------ */

function JournalSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <Card key={i} padded>
            <LoadingSkeleton className="h-3 w-16" />
            <LoadingSkeleton className="mt-3 h-6 w-12" />
          </Card>
        ))}
      </div>
      <Card>
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border/70 py-3 last:border-0">
            <LoadingSkeleton className="h-4 w-16" />
            <LoadingSkeleton className="h-4 w-20" />
            <LoadingSkeleton className="h-4 w-16" />
            <LoadingSkeleton className="ml-auto h-4 w-16" />
          </div>
        ))}
      </Card>
    </div>
  )
}

function ErrorState({ message, onRetry }) {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-danger">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <p className="text-sm font-semibold text-text-primary">Couldn't load your journal</p>
      <p className="max-w-xs text-sm text-text-muted">{message}</p>
      <Button variant="secondary" icon={RefreshCw} onClick={onRetry} className="mt-2">Retry</Button>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Page component                                                      */
/* ------------------------------------------------------------------ */

export default function Journal() {
  const { showToast } = useToast()
  const { accounts, refresh: refreshAccounts } = useAccounts()
  const { trades, loading, error, mutating, refresh, createManualTrade, updateTrade, deleteTrade } = useTrades()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [filters, setFilters] = useState(defaultFilters)
  const [query, setQuery] = useState('')
  const [selectedTrade, setSelectedTrade] = useState(null)
  const [loadingTradeDetail, setLoadingTradeDetail] = useState(false)
  const [editingTrade, setEditingTrade] = useState(null)
  const [deletingTrade, setDeletingTrade] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState(null)
  const [passAlert, setPassAlert] = useState(null)
  const handledPass = useRef(new Set())

  // The Journal list intentionally excludes screenshot data (see
  // tradeService.getTrades) to keep it fast — fetch the full row,
  // screenshots included, only when a trade is actually opened.
  const handleSelectTrade = async (trade) => {
    setSelectedTrade(trade)
    setLoadingTradeDetail(true)
    try {
      const full = await getTradeById(trade.id)
      setSelectedTrade(full)
    } catch (err) {
      showToast({ type: 'error', title: 'Could not load trade details', description: err.message })
    } finally {
      setLoadingTradeDetail(false)
    }
  }

  useEffect(() => {
    if (accounts.length && !selectedAccount) setSelectedAccount(accounts[0])
  }, [accounts, selectedAccount])

  const accountsById = useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a])), [accounts])
  const symbols = useMemo(() => [...new Set(trades.map((t) => t.symbol))], [trades])
  const setups = useMemo(() => [...new Set(trades.map((t) => t.setup).filter(Boolean))], [trades])

  // Evaluation (demo) accounts that reach their profit target become Funded · Live
  // automatically (same rule as the Accounts page): balance restarts from the starting
  // balance, a fresh 3% payout target begins, and the logged trades stay in the journal.
  useEffect(() => {
    if (loading || error || !accounts.length) return undefined
    let cancelled = false
    ;(async () => {
      for (const a of accounts) {
        if (cancelled) return
        if (a.account_type !== 'evaluation' || ['failed', 'inactive', 'passed'].includes(a.status)) continue
        if (handledPass.current.has(a.id)) continue

        const rules = computePropRules(a, trades.filter((t) => t.account_id === a.id))
        if (!rules.target?.reached || rules.daily?.breached || rules.drawdown?.breached) continue

        handledPass.current.add(a.id)
        const { error: rpcErr } = await supabase.rpc('pass_evaluation', {
          p_account: a.id,
          p_funded_target: FUNDED_TARGET_PCT,
        })
        if (rpcErr) {
          if (/not an evaluation/i.test(rpcErr.message || '')) {
            await refreshAccounts()
          } else {
            showToast({
              type: 'error',
              title: 'Could not switch to Funded · Live',
              description: rpcErr.message || 'Run the pass_evaluation SQL in Supabase first.',
            })
          }
          continue
        }
        setPassAlert({ name: a.name, balance: Number(a.starting_balance), target: FUNDED_TARGET_PCT })
        await refreshAccounts()
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, trades, loading, error])

  const filtered = useMemo(() => {
    return trades.filter((t) => {
      if (filters.account !== 'all' && t.account_id !== filters.account) return false
      if (filters.symbol !== 'all' && t.symbol !== filters.symbol) return false
      if (filters.direction !== 'all' && t.direction !== filters.direction) return false
      if (filters.setup !== 'all' && t.setup !== filters.setup) return false
      if (filters.session !== 'all' && t.session !== filters.session) return false
      if (filters.result !== 'all' && t.result !== filters.result) return false
      if (filters.dateRange !== 'all') {
        const days = { '7d': 7, '30d': 30, '90d': 90 }[filters.dateRange]
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - days)
        if (!t.opened_at || new Date(t.opened_at) < cutoff) return false
      }
      if (query.trim()) {
        const q = query.toLowerCase()
        const haystack = `${t.symbol} ${t.setup || ''} ${t.entry_reason || ''} ${t.notes || ''}`.toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [trades, filters, query])

  const stats = useMemo(() => computeJournalStats(filtered), [filtered])

  // Prop firm rules follow the account picked in the top bar and always use
  // that account's full trade history (not the table filters).
  const rulesAccount = selectedAccount ? accountsById[selectedAccount.id] || selectedAccount : null
  const rulesTrades = useMemo(
    () => (rulesAccount ? trades.filter((t) => t.account_id === rulesAccount.id) : []),
    [trades, rulesAccount]
  )

  const handleExportCsv = () => {
    if (filtered.length === 0) {
      showToast({ type: 'error', title: 'Nothing to export', description: 'No trades match your current filters.' })
      return
    }
    exportTradesCsv(filtered, accountsById)
    showToast({ type: 'success', title: 'CSV exported', description: `${filtered.length} trades downloaded.` })
  }

  const handleExportPdf = () => {
    if (filtered.length === 0) {
      showToast({ type: 'error', title: 'Nothing to export', description: 'No trades match your current filters.' })
      return
    }
    const opened = exportTradesPdf(filtered, accountsById, stats)
    if (!opened) {
      showToast({ type: 'error', title: 'Popup blocked', description: 'Allow popups for this site to export the PDF.' })
    }
  }

  const handleNewTrade = async (payload) => {
    try {
      await createManualTrade(payload)
      setFormOpen(false)
      showToast({ type: 'success', title: 'Trade logged', description: 'Your trade was added to the journal.' })
    } catch (err) {
      showToast({ type: 'error', title: 'Could not save trade', description: err.message })
    }
  }

  const handleEditTrade = async (tradeId, payload) => {
    try {
      const updated = await updateTrade(tradeId, payload)
      setEditingTrade(null)
      setSelectedTrade(updated)
      showToast({ type: 'success', title: 'Trade updated', description: 'Your changes were saved.' })
    } catch (err) {
      showToast({ type: 'error', title: 'Could not update trade', description: err.message })
    }
  }

  const handleDeleteTrade = async () => {
    try {
      await deleteTrade(deletingTrade.id)
      setDeletingTrade(null)
      setSelectedTrade(null)
      showToast({ type: 'success', title: 'Trade deleted' })
    } catch (err) {
      showToast({ type: 'error', title: 'Could not delete trade', description: err.message })
    }
  }

  return (
    <div className="flex min-h-screen bg-bg font-sans antialiased" style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`}</style>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onMenuClick={() => setSidebarOpen(true)}
          accounts={accounts.map((a) => ({ id: a.id, label: a.name, status: a.mt5_connected ? 'connected' : 'disconnected' }))}
          selectedAccount={selectedAccount ? { label: selectedAccount.name } : { label: 'No Account' }}
          onSelectAccount={(a) => setSelectedAccount(accounts.find((acc) => acc.id === a.id))}
          breadcrumb="Overview / Trading Journal"
        />

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-brand">
                <Hash className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-[28px] font-bold tracking-tight text-text-primary sm:text-[32px]">Trading Journal</h1>
                <p className="mt-1 text-sm text-text-secondary">Record every decision. Review every trade. Improve your execution.</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <ExportMenu onCsv={handleExportCsv} onPdf={handleExportPdf} disabled={loading} />
              <Button icon={Plus} onClick={() => setFormOpen(true)} disabled={accounts.length === 0}>New Trade</Button>
            </div>
          </div>

          {loading && <JournalSkeleton />}

          {!loading && error && <ErrorState message={error} onRetry={refresh} />}

          {!loading && !error && (
            <>
              <div className="mb-6">
                <JournalStats stats={stats} />
              </div>

              <div className="relative mb-4 max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search trades, pairs, setups or notes..."
                  className="h-11 w-full rounded-xl border border-border bg-white pl-10 pr-3 text-[15px] text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                />
              </div>

              <div className="mb-6 rounded-2xl border border-border bg-card p-4 shadow-card">
                <TradeFilters filters={filters} setFilters={setFilters} accounts={accounts} symbols={symbols} setups={setups} />
              </div>

              {trades.length === 0 ? (
                <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <p className="text-sm font-semibold text-text-primary">No trades logged yet.</p>
                  <p className="max-w-xs text-sm text-text-muted">
                    Log a trade manually, or connect MT5 on an account to sync trades automatically.
                  </p>
                  <Button icon={Plus} onClick={() => setFormOpen(true)} className="mt-2" disabled={accounts.length === 0}>New Trade</Button>
                </Card>
              ) : (
                <TradeTable trades={filtered} accountsById={accountsById} onSelect={handleSelectTrade} />
              )}

              <div className="mt-6">
                <JournalCalendar trades={filtered} />
              </div>

              <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
                <div className="xl:col-span-2">
                  <EquityCurveCard trades={filtered} />
                </div>
                <PropRulesCard account={rulesAccount} trades={rulesTrades} />
              </div>

              <div className="mt-6">
                <AdvancedStats trades={filtered} />
              </div>
            </>
          )}
        </main>
      </div>

      <TradeDetailDrawer
        trade={selectedTrade}
        accountName={selectedTrade ? accountsById[selectedTrade.account_id]?.name : ''}
        open={!!selectedTrade}
        onClose={() => setSelectedTrade(null)}
        onEdit={(trade) => setEditingTrade(trade)}
        onDelete={(trade) => setDeletingTrade(trade)}
      />

      <TradeForm open={formOpen} onClose={() => setFormOpen(false)} onSubmit={handleNewTrade} accounts={accounts} submitting={mutating} />

      <EditTradeForm
        open={!!editingTrade}
        onClose={() => setEditingTrade(null)}
        onSubmit={handleEditTrade}
        trade={editingTrade}
        accounts={accounts}
        submitting={mutating}
      />

      <Modal
        open={!!deletingTrade}
        onClose={() => setDeletingTrade(null)}
        title="Delete Trade?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeletingTrade(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDeleteTrade} loading={mutating}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-text-secondary">
          Are you sure you want to delete this <span className="font-semibold text-text-primary">{deletingTrade?.symbol}</span> trade?
          This will permanently remove it from your journal and cannot be undone.
        </p>
      </Modal>

      {/* Evaluation passed -> Funded · Live */}
      <Modal
        open={!!passAlert}
        onClose={() => setPassAlert(null)}
        title="You passed your account!"
        footer={<Button onClick={() => setPassAlert(null)}>Continue</Button>}
      >
        <div className="py-5 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-success">
            <Trophy className="h-8 w-8" />
          </div>
          <p className="mt-4 text-lg font-bold text-text-primary">Congratulations! 🎉</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-text-secondary">
            Your demo evaluation is complete. <span className="font-semibold text-text-primary">{passAlert?.name}</span> is now{' '}
            <span className="font-semibold text-success">Funded · Live</span> and starts fresh from{' '}
            <span className="font-semibold text-text-primary">${Number(passAlert?.balance || 0).toLocaleString()}</span> with a new{' '}
            {passAlert?.target}% payout target (0% progress). Your evaluation trades stay in your Journal.
          </p>
        </div>
      </Modal>
    </div>
  )
}