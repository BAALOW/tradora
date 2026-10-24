import { useEffect, useState } from 'react'
import {
  Target, Shield, BarChart3, Ban, CalendarDays, Quote, Lightbulb, Clock,
  Plus, Pencil, Trash2, Info, AlertTriangle, RefreshCw, FileText, CircleAlert,
  TrendingUp, Layers, Droplet, ArrowUpRight, Zap, LayoutGrid, Users, CheckCircle2,
} from 'lucide-react'

import Sidebar from '../components/layout/Sidebar'
import Topbar from '../components/layout/Topbar'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import Modal from '../components/ui/Modal'
import Input from '../components/ui/Input'
import Select from '../components/ui/Select'
import Badge from '../components/ui/Badge'
import LoadingSkeleton from '../components/ui/LoadingSkeleton'
import { useToast } from '../components/ui/Toast'
import { useAccounts } from '../hooks/useAccounts'
import { useTradingPlan } from '../hooks/useTradingPlan'

const uid = () => Math.random().toString(36).slice(2, 10)

const toneStyles = {
  danger: 'bg-red-50 text-danger border-red-100',
  success: 'bg-green-50 text-success border-green-100',
  brand: 'bg-blue-50 text-brand border-blue-100',
  neutral: 'bg-surface text-text-secondary border-border',
}

const ruleIcons = [TrendingUp, LayoutGrid, Droplet, ArrowUpRight, Zap]
const priorityTone = { Primary: 'brand', Secondary: 'neutral', Rarely: 'warning' }

// Approximate USD value of one pip per standard lot (1.0) — used only to
// size the Risk Management calculator's lot recommendation. JPY pairs
// move in 0.01 increments (hence the lower pip value); gold is quoted
// in whole dollars per pip on most brokers.
const PIP_VALUE_PER_LOT = {
  EURUSD: 10, GBPUSD: 10, USDCHF: 10, USDCAD: 10, AUDUSD: 10, NZDUSD: 10, EURGBP: 10,
  USDJPY: 9.1, EURJPY: 9.1, GBPJPY: 9.1,
  XAUUSD: 1,
}
const DEFAULT_CALC_PAIRS = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD', 'XAUUSD']

/* ------------------------------------------------------------------ */
/* Small generic building blocks                                       */
/* ------------------------------------------------------------------ */

function CardHeader({ icon: Icon, iconBg, title, subtitle, action }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-[17px] font-semibold text-text-primary">{title}</h3>
          {subtitle && <p className="mt-0.5 text-sm text-text-secondary">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

function RowActions({ onEdit, onDelete }) {
  return (
    <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
      <button onClick={onEdit} className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface hover:text-text-secondary" aria-label="Edit">
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button onClick={onDelete} className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-red-50 hover:text-danger" aria-label="Delete">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function ConfirmDeleteModal({ open, onClose, onConfirm, label }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Remove this?"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm}>Remove</Button>
        </>
      }
    >
      <p className="text-sm text-text-secondary">
        Remove <span className="font-semibold text-text-primary">{label}</span> from your trading plan? This can't be undone.
      </p>
    </Modal>
  )
}

/* Generic title + description editor — reused for strategy rules and no-trade rules */
function TitleDescModal({ open, onClose, onSave, title, initial }) {
  const [form, setForm] = useState({ title: '', description: '' })
  useEffect(() => { if (open) setForm({ title: initial?.title || '', description: initial?.description || '' }) }, [open, initial])
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => onSave(form)} disabled={!form.title.trim()}>Save</Button></>}
    >
      <div className="flex flex-col gap-4">
        <Input label="Title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text-primary">Description</label>
          <textarea
            rows={3}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-[15px] text-text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>
      </div>
    </Modal>
  )
}

function TextModal({ open, onClose, onSave, title, label, initial, multiline }) {
  const [value, setValue] = useState('')
  useEffect(() => { if (open) setValue(initial || '') }, [open, initial])
  return (
    <Modal open={open} onClose={onClose} title={title} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => onSave(value)}>Save</Button></>}>
      {multiline ? (
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text-primary">{label}</label>
          <textarea rows={3} value={value} onChange={(e) => setValue(e.target.value)} className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-[15px] text-text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
        </div>
      ) : (
        <Input label={label} value={value} onChange={(e) => setValue(e.target.value)} />
      )}
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* Strategy Rules card                                                 */
/* ------------------------------------------------------------------ */

