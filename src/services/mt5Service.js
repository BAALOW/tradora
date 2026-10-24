// MT5 connection + connector token management. The Edge Function
// (supabase/functions/mt5-sync) is what actually talks to Postgres
// with elevated privileges — this file only calls things the browser
// is allowed to call directly under RLS, plus the one SECURITY DEFINER
// RPC that safely mints a connector token.

import { supabase } from '../lib/supabaseClient'

export async function getConnection(accountId) {
  const { data, error } = await supabase
    .from('mt5_connections')
    .select('*')
    .eq('account_id', accountId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function upsertConnectionDetails(accountId, { mt5Login, mt5Server, broker, isDemo }) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be signed in.')

  const { data, error } = await supabase
    .from('mt5_connections')
    .upsert(
      {
        user_id: user.id,
        account_id: accountId,
        mt5_login: mt5Login || null,
        mt5_server: mt5Server || null,
        broker: broker || null,
        is_demo: !!isDemo,
        connection_status: 'never_connected',
      },
      { onConflict: 'account_id' }
    )
    .select()
    .single()

  if (error) throw error
  return data
}

// Calls the generate_connector_token(uuid) Postgres function (SECURITY
// DEFINER) — see supabase-migration-2-mt5-sync.sql. Only the hash is
// ever persisted; this is the one moment the raw token exists and it
// must be shown to the user immediately and never fetched again.
export async function generateConnectorToken(accountId) {
  const { data, error } = await supabase.rpc('generate_connector_token', {
    p_account_id: accountId,
  })
  if (error) throw error
  return data // raw token string, e.g. "tdra_ab12...":
}

export async function listTokens(accountId) {
  const { data, error } = await supabase
    .from('connector_tokens')
    .select('id, token_prefix, created_at, revoked_at, last_used_at')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function revokeToken(tokenId) {
  const { error } = await supabase
    .from('connector_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', tokenId)

  if (error) throw error
  return true
}

export async function getSyncLogs(accountId, limit = 20) {
  const { data, error } = await supabase
    .from('mt5_sync_logs')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data
}