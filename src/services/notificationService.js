import { supabase } from '../lib/supabaseClient'

export const DEFAULT_NOTIF_PREFS = {
  trade_alerts: true,
  daily_report: true,
  routine_reminder: true,
  prop_rules: true,
  email_enabled: true,
  push_enabled: false, // waxay noqonaysaa true marka user-ku ogolaado browser permission
  reminder_lead_min: 10,
  worship_reminder_enabled: true,
  worship_reminder_time: '20:30',
  daily_report_time: '21:00',
}


/* ---------- auth-safe requests ----------
   Haddii tab-ku muddo furnaa, JWT-ga wuu dhacayaa oo server-ku wuxuu soo celinayaa 401.
   Halkan: marka hore session-ka cusbooneysii, haddii 401 yimaado mar kale isku day. */
async function withAuthRetry(run) {
  try { await supabase.auth.getSession() } catch { /* ignore */ }
  let res = await run()
  if (res.error && (res.status === 401 || /jwt|expired/i.test(res.error.message || ''))) {
    try { await supabase.auth.refreshSession() } catch { /* ignore */ }
    res = await run()
  }
  if (res.error) throw res.error
  return res.data
}

/* ---------- preferences ---------- */
export async function getNotifPrefs(userId) {
  const data = await withAuthRetry(() =>
    supabase.from('notification_preferences').select('*').eq('user_id', userId).maybeSingle())
  const merged = { ...DEFAULT_NOTIF_PREFS, ...(data || {}) }
  merged.worship_reminder_time = String(merged.worship_reminder_time || '20:30').slice(0, 5)
  merged.daily_report_time = String(merged.daily_report_time || '21:00').slice(0, 5)
  return merged
}

export async function saveNotifPrefs(userId, patch) {
  const { error } = await supabase
    .from('notification_preferences')
    .upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) throw error
}

export async function sendTestNotification() {
  const { error } = await supabase.rpc('send_test_notification')
  if (error) throw error
}

/* ---------- in-app list ---------- */
export async function listNotifications(limit = 30) {
  const data = await withAuthRetry(() =>
    supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit))
  return data || []
}

export async function markRead(id) {
  await withAuthRetry(() =>
    supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id))
}

export async function markAllRead(userId) {
  await withAuthRetry(() =>
    supabase.from('notifications').update({ read_at: new Date().toISOString() })
      .eq('user_id', userId).is('read_at', null))
}

/* ---------- browser push ---------- */
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export const pushPermission = () => (pushSupported() ? Notification.permission : 'unsupported')

function urlBase64ToUint8Array(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export async function enablePush(userId) {
  if (!pushSupported()) throw new Error('Browser-kan ma taageero system notifications.')
  if (!VAPID_PUBLIC_KEY) throw new Error('VITE_VAPID_PUBLIC_KEY ma jiro .env-ka.')
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Browser-ka ogolaansho ma bixin. Ka fur Site settings > Notifications.')

  await navigator.serviceWorker.register('/sw.js')
  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }))
  const j = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert(
    { user_id: userId, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent },
    { onConflict: 'endpoint' },
  )
  if (error) throw error
}

export async function disablePush() {
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.getRegistration('/sw.js')
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
}