function StrategyModal({ open, onClose, onSave, initial }) {
  const [form, setForm] = useState({ name: '', description: '', note: '' })
  useEffect(() => {
    if (open) setForm({ name: initial?.name || '', description: initial?.description || '', note: initial?.note || '' })
  }, [open, initial])
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'Edit Strategy' : 'Add Strategy'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => onSave(form)} disabled={!form.name.trim()}>Save</Button></>}
    >
      <div className="flex flex-col gap-4">
        <Input label="Strategy Name" placeholder="e.g. A+ Setup" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <Input label="Short Description" placeholder="e.g. High probability setup with all 4 rules." value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-text-primary">Note</label>
          <textarea rows={2} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="When does this setup work best?"
            className="w-full rounded-xl border border-border bg-white px-3 py-2.5 text-[15px] text-text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20" />
        </div>
      </div>
    </Modal>
  )
}

function StrategyCard({ strategy, index, onEditStrategy, onDeleteStrategy, onAddRule, onEditRule, onDeleteRule }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="group mb-3 flex items-start justify-between gap-2">
        <div className="flex items-start gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{index + 1}</span>
          <div>
            <p className="text-[15px] font-semibold text-text-primary">{strategy.name}</p>
            <p className="text-sm text-text-secondary">{strategy.description}</p>
          </div>
        </div>
        <RowActions onEdit={onEditStrategy} onDelete={onDeleteStrategy} />
      </div>

      <div className="flex flex-col gap-2">
        {strategy.rules.map((rule, i) => {
          const RuleIcon = ruleIcons[i % ruleIcons.length]
          return (
            <div key={rule.id} className="group flex items-start justify-between gap-2 rounded-lg border border-border/70 bg-surface/40 p-2.5">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-brand">{i + 1}</span>
                <div className="flex items-start gap-1.5">
                  <RuleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-muted" />
                  <div>
                    <p className="text-sm font-medium text-text-primary">{rule.title}</p>
                    <p className="text-xs text-text-muted">{rule.description}</p>
                  </div>
                </div>
              </div>
              <RowActions onEdit={() => onEditRule(rule)} onDelete={() => onDeleteRule(rule.id)} />
            </div>
          )
        })}
      </div>

      <button onClick={onAddRule} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs font-medium text-text-muted transition-colors hover:border-brand hover:text-brand">
        <Plus className="h-3.5 w-3.5" /> Add Rule
      </button>

      {strategy.note && (
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-blue-50/60 p-2.5 text-xs text-brand">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>{strategy.note}</p>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Risk Management card                                                */
/* ------------------------------------------------------------------ */

function RiskProfileModal({ open, onClose, onSave, initial }) {
  const [form, setForm] = useState({ name: '', subtitle: '', badge: '' })
  useEffect(() => { if (open) setForm({ name: initial?.name || '', subtitle: initial?.subtitle || '', badge: initial?.badge || '' }) }, [open, initial])
  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Account Type' : 'Add Account Type'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => onSave(form)} disabled={!form.name.trim()}>Save</Button></>}>
      <div className="flex flex-col gap-4">
        <Input label="Name" placeholder="e.g. Evaluation" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <Input label="Subtitle" placeholder="e.g. 5K Account" value={form.subtitle} onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))} />
        <Input label="Badge" placeholder="e.g. Phase 1 / Live" value={form.badge} onChange={(e) => setForm((f) => ({ ...f, badge: e.target.value }))} />
      </div>
    </Modal>
  )
}

function RiskRowModal({ open, onClose, onSave, initial }) {
  const [form, setForm] = useState({ label: '', value: '', helper: '', tone: 'neutral' })
  useEffect(() => { if (open) setForm({ label: initial?.label || '', value: initial?.value || '', helper: initial?.helper || '', tone: initial?.tone || 'neutral' }) }, [open, initial])
  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Rule' : 'Add Rule'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => onSave(form)} disabled={!form.label.trim()}>Save</Button></>}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Label" placeholder="e.g. Risk per Trade" value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} />
          <Input label="Value" placeholder="e.g. 2%" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
        </div>
        <Select label="Color" value={form.tone} onChange={(e) => setForm((f) => ({ ...f, tone: e.target.value }))}
          options={[{ value: 'neutral', label: 'Neutral' }, { value: 'danger', label: 'Red (risk)' }, { value: 'success', label: 'Green (safe)' }, { value: 'brand', label: 'Blue' }]} />
        <Input label="Helper text (optional)" placeholder="e.g. After reaching target" value={form.helper} onChange={(e) => setForm((f) => ({ ...f, helper: e.target.value }))} />
      </div>
    </Modal>
  )
}

