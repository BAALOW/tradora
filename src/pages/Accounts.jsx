import { useState, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Search, Wallet, DollarSign, TrendingUp, TrendingDown, Activity,
  MoreHorizontal, Eye, Pencil, Copy, Archive, Trash2, AlertTriangle,
  RefreshCw, Link2, Link2Off, Trophy, ShieldAlert, CheckCircle2,
} from 'lucide-react'

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
import LoadingSkeleton from '../components/ui/LoadingSkeleton'
import { useToast } from '../components/ui/Toast'

import { useAccounts } from '../hooks/useAccounts'
import { supabase } from '../lib/supabaseClient'
import { calcPnl, calcPnlPct, calcProfitTargetProgress, statusLabel, typeLabel } from '../lib/accountCalculations'

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

// Evaluation = demo (no real money, no payouts). Funded = live (real payouts).
const FUNDED_TARGET_PCT = 3 // profit/payout target of the new Funded · Live account
const typeText = (a) =>
  a.account_type === 'funded' ? 'Funded · Live'
    : a.account_type === 'evaluation' ? 'Evaluation · Demo'
    : typeLabel(a.account_type)

// Risk usage for one account. todayPnl = realized P/L of trades closed today.
function calcRisk(a, todayPnl = 0) {
  const start = Number(a.starting_balance) || 0
  const dailyLimit = Number(a.daily_loss_limit_percent) || 0
  const ddLimit = Number(a.max_drawdown_percent) || 0
  if (start <= 0) return { dailyLossPct: 0, ddPct: 0, dailyLimit, ddLimit, dailyBreached: false, ddBreached: false }
  const bal = Number(a.current_balance ?? start)
  const eq = a.current_equity != null && a.current_equity !== '' ? Number(a.current_equity) : bal
  const floating = eq - bal
  const dailyLossPct = (Math.max(0, -(todayPnl + floating)) / start) * 100
  const ddPct = (Math.max(0, start - eq) / start) * 100
  return {
    dailyLossPct, ddPct, dailyLimit, ddLimit,
    dailyBreached: dailyLimit > 0 && dailyLossPct >= dailyLimit,
    ddBreached: ddLimit > 0 && ddPct >= ddLimit,
  }
}

const breachReason = (risk) =>
  risk.dailyBreached ? 'Daily loss limit' : risk.ddBreached ? 'Max drawdown' : 'Account rule'

function useCountUp(target, ms = 1200) {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf
    const t0 = performance.now()
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / ms)
      setV(target * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return v
}

/* ------------------------------------------------------------------ */
/* Animations (small, self-contained)                                  */
/* ------------------------------------------------------------------ */

const ACC_STYLES = `
@keyframes acc-shine { 0% { transform: translateX(-100%) } 100% { transform: translateX(100%) } }
.acc-shine { background: linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent); animation: acc-shine 2.2s ease-in-out infinite; }
@keyframes acc-pop { 0% { transform: scale(.6); opacity: 0 } 60% { transform: scale(1.12); opacity: 1 } 100% { transform: scale(1) } }
.acc-pop { animation: acc-pop .6s cubic-bezier(.2,.9,.3,1.2) both; }
@keyframes acc-confetti { 0% { transform: translateY(-20px) rotate(0); opacity: 1 } 100% { transform: translateY(220px) rotate(560deg); opacity: 0 } }
@keyframes acc-ring { 0% { box-shadow: 0 0 0 0 rgba(16,185,129,.55) } 100% { box-shadow: 0 0 0 10px rgba(16,185,129,0) } }
.acc-ring { animation: acc-ring 1.8s infinite; }
@keyframes acc-shake { 0%,100% { transform: translateX(0) } 20%,60% { transform: translateX(-4px) } 40%,80% { transform: translateX(4px) } }
.acc-shake { animation: acc-shake .5s; }
@keyframes acc-glow { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
.acc-glow { animation: acc-glow 1.6s ease-in-out infinite; }
`

const CONFETTI_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#14b8a6']

function Confetti() {
  const pieces = useMemo(
    () => Array.from({ length: 28 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      dur: 1.6 + Math.random() * 1.2,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 6 + Math.random() * 6,
    })),
    [],
  )
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-full overflow-hidden" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-0 rounded-[2px]"
          style={{
            left: `${p.left}%`, width: p.size, height: p.size * 0.6, background: p.color,
            animation: `acc-confetti ${p.dur}s ease-in ${p.delay}s both`,
          }}
        />
      ))}
    </div>
  )
}

