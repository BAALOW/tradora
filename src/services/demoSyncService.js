// Demo sync — simulates what the real MT5 EA → Edge Function flow will
// do, so the full pipeline (trade created → shows OPEN in Journal →
// closed → same row updates → account balance updates → stats
// recalculate) can be tested before a real MT5 terminal is connected.
//
// IMPORTANT: this writes directly to Supabase from the browser under
// the signed-in user's own RLS policies. It is NOT how real MT5 sync
// works — real sync goes through the mt5-sync Edge Function using a
// connector token, because the EA is never trusted with a Supabase
// session. Demo trades are tagged with a `DEMO-` ticket prefix and
// `source: 'demo'` in trade_events / mt5_sync_logs so they are always
// distinguishable from real MT5 activity.
//
// NOTE on balance: as of migration 7, accounts.current_balance is kept
// in sync automatically by a database trigger every time a trade is
// inserted/updated/deleted — this file no longer touches it directly.
// That removes an entire class of "balance drifted" bugs that manual
// arithmetic here used to risk.

import { supabase } from '../lib/supabaseClient'

async function currentUserId() {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be signed in to run a demo sync.')
  return user.id
}

async function logSync(userId, accountId, { event_type, status, message, payload }) {
  await supabase.from('mt5_sync_logs').insert({
    user_id: userId,
    account_id: accountId,
    source: 'demo',
    event_type,
    status,
    message,
    payload,
  })
}