function RiskProfileCard({ profile, onEditProfile, onDeleteProfile, onAddRow, onEditRow, onDeleteRow }) {
  return (
    <div className="flex-1 rounded-xl border border-border p-4">
      <div className="group mb-3 flex items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[15px] font-semibold text-text-primary">{profile.name}</p>
            {profile.badge && <Badge tone="brand">{profile.badge}</Badge>}
          </div>
          {profile.subtitle && <p className="text-xs text-text-muted">{profile.subtitle}</p>}
        </div>
        <RowActions onEdit={onEditProfile} onDelete={onDeleteProfile} />
      </div>
      <div className="flex flex-col gap-2">
        {profile.rows.map((row) => (
          <div key={row.id} className="group flex items-center justify-between gap-2 rounded-lg border border-border/70 px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm text-text-secondary">{row.label}</p>
              {row.helper && <p className="truncate text-xs text-text-muted">{row.helper}</p>}
            </div>
            <div className="flex items-center gap-1">
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${toneStyles[row.tone] || toneStyles.neutral}`}>{row.value}</span>
              <RowActions onEdit={() => onEditRow(row)} onDelete={() => onDeleteRow(row.id)} />
            </div>
          </div>
        ))}
      </div>
      <button onClick={onAddRow} className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-xs font-medium text-text-muted transition-colors hover:border-brand hover:text-brand">
        <Plus className="h-3.5 w-3.5" /> Add Rule
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Risk Management calculator — sizes a trade against a real account.   */
/* Lives inside the Risk Management card, right below the tip.          */
/* ------------------------------------------------------------------ */

function RiskCalculator({ accounts }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id || '')
  const [riskPct, setRiskPct] = useState('2')
  const [riskAmount, setRiskAmount] = useState('')
  const [slPips, setSlPips] = useState('20')
  const [pair, setPair] = useState('EURUSD')
  const [customPairs, setCustomPairs] = useState([])
  const [addPairOpen, setAddPairOpen] = useState(false)
  const [newPairSymbol, setNewPairSymbol] = useState('')

  useEffect(() => {
    if (!accountId && accounts.length) setAccountId(accounts[0].id)
  }, [accounts, accountId])

  const account = accounts.find((a) => a.id === accountId)
  const balance = Number(account?.current_balance) || 0

  // riskPct drives riskAmount; editing riskAmount recalculates riskPct —
  // whichever the trader touches last stays in sync with the balance.
  const onRiskPctChange = (v) => {
    setRiskPct(v)
    const pct = Number(v) || 0
    setRiskAmount(balance ? (balance * (pct / 100)).toFixed(2) : '')
  }
  const onRiskAmountChange = (v) => {
    setRiskAmount(v)
    const amt = Number(v) || 0
    setRiskPct(balance ? ((amt / balance) * 100).toFixed(2) : '')
  }
  const onAccountChange = (id) => {
    setAccountId(id)
    const newBalance = Number(accounts.find((a) => a.id === id)?.current_balance) || 0
    const pct = Number(riskPct) || 0
    setRiskAmount(newBalance ? (newBalance * (pct / 100)).toFixed(2) : '')
  }

  const effectiveRiskAmount = riskAmount === '' ? (balance ? balance * (Number(riskPct || 0) / 100) : 0) : Number(riskAmount) || 0
  const pips = Number(slPips) || 0
  const pipValue = PIP_VALUE_PER_LOT[pair] ?? (pair.includes('JPY') ? 9.1 : 10)
  const lotSize = pips > 0 ? effectiveRiskAmount / (pips * pipValue) : 0

  const allPairs = [...DEFAULT_CALC_PAIRS, ...customPairs.filter((p) => !DEFAULT_CALC_PAIRS.includes(p))]

  return (
    <div className="mt-4 rounded-xl border border-border p-4">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-50 text-success">
          <Shield className="h-4 w-4" />
        </div>
        <div>
          <p className="text-[15px] font-semibold text-text-primary">Risk Management</p>
          <p className="text-xs text-text-secondary">Size every trade before you take it.</p>
        </div>
      </div>

      {accounts.length === 0 ? (
        <p className="rounded-lg bg-surface p-3 text-center text-sm text-text-muted">
          Add a trading account first — the calculator sizes trades against a real account balance.
        </p>
      ) : (
        <>
          <div className="mb-4">
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Account Source</label>
            <select
              value={accountId}
              onChange={(e) => onAccountChange(e.target.value)}
              className="h-11 w-full rounded-xl border border-border bg-white px-3 text-[15px] font-medium text-text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} (${Number(a.current_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })})
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4 grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Risk Percentage (%)</label>
              <Input type="number" step="0.1" value={riskPct} onChange={(e) => onRiskPctChange(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Risk Amount ($)</label>
              <Input type="number" step="0.01" value={riskAmount !== '' ? riskAmount : effectiveRiskAmount.toFixed(2)} onChange={(e) => onRiskAmountChange(e.target.value)} />
            </div>
          </div>

          <div className="mb-1.5 grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Stop Loss (pips/points)</label>
              <Input type="number" step="0.1" value={slPips} onChange={(e) => setSlPips(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-muted">Asset / Pair</label>
              <div className="flex items-center gap-2">
                <select
                  value={pair}
                  onChange={(e) => setPair(e.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-white px-3 text-[15px] font-medium text-text-primary focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                >
                  {allPairs.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setAddPairOpen(true)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success text-white transition-colors hover:bg-green-700"
                  aria-label="Add a pair"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          <p className="mb-4 text-xs text-text-muted">Forex majors & Gold (XAUUSD). Lot size updates automatically.</p>

          <div className="rounded-xl bg-green-50/60 p-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Recommended Lot Size</p>
            <p className="tabular-nums text-3xl font-bold text-brand">{lotSize > 0 ? lotSize.toFixed(2) : '0.00'} <span className="text-lg font-semibold text-text-secondary">Lots</span></p>
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-green-100 pt-3">
              <div>
                <p className="text-xs text-text-muted">Total Risk</p>
                <p className="tabular-nums text-sm font-bold text-danger">${effectiveRiskAmount.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Balance</p>
                <p className="tabular-nums text-sm font-bold text-text-primary">${balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-green-100 bg-green-50/40 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-success"><CheckCircle2 className="h-4 w-4" /> Safety Rules</p>
            <ul className="flex flex-col gap-1.5 text-xs text-text-secondary">
              <li className="flex items-start gap-1.5"><CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-success" /> Never risk more than <span className="font-semibold text-text-primary">{riskPct || 0}%</span> per trade.</li>
              <li className="flex items-start gap-1.5"><CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-success" /> Confirm your SL is at a structural level.</li>
              <li className="flex items-start gap-1.5"><CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-success" /> Lot size is your <span className="font-semibold text-text-primary">weapon</span>; use it wisely.</li>
            </ul>
          </div>
        </>
      )}

      <Modal
        open={addPairOpen}
        onClose={() => setAddPairOpen(false)}
        title="Add a Pair"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAddPairOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                const sym = newPairSymbol.trim().toUpperCase()
                if (!sym) return
                setCustomPairs((prev) => [...new Set([...prev, sym])])
                setPair(sym)
                setNewPairSymbol('')
                setAddPairOpen(false)
              }}
              disabled={!newPairSymbol.trim()}
            >
              Add
            </Button>
          </>
        }
      >
        <Input label="Symbol" placeholder="e.g. EURJPY" value={newPairSymbol} onChange={(e) => setNewPairSymbol(e.target.value)} />
        <p className="mt-2 text-xs text-text-muted">Pip value defaults to $10/lot unless it's a known JPY pair or XAUUSD.</p>
      </Modal>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Market & Trading Conditions card                                    */
/* ------------------------------------------------------------------ */

function PairModal({ open, onClose, onSave, initial }) {
  const [form, setForm] = useState({ symbol: '', priority: 'Primary' })
  useEffect(() => { if (open) setForm({ symbol: initial?.symbol || '', priority: initial?.priority || 'Primary' }) }, [open, initial])
  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Pair' : 'Add Pair'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => onSave(form)} disabled={!form.symbol.trim()}>Save</Button></>}>
      <div className="flex flex-col gap-4">
        <Input label="Pair" placeholder="e.g. GBPUSD" value={form.symbol} onChange={(e) => setForm((f) => ({ ...f, symbol: e.target.value.toUpperCase() }))} />
        <Select label="Priority" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
          options={[{ value: 'Primary', label: 'Primary' }, { value: 'Secondary', label: 'Secondary' }, { value: 'Rarely', label: 'Rarely' }]} />
      </div>
    </Modal>
  )
}

function SessionModal({ open, onClose, onSave, initial }) {
  const [form, setForm] = useState({ name: '', time: '' })
  useEffect(() => { if (open) setForm({ name: initial?.name || '', time: initial?.time || '' }) }, [open, initial])
  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit Session' : 'Add Session'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => onSave(form)} disabled={!form.name.trim()}>Save</Button></>}>
      <div className="flex flex-col gap-4">
        <Input label="Session Name" placeholder="e.g. London Session" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        <Input label="Time" placeholder="e.g. 08:00 – 11:00 (GMT)" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} />
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
/* No Trade Rules card                                                 */
/* ------------------------------------------------------------------ */

function NoTradeRow({ rule, index, onEdit, onDelete }) {
  return (
    <div className="group flex items-start justify-between gap-2 rounded-xl border border-red-100 bg-red-50/40 p-3">
      <div className="flex items-start gap-2.5">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-danger text-xs font-bold text-white">{index + 1}</span>
        <div>
          <p className="text-sm font-semibold text-text-primary">{rule.title}</p>
          <p className="text-xs text-text-secondary">{rule.description}</p>
        </div>
      </div>
      <RowActions onEdit={onEdit} onDelete={onDelete} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Loading / error                                                     */
/* ------------------------------------------------------------------ */

function PlanSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {[...Array(4)].map((_, i) => (
        <Card key={i}><LoadingSkeleton className="h-64 w-full" /></Card>
      ))}
    </div>
  )
}

function ErrorState({ message, onRetry }) {
  return (
    <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-danger"><AlertTriangle className="h-5 w-5" /></div>
      <p className="text-sm font-semibold text-text-primary">Couldn't load your trading plan</p>
      <p className="max-w-xs text-sm text-text-muted">{message}</p>
      <Button variant="secondary" icon={RefreshCw} onClick={onRetry} className="mt-2">Retry</Button>
    </Card>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

export default function TradingPlan() {
  const { showToast } = useToast()
  const { accounts } = useAccounts()
  const { plan, updatedAt, loading, error, reload, savePlan } = useTradingPlan()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [selectedAccount, setSelectedAccount] = useState(null)

  useEffect(() => {
    if (accounts.length && !selectedAccount) setSelectedAccount(accounts[0])
  }, [accounts, selectedAccount])

  // Modal state — one flag per editor, holding either the item being
  // edited or a context object for "add" flows.
  const [quoteModal, setQuoteModal] = useState(false)
  const [footerModal, setFooterModal] = useState(false)
  const [strategyModal, setStrategyModal] = useState(null) // { mode: 'add'|'edit', strategy? }
  const [ruleModal, setRuleModal] = useState(null) // { strategyId, rule? }
  const [profileModal, setProfileModal] = useState(null) // { profile? }
  const [riskRowModal, setRiskRowModal] = useState(null) // { profileId, row? }
  const [tipModal, setTipModal] = useState(false)
  const [pairModal, setPairModal] = useState(null) // { pair? }
  const [sessionModal, setSessionModal] = useState(null) // { session? }
  const [conditionsNoteModal, setConditionsNoteModal] = useState(false)
  const [noTradeModal, setNoTradeModal] = useState(null) // { rule? }
  const [deleteTarget, setDeleteTarget] = useState(null) // { label, onConfirm }

  const persist = async (next) => {
    try {
      await savePlan(next)
    } catch (err) {
      showToast({ type: 'error', title: 'Could not save changes', description: err.message })
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen bg-bg">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onMenuClick={() => setSidebarOpen(true)} accounts={[]} selectedAccount={{ label: 'Loading…' }} onSelectAccount={() => {}} breadcrumb="Overview / Trading Plan" />
          <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8"><PlanSkeleton /></main>
        </div>
      </div>
    )
  }

  if (error || !plan) {
    return (
      <div className="flex min-h-screen bg-bg">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar onMenuClick={() => setSidebarOpen(true)} accounts={[]} selectedAccount={{ label: 'Trading Plan' }} onSelectAccount={() => {}} breadcrumb="Overview / Trading Plan" />
          <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8"><ErrorState message={error || 'No plan found.'} onRetry={reload} /></main>
        </div>
      </div>
    )
  }

  /* ---- mutation helpers — all immutable, all persisted immediately --- */

  const updateStrategies = (strategies) => persist({ ...plan, strategies })
  const updateRisk = (risk) => persist({ ...plan, risk })
  const updateConditions = (conditions) => persist({ ...plan, conditions })
  const updateNoTrade = (noTrade) => persist({ ...plan, noTrade })

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onMenuClick={() => setSidebarOpen(true)}
          accounts={accounts.map((a) => ({ id: a.id, label: a.name, status: a.mt5_connected ? 'connected' : 'disconnected' }))}
          selectedAccount={selectedAccount ? { label: selectedAccount.name } : { label: 'No Account' }}
          onSelectAccount={(a) => setSelectedAccount(accounts.find((acc) => acc.id === a.id))}
          breadcrumb="Overview / Trading Plan"
        />

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-[28px] font-bold text-text-primary sm:text-[32px]">Trading Plan</h1>
              <p className="mt-1 text-sm text-text-secondary">Same rules. Same process. Better results.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5">
                <CalendarDays className="h-4 w-4 text-text-muted" />
                <div>
                  <p className="text-[11px] text-text-muted">Last Updated</p>
                  <p className="text-sm font-semibold text-text-primary">
                    {updatedAt ? new Date(updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setQuoteModal(true)}
                className="group flex max-w-xs items-start gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-left transition-colors hover:border-brand/30"
              >
                <Quote className="h-4 w-4 shrink-0 text-brand" />
                <span className="text-sm italic text-text-secondary">{plan.quote}</span>
                <Pencil className="ml-1 h-3.5 w-3.5 shrink-0 text-text-muted opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            </div>
          </div>

          {/* Main grid */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Strategy Rules */}
            <Card>
              <CardHeader
                icon={Target}
                iconBg="bg-blue-50 text-brand"
                title="Strategy Rules"
                subtitle="Your trading strategy and setup rules."
                action={
                  <div className="flex items-center gap-2">
                    <Badge tone="brand">{plan.strategies.length} Trade Type{plan.strategies.length === 1 ? '' : 's'}</Badge>
                    <button onClick={() => setStrategyModal({ mode: 'add' })} className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface">
                      <Plus className="h-3.5 w-3.5" /> Strategy
                    </button>
                  </div>
                }
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {plan.strategies.map((s, i) => (
                  <StrategyCard
                    key={s.id}
                    strategy={s}
                    index={i}
                    onEditStrategy={() => setStrategyModal({ mode: 'edit', strategy: s })}
                    onDeleteStrategy={() =>
                      setDeleteTarget({
                        label: s.name,
                        onConfirm: () => { updateStrategies(plan.strategies.filter((x) => x.id !== s.id)); setDeleteTarget(null) },
                      })
                    }
                    onAddRule={() => setRuleModal({ strategyId: s.id })}
                    onEditRule={(rule) => setRuleModal({ strategyId: s.id, rule })}
                    onDeleteRule={(ruleId) =>
                      setDeleteTarget({
                        label: 'this rule',
                        onConfirm: () => {
                          updateStrategies(plan.strategies.map((x) => (x.id === s.id ? { ...x, rules: x.rules.filter((r) => r.id !== ruleId) } : x)))
                          setDeleteTarget(null)
                        },
                      })
                    }
                  />
                ))}
                {plan.strategies.length === 0 && (
                  <p className="col-span-2 py-8 text-center text-sm text-text-muted">No strategies yet — add your first one.</p>
                )}
              </div>
            </Card>

            {/* Risk Management */}
            <Card>
              <CardHeader
                icon={Shield}
                iconBg="bg-green-50 text-success"
                title="Risk Management"
                subtitle="Protect your capital. Stay consistent."
                action={
                  <button onClick={() => setProfileModal({})} className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface">
                    <Plus className="h-3.5 w-3.5" /> Account Type
                  </button>
                }
              />
              <div className="flex flex-col gap-3 sm:flex-row">
                {plan.risk.profiles.map((p) => (
                  <RiskProfileCard
                    key={p.id}
                    profile={p}
                    onEditProfile={() => setProfileModal({ profile: p })}
                    onDeleteProfile={() =>
                      setDeleteTarget({
                        label: p.name,
                        onConfirm: () => { updateRisk({ ...plan.risk, profiles: plan.risk.profiles.filter((x) => x.id !== p.id) }); setDeleteTarget(null) },
                      })
                    }
                    onAddRow={() => setRiskRowModal({ profileId: p.id })}
                    onEditRow={(row) => setRiskRowModal({ profileId: p.id, row })}
                    onDeleteRow={(rowId) =>
                      setDeleteTarget({
                        label: 'this rule',
                        onConfirm: () => {
                          updateRisk({ ...plan.risk, profiles: plan.risk.profiles.map((x) => (x.id === p.id ? { ...x, rows: x.rows.filter((r) => r.id !== rowId) } : x)) })
                          setDeleteTarget(null)
                        },
                      })
                    }
                  />
                ))}
                {plan.risk.profiles.length === 0 && <p className="py-8 text-center text-sm text-text-muted">No account types yet.</p>}
              </div>

              <button onClick={() => setTipModal(true)} className="group mt-4 flex w-full items-start gap-3 rounded-xl border border-green-100 bg-green-50/60 p-3 text-left transition-colors hover:bg-green-50">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-success">{plan.risk.tip?.title || 'Add a reminder'}</p>
                  {plan.risk.tip?.text && <p className="text-xs text-text-secondary">{plan.risk.tip.text}</p>}
                </div>
                <Pencil className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success opacity-0 transition-opacity group-hover:opacity-100" />
              </button>

              <RiskCalculator accounts={accounts} />
            </Card>

            {/* Market & Trading Conditions */}
            <Card>
              <CardHeader icon={BarChart3} iconBg="bg-blue-50 text-brand" title="Market & Trading Conditions" subtitle="Only trade when conditions are right." />
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-text-primary"><Users className="h-4 w-4 text-text-muted" /> Currency Pairs</p>
                    <button onClick={() => setPairModal({})} className="rounded-lg p-1 text-text-muted transition-colors hover:bg-surface hover:text-brand"><Plus className="h-4 w-4" /></button>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {plan.conditions.pairs.map((p) => (
                      <div key={p.id} className="group flex items-center justify-between rounded-lg border border-border px-3 py-2">
                        <span className="text-sm font-semibold text-text-primary">{p.symbol}</span>
                        <div className="flex items-center gap-1.5">
                          <Badge tone={priorityTone[p.priority] || 'neutral'}>{p.priority}</Badge>
                          <RowActions onEdit={() => setPairModal({ pair: p })} onDelete={() =>
                            setDeleteTarget({ label: p.symbol, onConfirm: () => { updateConditions({ ...plan.conditions, pairs: plan.conditions.pairs.filter((x) => x.id !== p.id) }); setDeleteTarget(null) } })
                          } />
                        </div>
                      </div>
                    ))}
                    {plan.conditions.pairs.length === 0 && <p className="py-3 text-center text-xs text-text-muted">No pairs added.</p>}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-sm font-semibold text-text-primary"><Clock className="h-4 w-4 text-text-muted" /> Trading Sessions</p>
                    <button onClick={() => setSessionModal({})} className="rounded-lg p-1 text-text-muted transition-colors hover:bg-surface hover:text-brand"><Plus className="h-4 w-4" /></button>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {plan.conditions.sessions.map((s) => (
                      <div key={s.id} className="group flex items-center justify-between rounded-lg border border-border px-3 py-2">
                        <span className="flex items-center gap-1.5 text-sm text-text-primary"><span className="h-1.5 w-1.5 rounded-full bg-success" />{s.name}</span>
                        <div className="flex items-center gap-1.5">
                          <span className="tabular-nums text-xs text-text-muted">{s.time}</span>
                          <RowActions onEdit={() => setSessionModal({ session: s })} onDelete={() =>
                            setDeleteTarget({ label: s.name, onConfirm: () => { updateConditions({ ...plan.conditions, sessions: plan.conditions.sessions.filter((x) => x.id !== s.id) }); setDeleteTarget(null) } })
                          } />
                        </div>
                      </div>
                    ))}
                    {plan.conditions.sessions.length === 0 && <p className="py-3 text-center text-xs text-text-muted">No sessions added.</p>}
                  </div>
                </div>
              </div>

              <button onClick={() => setConditionsNoteModal(true)} className="group mt-4 flex w-full items-start gap-2 rounded-xl bg-blue-50/60 p-3 text-left transition-colors hover:bg-blue-50">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
                <p className="flex-1 text-xs text-brand">{plan.conditions.note || 'Add a note about when to trade.'}</p>
                <Pencil className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            </Card>

            {/* No Trade Rules */}
            <Card>
              <CardHeader
                icon={Ban}
                iconBg="bg-red-50 text-danger"
                title="No Trade Rules"
                subtitle="What to avoid. Protect your account."
                action={
                  <button onClick={() => setNoTradeModal({})} className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface">
                    <Plus className="h-3.5 w-3.5" /> Rule
                  </button>
                }
              />
              <div className="flex flex-col gap-2.5">
                {plan.noTrade.map((rule, i) => (
                  <NoTradeRow
                    key={rule.id}
                    rule={rule}
                    index={i}
                    onEdit={() => setNoTradeModal({ rule })}
                    onDelete={() =>
                      setDeleteTarget({ label: rule.title, onConfirm: () => { updateNoTrade(plan.noTrade.filter((x) => x.id !== rule.id)); setDeleteTarget(null) } })
                    }
                  />
                ))}
                {plan.noTrade.length === 0 && <p className="py-8 text-center text-sm text-text-muted">No restrictions added yet.</p>}
              </div>
            </Card>
          </div>

          {/* Footer quote */}
          <button onClick={() => setFooterModal(true)} className="group mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm italic text-text-secondary transition-colors hover:border-brand hover:text-brand">
            <FileText className="h-4 w-4" /> {plan.footer}
            <Pencil className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
          </button>
        </main>
      </div>

      {/* Modals */}
      <TextModal open={quoteModal} onClose={() => setQuoteModal(false)} title="Edit Quote" label="Quote" initial={plan.quote}
        onSave={(v) => { persist({ ...plan, quote: v }); setQuoteModal(false) }} />

      <TextModal open={footerModal} onClose={() => setFooterModal(false)} title="Edit Footer Line" label="Footer text" initial={plan.footer}
        onSave={(v) => { persist({ ...plan, footer: v }); setFooterModal(false) }} />

      <StrategyModal
        open={!!strategyModal}
        onClose={() => setStrategyModal(null)}
        initial={strategyModal?.strategy}
        onSave={(form) => {
          if (strategyModal.mode === 'edit') {
            updateStrategies(plan.strategies.map((s) => (s.id === strategyModal.strategy.id ? { ...s, ...form } : s)))
          } else {
            updateStrategies([...plan.strategies, { id: uid(), rules: [], ...form }])
          }
          setStrategyModal(null)
        }}
      />

      <TitleDescModal
        open={!!ruleModal}
        onClose={() => setRuleModal(null)}
        title={ruleModal?.rule ? 'Edit Rule' : 'Add Rule'}
        initial={ruleModal?.rule}
        onSave={(form) => {
          const { strategyId, rule } = ruleModal
          updateStrategies(
            plan.strategies.map((s) => {
              if (s.id !== strategyId) return s
              if (rule) return { ...s, rules: s.rules.map((r) => (r.id === rule.id ? { ...r, ...form } : r)) }
              return { ...s, rules: [...s.rules, { id: uid(), ...form }] }
            })
          )
          setRuleModal(null)
        }}
      />

      <RiskProfileModal
        open={!!profileModal}
        onClose={() => setProfileModal(null)}
        initial={profileModal?.profile}
        onSave={(form) => {
          if (profileModal.profile) {
            updateRisk({ ...plan.risk, profiles: plan.risk.profiles.map((p) => (p.id === profileModal.profile.id ? { ...p, ...form } : p)) })
          } else {
            updateRisk({ ...plan.risk, profiles: [...plan.risk.profiles, { id: uid(), rows: [], ...form }] })
          }
          setProfileModal(null)
        }}
      />

      <RiskRowModal
        open={!!riskRowModal}
        onClose={() => setRiskRowModal(null)}
        initial={riskRowModal?.row}
        onSave={(form) => {
          const { profileId, row } = riskRowModal
          updateRisk({
            ...plan.risk,
            profiles: plan.risk.profiles.map((p) => {
              if (p.id !== profileId) return p
              if (row) return { ...p, rows: p.rows.map((r) => (r.id === row.id ? { ...r, ...form } : r)) }
              return { ...p, rows: [...p.rows, { id: uid(), ...form }] }
            }),
          })
          setRiskRowModal(null)
        }}
      />

      <TitleDescModal
        open={tipModal}
        onClose={() => setTipModal(false)}
        title="Edit Risk Tip"
        initial={{ title: plan.risk.tip?.title, description: plan.risk.tip?.text }}
        onSave={(form) => { updateRisk({ ...plan.risk, tip: { title: form.title, text: form.description } }); setTipModal(false) }}
      />

      <PairModal
        open={!!pairModal}
        onClose={() => setPairModal(null)}
        initial={pairModal?.pair}
        onSave={(form) => {
          if (pairModal.pair) {
            updateConditions({ ...plan.conditions, pairs: plan.conditions.pairs.map((p) => (p.id === pairModal.pair.id ? { ...p, ...form } : p)) })
          } else {
            updateConditions({ ...plan.conditions, pairs: [...plan.conditions.pairs, { id: uid(), ...form }] })
          }
          setPairModal(null)
        }}
      />

      <SessionModal
        open={!!sessionModal}
        onClose={() => setSessionModal(null)}
        initial={sessionModal?.session}
        onSave={(form) => {
          if (sessionModal.session) {
            updateConditions({ ...plan.conditions, sessions: plan.conditions.sessions.map((s) => (s.id === sessionModal.session.id ? { ...s, ...form } : s)) })
          } else {
            updateConditions({ ...plan.conditions, sessions: [...plan.conditions.sessions, { id: uid(), ...form }] })
          }
          setSessionModal(null)
        }}
      />

      <TextModal
        open={conditionsNoteModal}
        onClose={() => setConditionsNoteModal(false)}
        title="Edit Conditions Note"
        label="Note"
        multiline
        initial={plan.conditions.note}
        onSave={(v) => { updateConditions({ ...plan.conditions, note: v }); setConditionsNoteModal(false) }}
      />

      <TitleDescModal
        open={!!noTradeModal}
        onClose={() => setNoTradeModal(null)}
        title={noTradeModal?.rule ? 'Edit No-Trade Rule' : 'Add No-Trade Rule'}
        initial={noTradeModal?.rule}
        onSave={(form) => {
          if (noTradeModal.rule) {
            updateNoTrade(plan.noTrade.map((r) => (r.id === noTradeModal.rule.id ? { ...r, ...form } : r)))
          } else {
            updateNoTrade([...plan.noTrade, { id: uid(), ...form }])
          }
          setNoTradeModal(null)
        }}
      />

      <ConfirmDeleteModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={deleteTarget?.onConfirm} label={deleteTarget?.label} />
    </div>
  )
}