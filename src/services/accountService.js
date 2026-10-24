// All raw Supabase queries for `accounts` live here — components never
// talk to Supabase directly. Each function throws on error so callers
// (useAccounts) can catch and surface a clean message.

import { supabase } from '../lib/supabaseClient'

// Fields React is allowed to write. mt5_connected and mt5_last_sync_at
// are reserved for the future backend/EA sync and are stripped out
// even if a caller accidentally includes them.
const WRITABLE_FIELDS = [
  'name',
  'firm',
  'account_type',
  'platform',
  'account_number',
  'server',
  'starting_balance',
  'current_balance',
  'current_equity',
  'currency',
  'leverage',
  'profit_target_percent',
  'daily_loss_limit_percent',
  'max_drawdown_percent',
  'status',
  'notes',
]

function sanitize(payload) {
  const clean = {}
  for (const key of WRITABLE_FIELDS) {
    if (payload[key] !== undefined) clean[key] = payload[key]
  }
  return clean
}

export async function getAccounts() {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function getAccountById(accountId) {
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', accountId)
    .single()

  if (error) throw error
  return data
}

export async function createAccount(payload) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be signed in to add an account.')

  const clean = sanitize(payload)
  clean.user_id = user.id
  clean.status = clean.status || 'healthy'
  clean.currency = clean.currency || 'USD'
  clean.platform = clean.platform || 'MT5'

  const { data, error } = await supabase.from('accounts').insert(clean).select().single()
  if (error) throw error
  return data
}

export async function updateAccount(accountId, payload) {
  const clean = sanitize(payload)

  const { data, error } = await supabase
    .from('accounts')
    .update(clean)
    .eq('id', accountId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteAccount(accountId) {
  const { error } = await supabase.from('accounts').delete().eq('id', accountId)
  if (error) throw error
  return true
}