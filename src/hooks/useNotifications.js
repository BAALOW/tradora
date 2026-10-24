import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { listNotifications, markAllRead as markAllReadApi, markRead as markReadApi } from '../services/notificationService'

export function useNotifications() {
  const { user } = useAuth()
  const userId = user?.id
  const [items, setItems] = useState([])

  useEffect(() => {
    if (!userId) { setItems([]); return undefined }
    let alive = true
    listNotifications().then((d) => { if (alive) setItems(d) }).catch((e) => console.warn('notifications:', e?.message || e))

    const channel = supabase
      .channel(`notifications:${userId}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (p) => setItems((prev) => (prev.some((i) => i.id === p.new.id) ? prev : [p.new, ...prev].slice(0, 30))))
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (p) => setItems((prev) => prev.map((i) => (i.id === p.new.id ? p.new : i))))
      .subscribe()

    return () => { alive = false; supabase.removeChannel(channel) }
  }, [userId])

  const unread = useMemo(() => items.filter((i) => !i.read_at).length, [items])

  const markRead = useCallback(async (id) => {
    setItems((p) => p.map((i) => (i.id === id && !i.read_at ? { ...i, read_at: new Date().toISOString() } : i)))
    try { await markReadApi(id) } catch (e) { console.error(e) }
  }, [])

  const markAllRead = useCallback(async () => {
    setItems((p) => p.map((i) => (i.read_at ? i : { ...i, read_at: new Date().toISOString() })))
    try { await markAllReadApi(userId) } catch (e) { console.error(e) }
  }, [userId])

  return { items, unread, markRead, markAllRead }
}