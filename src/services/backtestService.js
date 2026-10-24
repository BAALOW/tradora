// Raw Supabase queries + pure stats calculations for backtest_trades.
// Mirrors the Journal's tradeService.js pattern: list queries exclude
// screenshot data (kept fast), full rows are fetched on demand.

import { supabase } from '../lib/supabaseClient'

const LIST_COLUMNS = [
  'id', 'user_id', 'account_id', 'strategy', 'pair', 'direction',
  'trade_date', 'sl_pips', 'tp_pips', 'rr', 'result', 'profit', 'notes', 'created_at',
].join(', ')

export async function getBacktestTrades({ accountId, startDate, endDate } = {}) {
  let query = supabase.from('backtest_trades').select(LIST_COLUMNS).order('trade_date', { ascending: true })
  if (accountId) query = query.eq('account_id', accountId)
  if (startDate) query = query.gte('trade_date', startDate)
  if (endDate) query = query.lte('trade_date', endDate)

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getBacktestTradeById(id) {
  const { data, error } = await supabase.from('backtest_trades').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function createBacktestTrade(payload) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be signed in to log a backtest trade.')

  const { data, error } = await supabase
    .from('backtest_trades')
    .insert({ ...payload, user_id: user.id })
    .select()
    .single()

  if (error) throw error
  return data
}

// Updates one backtest trade. Returns the LIST columns only (no
// screenshot data) so the row can be dropped straight back into the list state.
export async function updateBacktestTrade(id, payload) {
  const { data, error } = await supabase
    .from('backtest_trades')
    .update(payload)
    .eq('id', id)
    .select(LIST_COLUMNS)
    .single()

  if (error) throw error
  return data
}

// The authenticated Edge Function removes the trade's ImageKit screenshots
// using their stored file IDs, then deletes the database row.
export async function deleteBacktestTrade(id) {
  const { data, error } = await supabase.functions.invoke('imagekit-delete', {
    body: { tradeId: id },
  })

  if (error) {
    throw new Error(error.message || 'Failed to delete the backtest trade and screenshots.')
  }

  if (!data?.success) {
    throw new Error(data?.error || 'Failed to delete the backtest trade and screenshots.')
  }

  return true
}

/* ------------------------------------------------------------------ */
/* Pure stats — no network calls, safe to run on any filtered subset.  */
/* ------------------------------------------------------------------ */

function rrToNumber(rr) {
  const parts = String(rr || '').split(':')
  const val = parts.length === 2 ? Number(parts[1]) / Number(parts[0]) : 0
  return Number.isFinite(val) ? val : 0
}

export function computeBacktestStats(tradeList) {
  const total = tradeList.length
  const wins = tradeList.filter((t) => t.result === 'WIN')
  const losses = tradeList.filter((t) => t.result === 'LOSS')
  const be = tradeList.filter((t) => t.result === 'BREAK_EVEN')

  const winRate = total ? (wins.length / total) * 100 : 0
  const grossProfit = wins.reduce((sum, t) => sum + Number(t.profit || 0), 0)
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + Number(t.profit || 0), 0))
  const netProfit = tradeList.reduce((sum, t) => sum + Number(t.profit || 0), 0)
  const profitFactor = grossLoss ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0
  const avgWin = wins.length ? grossProfit / wins.length : 0
  const avgLoss = losses.length ? grossLoss / losses.length : 0
  const maxWin = wins.length ? Math.max(...wins.map((t) => Number(t.profit || 0))) : 0
  const maxLoss = losses.length ? Math.min(...losses.map((t) => Number(t.profit || 0))) : 0
  const tradesWithRR = tradeList.filter((t) => t.rr)
  const avgRR = tradesWithRR.length
    ? tradesWithRR.reduce((sum, t) => sum + rrToNumber(t.rr), 0) / tradesWithRR.length
    : 0

  const chronological = [...tradeList].sort((a, b) => new Date(a.trade_date) - new Date(b.trade_date))
  let running = 0
  let peak = 0
  let maxDrawdownAmount = 0
  let currentWinStreak = 0
  let currentLossStreak = 0
  let maxWinStreak = 0
  let maxLossStreak = 0
  const equityCurve = []

  chronological.forEach((t, i) => {
    running += Number(t.profit || 0)
    peak = Math.max(peak, running)
    maxDrawdownAmount = Math.max(maxDrawdownAmount, peak - running)

    if (t.result === 'WIN') {
      currentWinStreak += 1
      currentLossStreak = 0
    } else if (t.result === 'LOSS') {
      currentLossStreak += 1
      currentWinStreak = 0
    } else {
      currentWinStreak = 0
      currentLossStreak = 0
    }
    maxWinStreak = Math.max(maxWinStreak, currentWinStreak)
    maxLossStreak = Math.max(maxLossStreak, currentLossStreak)

    const windowStart = Math.max(0, i - 2)
    const windowSlice = equityCurve.slice(windowStart).map((p) => p.equity).concat(running)
    const balance = windowSlice.reduce((s, v) => s + v, 0) / windowSlice.length

    equityCurve.push({
      date: new Date(t.trade_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      equity: Number(running.toFixed(2)),
      balance: Number(balance.toFixed(2)),
    })
  })

  const peakForDrawdownPct = peak || 1
  const maxDrawdownPct = (maxDrawdownAmount / peakForDrawdownPct) * 100

  return {
    total, wins: wins.length, losses: losses.length, breakEven: be.length,
    winRate, netProfit, grossProfit, grossLoss, profitFactor, avgWin, avgLoss,
    maxWin, maxLoss, avgRR, maxWinStreak, maxLossStreak,
    maxDrawdownAmount, maxDrawdownPct, equityCurve,
  }
}

export function computePeriodBreakdown(tradeList, granularity = 'monthly') {
  const buckets = new Map()

  for (const t of tradeList) {
    const d = new Date(t.trade_date)
    let key
    let label
    if (granularity === 'yearly') {
      key = `${d.getFullYear()}`
      label = key
    } else if (granularity === 'weekly') {
      const firstDay = new Date(d.getFullYear(), 0, 1)
      const week = Math.ceil(((d - firstDay) / 86400000 + firstDay.getDay() + 1) / 7)
      key = `${d.getFullYear()}-W${week}`
      label = `Week ${week}, ${d.getFullYear()}`
    } else {
      key = `${d.getFullYear()}-${d.getMonth()}`
      label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    }

    if (!buckets.has(key)) buckets.set(key, { key, label, sortDate: d, trades: [] })
    buckets.get(key).trades.push(t)
  }

  return [...buckets.values()]
    .sort((a, b) => b.sortDate - a.sortDate)
    .map((bucket) => {
      const wins = bucket.trades.filter((t) => t.result === 'WIN').length
      return {
        label: bucket.label,
        tradesCount: bucket.trades.length,
        winRate: bucket.trades.length ? (wins / bucket.trades.length) * 100 : 0,
      }
    })
}

