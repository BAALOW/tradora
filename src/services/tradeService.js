// All raw Supabase queries for `trades` live here.
import { supabase } from '../lib/supabaseClient'

const LIST_COLUMNS = [
  'id', 'user_id', 'account_id', 'mt5_ticket', 'mt5_position_id', 'mt5_magic_number',
  'symbol', 'direction', 'volume',
  'entry_price', 'stop_loss', 'take_profit', 'exit_price',
  'risk_amount', 'risk_percent', 'potential_profit', 'rr', 'sl_pips', 'tp_pips',
  'profit', 'commission', 'swap', 'net_profit',
  'status', 'result', 'outcome',
  'session', 'setup', 'trend_type', 'supply_demand_zone', 'liquidity_manipulation', 'counter_break',
  'entry_reason', 'emotion', 'notes', 'mistake', 'lesson', 'next_improvement', 'plan_followed',
  'execution_score', 'setup_quality', 'entry_execution', 'risk_management_score', 'plan_compliance',
  'opened_at', 'closed_at', 'created_at', 'updated_at',
].join(', ')

export async function getTrades({ accountId } = {}) {
  let query = supabase.from('trades').select(LIST_COLUMNS).order('opened_at', { ascending: false })
  if (accountId) query = query.eq('account_id', accountId)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getTradeById(tradeId) {
  const { data, error } = await supabase.from('trades').select('*').eq('id', tradeId).single()
  if (error) throw error
  return data
}

export async function createManualTrade(payload) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be signed in to log a trade.')
  const { data, error } = await supabase.from('trades')
    .insert({ ...payload, user_id: user.id, mt5_ticket: null })
    .select().single()
  if (error) throw error
  return data
}

export async function updateTrade(tradeId, payload) {
  const { data, error } = await supabase.from('trades')
    .update(payload).eq('id', tradeId).select().single()
  if (error) throw error
  return data
}

// The Edge Function verifies ownership, removes ImageKit screenshots,
// and only then deletes the Journal trade row.
export async function deleteTrade(tradeId) {
  const { data, error } = await supabase.functions.invoke('journal-imagekit-delete', {
    body: { tradeId },
  })
  if (error) throw new Error(error.message || 'Failed to delete Journal trade and screenshots.')
  if (!data?.success) throw new Error(data?.error || 'Failed to delete Journal trade and screenshots.')
  return true
}

export async function getAccountStats(accountId) {
  const { data, error } = await supabase.from('account_trade_stats')
    .select('*').eq('account_id', accountId).maybeSingle()
  if (error) throw error
  return data
}

export function computeJournalStats(tradeList) {
  const closed = tradeList.filter((t) => t.result && t.result !== 'NONE')
  const open = tradeList.filter((t) => !t.result || t.result === 'NONE')
  const wins = closed.filter((t) => t.result === 'WIN')
  const losses = closed.filter((t) => t.result === 'LOSS')
  const be = closed.filter((t) => t.result === 'BREAK_EVEN')
  const netPnl = closed.reduce((sum, t) => sum + Number(t.net_profit || 0), 0)
  const grossProfit = wins.reduce((sum, t) => sum + Number(t.net_profit || 0), 0)
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + Number(t.net_profit || 0), 0))
  const profitFactor = grossLoss ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0
  const winRate = closed.length ? (wins.length / closed.length) * 100 : 0
  const avgWin = wins.length ? grossProfit / wins.length : 0
  const avgLoss = losses.length ? grossLoss / losses.length : 0
  const avgRisk = tradeList.length ? tradeList.reduce((sum, t) => sum + Number(t.risk_percent || 0), 0) / tradeList.length : 0
  const tradesWithRR = tradeList.filter((t) => t.rr)
  const avgRR = tradesWithRR.length ? tradesWithRR.reduce((sum, t) => {
    const parts = String(t.rr || '').split(':')
    const rrVal = parts.length === 2 ? Number(parts[1]) / Number(parts[0]) : 0
    return sum + (Number.isFinite(rrVal) ? rrVal : 0)
  }, 0) / tradesWithRR.length : 0
  const expectancy = closed.length ? netPnl / closed.length : 0
  const chronological = [...closed].sort((a, b) => new Date(a.closed_at) - new Date(b.closed_at))
  let maxWinStreak = 0, maxLossStreak = 0, currentWinStreak = 0, currentLossStreak = 0
  let runningEquity = 0, peakEquity = 0, maxDrawdown = 0
  for (const t of chronological) {
    if (t.result === 'WIN') { currentWinStreak += 1; currentLossStreak = 0 }
    else if (t.result === 'LOSS') { currentLossStreak += 1; currentWinStreak = 0 }
    else { currentWinStreak = 0; currentLossStreak = 0 }
    maxWinStreak = Math.max(maxWinStreak, currentWinStreak)
    maxLossStreak = Math.max(maxLossStreak, currentLossStreak)
    runningEquity += Number(t.net_profit || 0)
    peakEquity = Math.max(peakEquity, runningEquity)
    maxDrawdown = Math.max(maxDrawdown, peakEquity - runningEquity)
  }
  return { total: tradeList.length, open: open.length, closed: closed.length, wins: wins.length,
    losses: losses.length, breakEven: be.length, winRate, netPnl, grossProfit, grossLoss,
    profitFactor, avgWin, avgLoss, avgRisk, avgRR: avgRR || 0, expectancy,
    maxWinStreak, maxLossStreak, maxDrawdown }
}

