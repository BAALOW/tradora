// TRADORA — Secure MT5 Sync Edge Function
//
// MT5 EA → HTTPS POST → this function → Supabase (service_role) → React reads via RLS
//
// The EA NEVER receives a Supabase session or the service_role key. It
// only ever holds a connector token (see generate_connector_token() in
// supabase-migration-2-mt5-sync.sql). This function is the only thing
// allowed to use SUPABASE_SERVICE_ROLE_KEY, and that key never leaves
// the Edge Function runtime — it is not sent to the client, ever.
//
// Deploy with:
//   supabase functions deploy mt5-sync
// Required secrets (set with `supabase secrets set`):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createHash } from 'node:crypto'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// service_role bypasses RLS — this is intentional and safe ONLY because
// every query below is manually scoped to the account the token proves
// ownership of. Never trust account_id from the request body alone.
const supabase = createClient(supabaseUrl, serviceRoleKey)

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function isValidNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

async function resolveAccountFromToken(rawToken: string) {
  if (!rawToken || typeof rawToken !== 'string') return null

  const tokenHash = hashToken(rawToken)

  const { data: tokenRow, error } = await supabase
    .from('connector_tokens')
    .select('id, user_id, account_id, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (error || !tokenRow || tokenRow.revoked_at) return null

  // Touch last_used_at (best-effort, don't block the sync on this).
  supabase.from('connector_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', tokenRow.id).then(() => {})

  return { userId: tokenRow.user_id, accountId: tokenRow.account_id }
}

async function logSync(userId: string, accountId: string, entry: {
  event_type?: string
  status: 'success' | 'error'
  message?: string
  payload?: unknown
}) {
  await supabase.from('mt5_sync_logs').insert({
    user_id: userId,
    account_id: accountId,
    source: 'ea',
    ...entry,
  })
}

async function handleAccountUpdate(userId: string, accountId: string, payload: any) {
  const { balance, equity } = payload
  if (!isValidNumber(balance) || !isValidNumber(equity)) {
    throw new Error('ACCOUNT_UPDATE requires numeric balance and equity')
  }

  // starting_balance is intentionally never touched here.
  await supabase
    .from('accounts')
    .update({ current_balance: balance, current_equity: equity })
    .eq('id', accountId)
    .eq('user_id', userId)

  await supabase
    .from('mt5_connections')
    .update({ connection_status: 'connected', last_seen_at: new Date().toISOString(), last_sync_at: new Date().toISOString(), last_sync_error: null })
    .eq('account_id', accountId)

  return { updated: 'account' }
}

async function handleTradeOpen(userId: string, accountId: string, payload: any, requestId: string | null) {
  const { ticket, positionId, symbol, direction, volume, entry, sl, tp, magicNumber, openTime } = payload

  if (!ticket || !symbol || !['BUY', 'SELL'].includes(direction) || !isValidNumber(volume)) {
    throw new Error('TRADE_OPEN payload missing required fields')
  }

  // Idempotent by (account_id, mt5_ticket) — a retried OPEN just no-ops
  // via upsert instead of creating a duplicate trade.
  const { data: trade, error } = await supabase
    .from('trades')
    .upsert(
      {
        user_id: userId,
        account_id: accountId,
        mt5_ticket: String(ticket),
        mt5_position_id: positionId ? String(positionId) : String(ticket),
        mt5_magic_number: magicNumber ?? null,
        symbol,
        direction,
        volume,
        entry_price: entry ?? null,
        stop_loss: sl ?? null,
        take_profit: tp ?? null,
        status: 'OPEN',
        result: 'NONE',
        opened_at: openTime ? new Date(openTime).toISOString() : new Date().toISOString(),
      },
      { onConflict: 'account_id,mt5_ticket', ignoreDuplicates: false }
    )
    .select()
    .single()

  if (error) throw error

  if (requestId) {
    await supabase.from('trade_events').insert({
      user_id: userId,
      account_id: accountId,
      trade_id: trade.id,
      mt5_ticket: String(ticket),
      event_type: 'OPEN',
      volume,
      price: entry,
      event_time: new Date().toISOString(),
      request_id: requestId,
    }).then(() => {}, () => {}) // unique constraint on request_id silently no-ops a retry
  }

  return { trade_id: trade.id }
}

async function handleTradeClose(userId: string, accountId: string, payload: any, requestId: string | null) {
  const { ticket, exitPrice, profit, commission, swap, closeTime, partial, closedVolume } = payload

  if (!ticket || !isValidNumber(profit)) {
    throw new Error('TRADE_CLOSE payload missing required fields')
  }

  const { data: existing, error: findError } = await supabase
    .from('trades')
    .select('*')
    .eq('account_id', accountId)
    .eq('mt5_ticket', String(ticket))
    .single()

  if (findError || !existing) throw new Error(`No open trade found for ticket ${ticket}`)

  const netProfit = Number(profit) + Number(commission || 0) + Number(swap || 0)
  const result = netProfit > 0 ? 'WIN' : netProfit < 0 ? 'LOSS' : 'BREAK_EVEN'
  const isFullClose = !partial || Number(closedVolume) >= Number(existing.volume)

  const { data: updated, error } = await supabase
    .from('trades')
    .update({
      exit_price: exitPrice ?? existing.exit_price,
      profit: Number(profit),
      commission: Number(commission || 0),
      swap: Number(swap || 0),
      net_profit: netProfit,
      status: isFullClose ? 'CLOSED' : 'OPEN',
      result: isFullClose ? result : existing.result,
      closed_at: isFullClose ? (closeTime ? new Date(closeTime).toISOString() : new Date().toISOString()) : existing.closed_at,
    })
    .eq('id', existing.id)
    .select()
    .single()

  if (error) throw error

  if (requestId) {
    await supabase.from('trade_events').insert({
      user_id: userId,
      account_id: accountId,
      trade_id: existing.id,
      mt5_ticket: String(ticket),
      event_type: partial ? 'PARTIAL_CLOSE' : 'CLOSE',
      price: exitPrice,
      profit,
      commission,
      swap,
      event_time: new Date().toISOString(),
      request_id: requestId,
    }).then(() => {}, () => {})
  }

  // Reflect the realized P&L in the account balance immediately;
  // the next ACCOUNT_UPDATE from MT5 will reconcile it exactly.
  const { data: account } = await supabase.from('accounts').select('current_balance').eq('id', accountId).single()
  if (account) {
    await supabase
      .from('accounts')
      .update({ current_balance: Number(account.current_balance) + netProfit })
      .eq('id', accountId)
  }

  return { trade_id: updated.id, result }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const { token, event_type, request_id, payload } = body || {}

  const resolved = await resolveAccountFromToken(token)
  if (!resolved) {
    return jsonResponse({ error: 'Invalid or revoked connector token' }, 401)
  }
  const { userId, accountId } = resolved

  if (!event_type || typeof event_type !== 'string') {
    await logSync(userId, accountId, { status: 'error', message: 'Missing event_type' })
    return jsonResponse({ error: 'Missing event_type' }, 400)
  }

  try {
    let result
    switch (event_type) {
      case 'ACCOUNT_UPDATE':
        result = await handleAccountUpdate(userId, accountId, payload)
        break
      case 'TRADE_OPEN':
        result = await handleTradeOpen(userId, accountId, payload, request_id)
        break
      case 'TRADE_CLOSE':
      case 'TRADE_PARTIAL_CLOSE':
        result = await handleTradeClose(userId, accountId, { ...payload, partial: event_type === 'TRADE_PARTIAL_CLOSE' }, request_id)
        break
      default:
        throw new Error(`Unknown event_type: ${event_type}`)
    }

    await logSync(userId, accountId, { event_type, status: 'success', payload })
    return jsonResponse({ success: true, ...result })
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))

    await supabase
      .from('mt5_connections')
      .update({ connection_status: 'sync_error', last_sync_error: error.message })
      .eq('account_id', accountId)

    await logSync(userId, accountId, { event_type, status: 'error', message: error.message, payload })
    return jsonResponse({ error: error.message }, 400)
  }
})