function AnimatedBar({ value, tone = 'brand', done = false }) {
  const [w, setW] = useState(0)
  useEffect(() => {
    const id = setTimeout(() => setW(Math.min(100, Math.max(0, value))), 80)
    return () => clearTimeout(id)
  }, [value])
  const grad = tone === 'danger'
    ? 'from-rose-400 to-red-600'
    : done || tone === 'success'
      ? 'from-emerald-400 to-teal-500'
      : 'from-blue-400 to-indigo-600'
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className={`relative h-full overflow-hidden rounded-full bg-gradient-to-r ${grad} transition-[width] duration-[1400ms] ease-out ${done ? 'acc-glow' : ''}`}
        style={{ width: `${w}%` }}
      >
        <span className="acc-shine absolute inset-0 rounded-full" />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Page-only components (used exclusively on the Accounts page)        */
/* ------------------------------------------------------------------ */

const statusToneMap = {
  healthy: 'success',
  passed: 'success',
  caution: 'warning',
  at_risk: 'danger',
  failed: 'danger',
  inactive: 'neutral',
}

function AccountStatusBadge({ status, breached }) {
  if (breached) return <Badge tone="danger">Breached</Badge>
  return <Badge tone={statusToneMap[status] || 'neutral'}>{statusLabel(status)}</Badge>
}

function FundedPill() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm">
      <span className="acc-ring h-1.5 w-1.5 rounded-full bg-white" /> Funded · Live
    </span>
  )
}

function AccountProgress({ label, valuePct, targetPct, tone = 'brand', doneText = 'Target reached' }) {
  const pct = targetPct ? Math.min(100, Math.max(0, (valuePct / targetPct) * 100)) : 0
  const shown = useCountUp(valuePct)
  const done = tone !== 'danger' && pct >= 100
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-text-secondary">
          {label}
          {done && (
            <span className="acc-pop inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-success">
              <CheckCircle2 className="h-3 w-3" /> {doneText}
            </span>
          )}
        </span>
        <span className="tabular-nums font-medium text-text-primary">
          {shown.toFixed(1)}% {targetPct ? `/ ${targetPct}%` : ''}
        </span>
      </div>
      <AnimatedBar value={pct} tone={tone} done={done} />
    </div>
  )
}

function DemoPill() {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-semibold text-text-secondary">
      Demo · Evaluation
    </span>
  )
}

function Mt5Indicator({ connected }) {
  return connected ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
      <Link2 className="h-3 w-3" /> MT5 Connected
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-text-muted">
      <Link2Off className="h-3 w-3" /> MT5 Not Connected
    </span>
  )
}

function BreachBanner({ reason, onNew }) {
  return (
    <div className="acc-shake rounded-xl border border-red-200 bg-red-50 p-3.5">
      <div className="flex items-start gap-2.5">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-danger">You breached your account</p>
          <p className="mt-0.5 text-xs text-text-secondary">
            {reason} reached. Get a new account and don't give up. Every trader falls; the ones who keep learning get funded.
          </p>
        </div>
      </div>
      {onNew && (
        <button
          onClick={onNew}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" /> Get a new account
        </button>
      )}
    </div>
  )
}

function PassedBanner({ type }) {
  const archived = type !== 'funded'
  return (
    <div className="acc-pop flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5">
      <Trophy className="mt-0.5 h-5 w-5 shrink-0 text-success" />
      <div>
        <p className="text-sm font-semibold text-success">{archived ? 'Evaluation passed' : 'You passed your account!'}</p>
        <p className="mt-0.5 text-xs text-text-secondary">
          {archived
            ? 'Archived demo evaluation. Your Funded · Live account started fresh from its starting balance.'
            : 'Evaluation complete. This account is now Funded · Live.'}
        </p>
      </div>
    </div>
  )
}