function demoTicket() {
  return `DEMO-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

// ACCOUNT_UPDATE — pushes a live equity snapshot, and marks the account
// as MT5-connected so the balance trigger knows to leave `current_equity`
// alone from here on (real/simulated MT5 feed owns that number, not the
// trigger's realized-P&L math).
export async function simulateAccountUpdate(accountId, { balance, equity }) {
  const userId = await currentUserId()

  const { error } = await supabase
    .from('accounts')
    .update({ current_equity: equity, mt5_connected: true })
    .eq('id', accountId)

  if (error) {
    await logSync(userId, accountId, { event_type: 'ACCOUNT_UPDATE', status: 'error', message: error.message })
    throw error
  }

  await supabase
    .from('mt5_connections')
    .upsert(
      {
        user_id: userId,
        account_id: accountId,
        connection_status: 'connected',
        last_seen_at: new Date().toISOString(),
        last_sync_at: new Date().toISOString(),
        is_demo: true,
      },
      { onConflict: 'account_id' }
    )

  await logSync(userId, accountId, {
    event_type: 'ACCOUNT_UPDATE',
    status: 'success',
    message: `Equity $${equity} (balance is tracked automatically from closed trades)`,
    payload: { balance, equity },
  })
}

// TRADE_OPEN — creates a new OPEN trade with a demo MT5 ticket. Balance
// is untouched (correctly) — nothing has closed yet.
export async function simulateTradeOpen(accountId, tradeInput) {
  const userId = await currentUserId()
  const ticket = demoTicket()

  const { data: trade, error } = await supabase
    .from('trades')
    .insert({
      user_id: userId,
      account_id: accountId,
      mt5_ticket: ticket,
      mt5_position_id: ticket,
      symbol: tradeInput.symbol,
      direction: tradeInput.direction,
      volume: tradeInput.volume,
      entry_price: tradeInput.entryPrice,
      stop_loss: tradeInput.stopLoss,
      take_profit: tradeInput.takeProfit,
      risk_amount: tradeInput.riskAmount ?? null,
      risk_percent: tradeInput.riskPercent ?? null,
      status: 'OPEN',
      result: 'NONE',
      opened_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    await logSync(userId, accountId, { event_type: 'TRADE_OPEN', status: 'error', message: error.message })
    throw error
  }

  await supabase.from('trade_events').insert({
    user_id: userId,
    account_id: accountId,
    trade_id: trade.id,
    mt5_ticket: ticket,
    event_type: 'OPEN',
    volume: tradeInput.volume,
    price: tradeInput.entryPrice,
    event_time: new Date().toISOString(),
    request_id: `demo-open-${ticket}`,
  })

  await logSync(userId, accountId, {
    event_type: 'TRADE_OPEN',
    status: 'success',
    message: `Opened ${tradeInput.direction} ${tradeInput.symbol} (demo ticket ${ticket})`,
    payload: tradeInput,
  })

  return trade
}

// TRADE_CLOSE — finds the SAME trade by (account_id, mt5_ticket) and
// updates it in place. The moment this UPDATE commits, the
// trades_sync_account_balance trigger (migration 7) recalculates
// accounts.current_balance automatically — no manual arithmetic here.
export async function simulateTradeClose(accountId, mt5Ticket, closeInput) {
  const userId = await currentUserId()

  const { data: existing, error: findError } = await supabase
    .from('trades')
    .select('*')
    .eq('account_id', accountId)
    .eq('mt5_ticket', mt5Ticket)
    .single()

  if (findError) {
    await logSync(userId, accountId, { event_type: 'TRADE_CLOSE', status: 'error', message: findError.message })
    throw findError
  }

  const profit = Number(closeInput.profit || 0)
  const commission = Number(closeInput.commission || 0)
  const swap = Number(closeInput.swap || 0)
  const netProfit = profit + commission + swap
  const result = netProfit > 0 ? 'WIN' : netProfit < 0 ? 'LOSS' : 'BREAK_EVEN'

  const { data: updated, error } = await supabase
    .from('trades')
    .update({
      exit_price: closeInput.exitPrice,
      profit,
      commission,
      swap,
      net_profit: netProfit,
      status: 'CLOSED',
      result,
      closed_at: new Date().toISOString(),
    })
    .eq('id', existing.id)
    .select()
    .single()

  if (error) {
    await logSync(userId, accountId, { event_type: 'TRADE_CLOSE', status: 'error', message: error.message })
    throw error
  }

  await supabase.from('trade_events').insert({
    user_id: userId,
    account_id: accountId,
    trade_id: updated.id,
    mt5_ticket: mt5Ticket,
    event_type: 'CLOSE',
    price: closeInput.exitPrice,
    profit,
    commission,
    swap,
    event_time: new Date().toISOString(),
    request_id: `demo-close-${mt5Ticket}`,
  })

  await logSync(userId, accountId, {
    event_type: 'TRADE_CLOSE',
    status: 'success',
    message: `Closed ${updated.symbol} — net P&L $${netProfit.toFixed(2)} (${result}). Account balance updates automatically.`,
    payload: closeInput,
  })

  return updated
}

// Convenience: runs ACCOUNT_UPDATE → TRADE_OPEN → (after a short delay)
// TRADE_CLOSE, so a "Run Demo Sync" button can exercise the full
// pipeline in one click for testing.
export async function runFullDemoCycle(accountId, account) {
  const symbol = 'EURUSD'
  const entryPrice = 1.0900
  const stopLoss = 1.0870
  const takeProfit = 1.0960
  const volume = 0.5
  const riskAmount = Number(account.current_balance) * 0.01

  await simulateAccountUpdate(accountId, {
    balance: account.current_balance,
    equity: account.current_equity ?? account.current_balance,
  })

  const trade = await simulateTradeOpen(accountId, {
    symbol,
    direction: 'BUY',
    volume,
    entryPrice,
    stopLoss,
    takeProfit,
    riskAmount,
    riskPercent: 1,
  })

  await new Promise((resolve) => setTimeout(resolve, 1200))

  const profit = riskAmount * 2 // simulate a winning 1:2 trade
  const closed = await simulateTradeClose(accountId, trade.mt5_ticket, {
    exitPrice: takeProfit,
    profit,
    commission: -2,
    swap: -0.5,
  })

  return closed
}