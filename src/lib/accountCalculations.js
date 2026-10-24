// Pure business-logic helpers for account statistics.
// No Supabase, no React — just numbers in, numbers out.
// Keeping these separate from accountService.js (data) and the UI
// components makes each piece independently testable.

export function calcPnl(account) {
  const balance = Number(account.current_balance) || 0
  const starting = Number(account.starting_balance) || 0
  return balance - starting
}

export function calcPnlPct(account) {
  const starting = Number(account.starting_balance) || 0
  if (!starting) return 0
  return (calcPnl(account) / starting) * 100
}

export function calcProfitTargetProgress(account) {
  const targetPct = Number(account.profit_target_percent) || 0
  if (!targetPct) return null
  const pnlPct = calcPnlPct(account)
  const progress = (pnlPct / targetPct) * 100
  return Math.max(0, Math.min(100, progress))
}

// Drawdown, win rate, and trade counts require real trade history.
// Until trades are wired to Supabase for a given account, we never
// fabricate these numbers — callers should render "No trading data yet."
export function hasPerformanceData(account) {
  return Boolean(account?.trades_count && account.trades_count > 0)
}

const STATUS_LABELS = {
  healthy: 'Healthy',
  caution: 'Caution',
  at_risk: 'At Risk',
  passed: 'Passed',
  failed: 'Failed',
  inactive: 'Inactive',
}

export function statusLabel(status) {
  return STATUS_LABELS[status] || status
}

const TYPE_LABELS = {
  evaluation: 'Evaluation',
  funded: 'Funded',
  personal: 'Personal',
  demo: 'Demo',
}

export function typeLabel(type) {
  return TYPE_LABELS[type] || type
}