function AccountCard({ account, todayPnl, onView, onEdit, onDuplicate, onArchive, onDelete, onNewAccount }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const pnl = calcPnl(account)
  const pnlPct = calcPnlPct(account)
  const pnlPositive = pnl >= 0
  const progress = calcProfitTargetProgress(account)
  const risk = calcRisk(account, todayPnl)
  const breached = risk.dailyBreached || risk.ddBreached || account.status === 'failed'
  const passed = !breached && account.status === 'passed'

  return (
    <Card className={`flex flex-col gap-4 ${breached ? 'border-red-200' : ''}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-brand">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-text-primary">{account.name}</p>
            <p className="text-xs text-text-muted">
              {account.firm || 'No firm set'} · {typeText(account)} · {account.account_number || '—'}
            </p>
          </div>
        </div>

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface hover:text-text-secondary"
            aria-label="More actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-30 mt-1 w-44 rounded-xl border border-border bg-white p-1.5 shadow-popover animate-slide-up">
              <button
                onClick={() => { onEdit(account); setMenuOpen(false) }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface hover:text-text-primary"
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              <button
                onClick={() => { onDuplicate(account); setMenuOpen(false) }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface hover:text-text-primary"
              >
                <Copy className="h-3.5 w-3.5" /> Duplicate
              </button>
              <button
                onClick={() => { onArchive(account); setMenuOpen(false) }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-text-secondary hover:bg-surface hover:text-text-primary"
              >
                <Archive className="h-3.5 w-3.5" /> Archive
              </button>
              <div className="my-1 h-px bg-border" />
              <button
                onClick={() => { onDelete(account); setMenuOpen(false) }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AccountStatusBadge status={account.status} breached={breached} />
          {account.account_type === 'funded' && !breached && <FundedPill />}
          {account.account_type === 'evaluation' && !breached && account.status !== 'passed' && <DemoPill />}
        </div>
        <Mt5Indicator connected={account.mt5_connected} />
      </div>

      {breached && <BreachBanner reason={breachReason(risk)} onNew={onNewAccount} />}
      {passed && <PassedBanner type={account.account_type} />}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-medium text-text-muted">Balance</p>
          <p className="tabular-nums mt-1 text-lg font-bold text-text-primary">
            ${Number(account.current_balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-text-muted">Equity</p>
          <p className="tabular-nums mt-1 text-lg font-bold text-text-primary">
            {account.current_equity != null
              ? `$${Number(account.current_equity).toLocaleString(undefined, { minimumFractionDigits: 2 })}`
              : 'N/A'}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-text-muted">P&L</p>
          <p className={`tabular-nums mt-1 flex items-center gap-1 text-lg font-bold ${pnlPositive ? 'text-success' : 'text-danger'}`}>
            {pnlPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            {pnlPositive ? '+' : ''}${pnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-text-muted">P&L %</p>
          <p className={`tabular-nums mt-1 text-lg font-bold ${pnlPositive ? 'text-success' : 'text-danger'}`}>
            {pnlPositive ? '+' : ''}{pnlPct.toFixed(2)}%
          </p>
        </div>
      </div>

      {progress !== null && (
        <AccountProgress label={account.account_type === 'funded' ? 'Payout Target' : 'Profit Target'} doneText={account.account_type === 'funded' ? 'Payout ready' : 'Target reached'} valuePct={Math.max(0, pnlPct)} targetPct={account.profit_target_percent} />
      )}

      <button
        onClick={() => onView(account)}
        className="mt-1 flex items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-surface"
      >
        <Eye className="h-4 w-4" /> View Details
      </button>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Add / Edit form (every field is required except Notes)              */
/* ------------------------------------------------------------------ */

const emptyForm = {
  name: '',
  firm: '',
  account_type: 'evaluation',
  platform: 'MT5',
  account_number: '',
  server: '',
  starting_balance: '',
  current_balance: '',
  current_equity: '',
  currency: 'USD',
  leverage: '',
  profit_target_percent: '',
  daily_loss_limit_percent: '',
  max_drawdown_percent: '',
  status: 'healthy',
  notes: '',
}

const REQUIRED_FIELDS = [
  ['name', 'Account Name'],
  ['firm', 'Firm / Broker'],
  ['account_number', 'Account Number'],
  ['server', 'Server'],
  ['starting_balance', 'Starting Balance'],
  ['current_balance', 'Current Balance'],
  ['current_equity', 'Current Equity'],
  ['leverage', 'Leverage'],
  ['profit_target_percent', 'Profit Target %'],
  ['daily_loss_limit_percent', 'Daily Loss Limit %'],
  ['max_drawdown_percent', 'Max Drawdown %'],
]
const isBlank = (v) => String(v ?? '').trim() === ''

function AccountForm({ open, onClose, onSubmit, initialValues, submitting }) {
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})
  const [missing, setMissing] = useState([])
  const formRef = useRef(null)

  useEffect(() => {
    if (open) {
      setForm(
        initialValues
          ? {
              name: initialValues.name || '',
              firm: initialValues.firm || '',
              account_type: initialValues.account_type || 'evaluation',
              platform: initialValues.platform || 'MT5',
              account_number: initialValues.account_number || '',
              server: initialValues.server || '',
              starting_balance: initialValues.starting_balance ?? '',
              current_balance: initialValues.current_balance ?? '',
              current_equity: initialValues.current_equity ?? '',
              currency: initialValues.currency || 'USD',
              leverage: initialValues.leverage ?? '',
              profit_target_percent: initialValues.profit_target_percent ?? '',
              daily_loss_limit_percent: initialValues.daily_loss_limit_percent ?? '',
              max_drawdown_percent: initialValues.max_drawdown_percent ?? '',
              status: initialValues.status || 'healthy',
              notes: initialValues.notes || '',
            }
          : emptyForm
      )
      setErrors({})
      setMissing([])
    }
  }, [open, initialValues])

  const set = (key) => (e) => {
    const value = e.target.value
    setForm((f) => ({ ...f, [key]: value }))
    if (errors[key]) setErrors((er) => { const n = { ...er }; delete n[key]; return n })
  }

  const validate = () => {
    const next = {}
    const blanks = []
    REQUIRED_FIELDS.forEach(([key, label]) => {
      if (isBlank(form[key])) { next[key] = 'Required: please fill in this field.'; blanks.push(label) }
    })
    if (!form.account_type) next.account_type = 'Select an account type.'
    if (!form.platform) next.platform = 'Select a platform.'
    if (!form.currency) next.currency = 'Select a currency.'

    const n = (k) => Number(form[k])
    if (!next.starting_balance && !(n('starting_balance') > 0)) next.starting_balance = 'Enter a number greater than 0.'
    if (!next.current_balance && !(n('current_balance') >= 0)) next.current_balance = 'Enter a valid balance.'
    if (!next.current_equity && !(n('current_equity') >= 0)) next.current_equity = 'Enter a valid equity.'
    if (!next.leverage && !(n('leverage') > 0)) next.leverage = 'Enter a number greater than 0.'
    if (!next.profit_target_percent && !(n('profit_target_percent') > 0)) next.profit_target_percent = 'Enter a number greater than 0.'
    if (!next.daily_loss_limit_percent && !(n('daily_loss_limit_percent') > 0 && n('daily_loss_limit_percent') <= 100)) next.daily_loss_limit_percent = 'Enter a % between 0 and 100.'
    if (!next.max_drawdown_percent && !(n('max_drawdown_percent') > 0 && n('max_drawdown_percent') <= 100)) next.max_drawdown_percent = 'Enter a % between 0 and 100.'

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
    const payload = {
      name: form.name.trim(),
      firm: form.firm.trim(),
      account_type: form.account_type,
      platform: form.platform,
      account_number: form.account_number.trim(),
      server: form.server.trim(),
      starting_balance: Number(form.starting_balance),
      current_balance: Number(form.current_balance),
      current_equity: Number(form.current_equity),
      currency: form.currency,
      leverage: Number(form.leverage),
      profit_target_percent: Number(form.profit_target_percent),
      daily_loss_limit_percent: Number(form.daily_loss_limit_percent),
      max_drawdown_percent: Number(form.max_drawdown_percent),
      notes: form.notes.trim() || null,
    }
    if (initialValues) payload.status = form.status
    onSubmit(payload)
  }

  const errorCount = Object.keys(errors).length

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initialValues ? 'Edit Account' : 'Add Account'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} loading={submitting}>
            {initialValues ? 'Save Changes' : 'Add Account'}
          </Button>
        </>
      }
    >
      <form ref={formRef} noValidate className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1" onSubmit={handleSubmit}>
        {errorCount > 0 && (
          <div role="alert" className="acc-shake rounded-xl border border-red-200 bg-red-50 p-3 text-sm">
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
          <Input label="Account Name *" placeholder="FundedNext 5K" value={form.name} error={errors.name} onChange={set('name')} />
          <Input label="Firm / Broker *" placeholder="FundedNext" value={form.firm} error={errors.firm} onChange={set('firm')} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Account Type *"
            value={form.account_type}
            onChange={set('account_type')}
            error={errors.account_type}
            options={[
              { value: 'evaluation', label: 'Evaluation (Demo)' },
              { value: 'funded', label: 'Funded · Live' },
              { value: 'personal', label: 'Personal' },
              { value: 'demo', label: 'Demo' },
            ]}
          />
          <Select
            label="Platform *"
            value={form.platform}
            onChange={set('platform')}
            error={errors.platform}
            options={[
              { value: 'MT5', label: 'MT5' },
              { value: 'MT4', label: 'MT4' },
              { value: 'TradingView', label: 'TradingView' },
              { value: 'Other', label: 'Other' },
            ]}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Account Number *" placeholder="FN-88213" value={form.account_number} error={errors.account_number} onChange={set('account_number')} />
          <Input label="Server *" placeholder="FundedNext-Live01" value={form.server} error={errors.server} onChange={set('server')} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            label="Starting Balance *"
            type="number"
            placeholder="5000"
            value={form.starting_balance}
            error={errors.starting_balance}
            onChange={set('starting_balance')}
          />
          <Input label="Current Balance *" type="number" placeholder="5000" value={form.current_balance} error={errors.current_balance} onChange={set('current_balance')} />
          <Input label="Current Equity *" type="number" placeholder="5000" value={form.current_equity} error={errors.current_equity} onChange={set('current_equity')} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Select
            label="Currency *"
            value={form.currency}
            onChange={set('currency')}
            error={errors.currency}
            options={[
              { value: 'USD', label: 'USD' },
              { value: 'EUR', label: 'EUR' },
              { value: 'GBP', label: 'GBP' },
            ]}
          />
          <Input label="Leverage *" type="number" placeholder="100" value={form.leverage} error={errors.leverage} onChange={set('leverage')} />
          {initialValues && (
            <Select
              label="Status"
              value={form.status}
              onChange={set('status')}
              options={[
                { value: 'healthy', label: 'Healthy' },
                { value: 'caution', label: 'Caution' },
                { value: 'at_risk', label: 'At risk' },
                { value: 'passed', label: 'Passed' },
                { value: 'failed', label: 'Failed' },
                { value: 'inactive', label: 'Inactive' },
              ]}
            />
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input label="Profit Target % *" type="number" placeholder="8" value={form.profit_target_percent} error={errors.profit_target_percent} onChange={set('profit_target_percent')} />
          <Input label="Daily Loss Limit % *" type="number" placeholder="4" value={form.daily_loss_limit_percent} error={errors.daily_loss_limit_percent} onChange={set('daily_loss_limit_percent')} />
          <Input label="Max Drawdown % *" type="number" placeholder="8" value={form.max_drawdown_percent} error={errors.max_drawdown_percent} onChange={set('max_drawdown_percent')} />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text-primary">Notes <span className="font-normal text-text-muted">(optional)</span></label>
          <textarea
            rows={3}
            value={form.notes}
            onChange={set('notes')}
            placeholder="Optional notes about this account..."
            className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-[15px] text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>
        <p className="text-xs text-text-muted">Fields marked * are required.</p>
      </form>
    </Modal>
  )
}

function AccountDetail({ account, todayPnl, open, onClose, onNewAccount }) {
  if (!account) return null

  const pnl = calcPnl(account)
  const pnlPct = calcPnlPct(account)
  const progress = calcProfitTargetProgress(account)
  const risk = calcRisk(account, todayPnl)
  const breached = risk.dailyBreached || risk.ddBreached || account.status === 'failed'
  const passed = !breached && account.status === 'passed'
  const dailyLossLimitAmount = account.daily_loss_limit_percent
    ? (account.daily_loss_limit_percent / 100) * account.starting_balance
    : null

  return (
    <Drawer open={open} onClose={onClose} title={account.name} subtitle={`${account.firm || 'No firm set'} · ${account.account_number || 'No account number'}`}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AccountStatusBadge status={account.status} breached={breached} />
            {account.account_type === 'funded' && !breached && <FundedPill />}
          {account.account_type === 'evaluation' && !breached && account.status !== 'passed' && <DemoPill />}
          </div>
          <Mt5Indicator connected={account.mt5_connected} />
        </div>

        {breached && <BreachBanner reason={breachReason(risk)} onNew={() => { onClose(); onNewAccount() }} />}
        {passed && <PassedBanner type={account.account_type} />}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs font-medium text-text-muted">Balance</p>
            <p className="tabular-nums mt-1 text-xl font-bold text-text-primary">
              ${Number(account.current_balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-text-muted">Equity</p>
            <p className="tabular-nums mt-1 text-xl font-bold text-text-primary">
              {account.current_equity != null ? `$${Number(account.current_equity).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : 'N/A'}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-text-muted">P&L</p>
            <p className={`tabular-nums mt-1 text-xl font-bold ${pnl >= 0 ? 'text-success' : 'text-danger'}`}>
              {pnl >= 0 ? '+' : ''}${pnl.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-text-muted">P&L %</p>
            <p className={`tabular-nums mt-1 text-xl font-bold ${pnlPct >= 0 ? 'text-success' : 'text-danger'}`}>
              {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border p-4">
          <p className="mb-3 text-sm font-semibold text-text-primary">Account Info</p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><p className="text-xs text-text-muted">Type</p><p className="mt-0.5 font-medium text-text-primary">{typeText(account)}</p></div>
            <div><p className="text-xs text-text-muted">Platform</p><p className="mt-0.5 font-medium text-text-primary">{account.platform}</p></div>
            <div><p className="text-xs text-text-muted">Server</p><p className="mt-0.5 font-medium text-text-primary">{account.server || '—'}</p></div>
            <div><p className="text-xs text-text-muted">Currency</p><p className="mt-0.5 font-medium text-text-primary">{account.currency}</p></div>
            <div><p className="text-xs text-text-muted">Leverage</p><p className="mt-0.5 font-medium text-text-primary">{account.leverage ? `1:${account.leverage}` : 'N/A'}</p></div>
            {account.funded_started_at && (
              <div><p className="text-xs text-text-muted">Funded since</p><p className="mt-0.5 font-medium text-text-primary">{new Date(account.funded_started_at).toLocaleDateString()}</p></div>
            )}
          </div>
        </div>

        {(account.profit_target_percent > 0 || account.daily_loss_limit_percent > 0 || account.max_drawdown_percent > 0) && (
          <div className="rounded-xl border border-border p-4">
            <p className="mb-3 text-sm font-semibold text-text-primary">Account Progress</p>
            <div className="flex flex-col gap-4">
              {progress !== null && (
                <AccountProgress label={account.account_type === 'funded' ? 'Payout Target' : 'Profit Target'} doneText={account.account_type === 'funded' ? 'Payout ready' : 'Target reached'} valuePct={Math.max(0, pnlPct)} targetPct={account.profit_target_percent} tone="success" />
              )}
              {account.daily_loss_limit_percent > 0 && (
                <div>
                  <AccountProgress label="Daily Loss used (today)" valuePct={risk.dailyLossPct} targetPct={account.daily_loss_limit_percent} tone="danger" />
                  <p className="mt-1 text-xs text-text-muted">
                    Limit: {dailyLossLimitAmount ? `$${dailyLossLimitAmount.toFixed(2)}` : 'N/A'} per day (today's closed trades + floating P/L).
                  </p>
                </div>
              )}
              {account.max_drawdown_percent > 0 && (
                <div>
                  <AccountProgress label="Max Drawdown used" valuePct={risk.ddPct} targetPct={account.max_drawdown_percent} tone="danger" />
                  <p className="mt-1 text-xs text-text-muted">Measured from the starting balance.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {account.notes && (
          <div className="rounded-xl border border-border p-4">
            <p className="mb-2 text-sm font-semibold text-text-primary">Notes</p>
            <p className="text-sm text-text-secondary">{account.notes}</p>
          </div>
        )}
      </div>
    </Drawer>
  )
}

/* ------------------------------------------------------------------ */
/* Loading / empty / error states                                      */
/* ------------------------------------------------------------------ */

function AccountsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {[...Array(3)].map((_, i) => (
        <Card key={i} className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <LoadingSkeleton className="h-10 w-10" rounded="rounded-xl" />
            <div className="flex-1">
              <LoadingSkeleton className="h-4 w-2/3" />
              <LoadingSkeleton className="mt-2 h-3 w-1/2" />
            </div>
          </div>
          <LoadingSkeleton className="h-5 w-20" rounded="rounded-full" />
          <div className="grid grid-cols-2 gap-4">
            {[...Array(4)].map((_, j) => (
              <div key={j}>
                <LoadingSkeleton className="h-3 w-12" />
                <LoadingSkeleton className="mt-2 h-5 w-20" />
              </div>
            ))}
          </div>
          <LoadingSkeleton className="h-10 w-full" rounded="rounded-xl" />
        </Card>
      ))}
    </div>
  )
}

function EmptyAccounts({ onAdd }) {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-brand">
        <Wallet className="h-5 w-5" />
      </div>
      <p className="text-sm font-semibold text-text-primary">No trading accounts yet.</p>
      <p className="max-w-xs text-sm text-text-muted">Add your first trading account to start tracking your performance.</p>
      <Button icon={Plus} onClick={onAdd} className="mt-2">Add Account</Button>
    </Card>
  )
}

function ErrorState({ message, onRetry }) {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-danger">
        <AlertTriangle className="h-5 w-5" />
      </div>
      <p className="text-sm font-semibold text-text-primary">Couldn't load your accounts</p>
      <p className="max-w-xs text-sm text-text-muted">{message}</p>
      <Button variant="secondary" icon={RefreshCw} onClick={onRetry} className="mt-2">Retry</Button>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Page component                                                      */
/* ------------------------------------------------------------------ */

export default function Accounts() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { accounts, loading, error, mutating, refresh, createAccount, updateAccount, deleteAccount } = useAccounts()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState(null)
  const [viewingAccount, setViewingAccount] = useState(null)
  const [deletingAccount, setDeletingAccount] = useState(null)
  const [selectedAccount, setSelectedAccount] = useState(null)

  const [todayPnl, setTodayPnl] = useState({})
  const [todayLoaded, setTodayLoaded] = useState(false)
  const [passAlert, setPassAlert] = useState(null)
  const [breachAlert, setBreachAlert] = useState(null)
  const handled = useRef(new Set())

  useEffect(() => {
    if (accounts.length && !selectedAccount) setSelectedAccount(accounts[0])
  }, [accounts, selectedAccount])

  // keep the open drawer in sync when the account changes (e.g. auto Funded / Failed)
  const viewing = viewingAccount ? accounts.find((a) => a.id === viewingAccount.id) || viewingAccount : null

  /* ----- realized P/L of trades closed today (for the daily-loss check) ----- */
  const balanceSig = accounts.map((a) => `${a.id}:${a.current_balance}:${a.current_equity}:${a.funded_started_at || ''}`).join('|')
  useEffect(() => {
    if (loading) return undefined
    if (!accounts.length) { setTodayLoaded(true); return undefined }
    let off = false
    const load = async () => {
      try {
        const start = new Date()
        start.setHours(0, 0, 0, 0)
        const iso = start.toISOString()
        const { data, error: err } = await supabase
          .from('trades')
          .select('account_id,status,net_profit,profit,commission,swap,opened_at,closed_at,created_at')
          .in('account_id', accounts.map((a) => a.id))
          .or(`closed_at.gte.${iso},and(closed_at.is.null,created_at.gte.${iso})`)
        if (err) throw err
        // trades closed before an account became Funded · Live don't count toward today's funded P/L
        const since = Object.fromEntries(
          accounts.filter((a) => a.funded_started_at).map((a) => [a.id, new Date(a.funded_started_at).getTime()]),
        )
        const map = {}
        ;(data || []).forEach((t) => {
          if (String(t.status || '').toUpperCase() === 'OPEN') return
          const ts = new Date(t.closed_at || t.opened_at || t.created_at).getTime()
          if (since[t.account_id] && ts < since[t.account_id]) return
          const net = Number(t.net_profit) || 0
          const v = net !== 0 ? net : (Number(t.profit) || 0) + (Number(t.commission) || 0) + (Number(t.swap) || 0)
          map[t.account_id] = (map[t.account_id] || 0) + v
        })
        if (!off) setTodayPnl(map)
      } catch (e) {
        console.warn('today pnl:', e?.message || e)
      } finally {
        if (!off) setTodayLoaded(true)
      }
    }
    load()
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { off = true; window.removeEventListener('focus', onFocus) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, balanceSig])

  /* ----- automatic actions: passed -> Funded · Live, breached -> Failed ----- */
  useEffect(() => {
    if (loading || !todayLoaded || !accounts.length) return undefined
    let cancelled = false
    ;(async () => {
      for (const a of accounts) {
        if (cancelled) return
        const risk = calcRisk(a, todayPnl[a.id] || 0)

        if (risk.dailyBreached || risk.ddBreached) {
          if (!['failed', 'inactive'].includes(a.status) && !handled.current.has(`f:${a.id}`)) {
            handled.current.add(`f:${a.id}`)
            try {
              await updateAccount(a.id, { status: 'failed' })
              setBreachAlert({ name: a.name, reason: breachReason(risk) })
            } catch (e) {
              handled.current.delete(`f:${a.id}`)
            }
          }
          continue
        }

        const target = Number(a.profit_target_percent) || 0
        if (
          a.account_type === 'evaluation' && !['failed', 'inactive', 'passed'].includes(a.status) &&
          target > 0 && calcPnlPct(a) >= target && !handled.current.has(`p:${a.id}`)
        ) {
          handled.current.add(`p:${a.id}`)
          try {
            // Evaluation (demo) -> Funded · Live: reset to the starting balance, new target, archive old trades
            const { error: rpcErr } = await supabase.rpc('pass_evaluation', {
              p_account: a.id,
              p_funded_target: FUNDED_TARGET_PCT,
            })
            if (rpcErr) throw rpcErr
            setPassAlert({ name: a.name, balance: Number(a.starting_balance), target: FUNDED_TARGET_PCT })
            await refresh()
          } catch (e) {
            showToast({
              type: 'error',
              title: 'Could not switch to Funded · Live',
              description: e?.message || 'Run the pass_evaluation SQL in Supabase first.',
            })
          }
        }
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, todayPnl, todayLoaded, loading])

  const filtered = useMemo(() => {
    if (!query.trim()) return accounts
    const q = query.toLowerCase()
    return accounts.filter(
      (a) =>
        a.name?.toLowerCase().includes(q) ||
        a.firm?.toLowerCase().includes(q) ||
        a.account_number?.toLowerCase().includes(q)
    )
  }, [accounts, query])

  const totals = useMemo(() => {
    // archived (passed) evaluations are history, not live capital
    const live = accounts.filter((a) => !(a.account_type === 'evaluation' && a.status === 'passed'))
    const totalCapital = live.reduce((sum, a) => sum + Number(a.current_balance || 0), 0)
    const combinedPnl = live.reduce((sum, a) => sum + calcPnl(a), 0)
    const active = live.filter((a) => !['inactive', 'failed'].includes(a.status)).length
    return { totalAccounts: accounts.length, totalCapital, combinedPnl, active }
  }, [accounts])

  const handleAddAccount = async (data) => {
    try {
      await createAccount(data)
      setFormOpen(false)
      showToast({ type: 'success', title: 'Trading account added successfully.' })
    } catch (err) {
      showToast({ type: 'error', title: 'Could not add account', description: err.message })
    }
  }

  const handleEditSubmit = async (data) => {
    try {
      await updateAccount(editingAccount.id, data)
      setEditingAccount(null)
      showToast({ type: 'success', title: 'Account updated.' })
    } catch (err) {
      showToast({ type: 'error', title: 'Could not update account', description: err.message })
    }
  }

  const handleDuplicate = async (account) => {
    try {
      const { id, user_id, created_at, updated_at, mt5_connected, mt5_last_sync_at, ...rest } = account
      await createAccount({ ...rest, status: 'healthy', name: `${account.name} (Copy)` })
      showToast({ type: 'success', title: 'Account duplicated.' })
    } catch (err) {
      showToast({ type: 'error', title: 'Could not duplicate account', description: err.message })
    }
  }

  const handleArchive = async (account) => {
    try {
      await updateAccount(account.id, { status: 'inactive' })
      showToast({ type: 'success', title: 'Account archived.' })
    } catch (err) {
      showToast({ type: 'error', title: 'Could not archive account', description: err.message })
    }
  }

  const confirmDelete = async () => {
    try {
      await deleteAccount(deletingAccount.id)
      showToast({ type: 'success', title: 'Trading account deleted.' })
    } catch (err) {
      const fk = err?.code === '23503' || /foreign key|violates/i.test(err?.message || '')
      showToast({
        type: 'error',
        title: 'Could not delete account',
        description: fk
          ? 'This account still has trades (or other data) linked to it. Move or delete those trades first.'
          : err.message,
      })
    } finally {
      setDeletingAccount(null)
    }
  }

  const openNewAccount = () => setFormOpen(true)

  return (
    <div className="flex min-h-screen bg-bg">
      <style>{ACC_STYLES}</style>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onMenuClick={() => setSidebarOpen(true)}
          accounts={accounts.map((a) => ({ id: a.id, label: a.name, status: a.mt5_connected ? 'connected' : 'disconnected' }))}
          selectedAccount={selectedAccount ? { label: selectedAccount.name } : { label: 'No Account' }}
          onSelectAccount={(a) => setSelectedAccount(accounts.find((acc) => acc.id === a.id))}
          breadcrumb="Overview / Accounts"
        />

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-[28px] font-bold text-text-primary sm:text-[32px]">Trading Accounts</h1>
              <p className="mt-1 text-sm text-text-secondary">Manage and monitor all your trading accounts in one place.</p>
            </div>
            <Button icon={Plus} onClick={openNewAccount}>
              Add Account
            </Button>
          </div>

          {/* Summary KPIs */}
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="flex items-center gap-3" padded>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-brand">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-text-muted">Total Accounts</p>
                <p className="tabular-nums text-xl font-bold text-text-primary">{totals.totalAccounts}</p>
              </div>
            </Card>
            <Card className="flex items-center gap-3" padded>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-brand">
                <DollarSign className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-text-muted">Total Capital</p>
                <p className="tabular-nums text-xl font-bold text-text-primary">
                  ${totals.totalCapital.toLocaleString()}
                </p>
              </div>
            </Card>
            <Card className="flex items-center gap-3" padded>
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${totals.combinedPnl >= 0 ? 'bg-green-50 text-success' : 'bg-red-50 text-danger'}`}>
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-text-muted">Combined P&L</p>
                <p className={`tabular-nums text-xl font-bold ${totals.combinedPnl >= 0 ? 'text-success' : 'text-danger'}`}>
                  {totals.combinedPnl >= 0 ? '+' : ''}${totals.combinedPnl.toLocaleString()}
                </p>
              </div>
            </Card>
            <Card className="flex items-center gap-3" padded>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-brand">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-text-muted">Active Accounts</p>
                <p className="tabular-nums text-xl font-bold text-text-primary">{totals.active}</p>
              </div>
            </Card>
          </div>

          {!loading && !error && accounts.length > 0 && (
            <div className="relative mb-6 max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search accounts..."
                className="h-11 w-full rounded-xl border border-border bg-white pl-10 pr-3 text-[15px] text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>
          )}

          {loading && <AccountsSkeleton />}

          {!loading && error && <ErrorState message={error} onRetry={refresh} />}

          {!loading && !error && accounts.length === 0 && <EmptyAccounts onAdd={openNewAccount} />}

          {!loading && !error && accounts.length > 0 && filtered.length === 0 && (
            <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface text-text-muted">
                <Search className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-text-primary">No accounts match your search</p>
              <p className="text-sm text-text-muted">Try a different name, firm, or account number.</p>
            </Card>
          )}

          {!loading && !error && filtered.length > 0 && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((account) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  todayPnl={todayPnl[account.id] || 0}
                  onView={setViewingAccount}
                  onEdit={setEditingAccount}
                  onDuplicate={handleDuplicate}
                  onArchive={handleArchive}
                  onDelete={setDeletingAccount}
                  onNewAccount={openNewAccount}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      <AccountForm open={formOpen} onClose={() => setFormOpen(false)} onSubmit={handleAddAccount} submitting={mutating} />

      <AccountForm
        open={!!editingAccount}
        onClose={() => setEditingAccount(null)}
        onSubmit={handleEditSubmit}
        initialValues={editingAccount}
        submitting={mutating}
      />

      <AccountDetail
        account={viewing}
        todayPnl={viewing ? todayPnl[viewing.id] || 0 : 0}
        open={!!viewing}
        onClose={() => setViewingAccount(null)}
        onNewAccount={openNewAccount}
      />

      {/* Passed the evaluation */}
      <Modal
        open={!!passAlert}
        onClose={() => setPassAlert(null)}
        title="You passed your account!"
        footer={<Button onClick={() => setPassAlert(null)}>Continue</Button>}
      >
        <div className="relative overflow-hidden py-6 text-center">
          <Confetti />
          <div className="acc-pop acc-ring mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-success">
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

      {/* Breached the account */}
      <Modal
        open={!!breachAlert}
        onClose={() => setBreachAlert(null)}
        title="You breached your account"
        footer={
          <>
            <Button variant="secondary" onClick={() => setBreachAlert(null)}>Close</Button>
            <Button onClick={() => { setBreachAlert(null); openNewAccount() }}>Get a new account</Button>
          </>
        }
      >
        <div className="py-5 text-center">
          <div className="acc-shake mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-danger">
            <ShieldAlert className="h-8 w-8" />
          </div>
          <p className="mt-4 text-lg font-bold text-text-primary">{breachAlert?.reason} reached</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-text-secondary">
            <span className="font-semibold text-text-primary">{breachAlert?.name}</span> was marked as Failed.
            Get a new account and don't give up. Every trader falls; the ones who keep learning get funded.
          </p>
        </div>
      </Modal>

      <Modal
        open={!!deletingAccount}
        onClose={() => setDeletingAccount(null)}
        title="Delete Trading Account?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeletingAccount(null)}>Cancel</Button>
            <Button variant="danger" onClick={confirmDelete} loading={mutating}>Delete</Button>
          </>
        }
      >
        <p className="text-sm text-text-secondary">
          Are you sure you want to delete <span className="font-semibold text-text-primary">{deletingAccount?.name}</span>?
          Associated trade history for this account may be affected. This action cannot be undone.
        </p>
      </Modal>
    </div>
  )
}