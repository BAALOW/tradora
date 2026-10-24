import { supabase } from '../lib/supabaseClient'

/* ---------- tasks ---------- */
export async function fetchTasks(userId) {
  const { data, error } = await supabase
    .from('routine_tasks')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('start_time', { ascending: true })
  if (error) throw error
  return data || []
}

export async function addTask(userId, task) {
  const { data, error } = await supabase
    .from('routine_tasks')
    .insert({ ...task, user_id: userId })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateTask(id, patch) {
  const { error } = await supabase.from('routine_tasks').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteTask(id) {
  const { error } = await supabase.from('routine_tasks').delete().eq('id', id)
  if (error) throw error
}

/* ---------- logs (paged, because Supabase returns max 1000 rows) ---------- */
export async function fetchLogs(userId, from, to) {
  const pageSize = 1000
  let start = 0
  let all = []
  for (;;) {
    const { data, error } = await supabase
      .from('routine_logs')
      .select('task_id, log_date, status')
      .eq('user_id', userId)
      .gte('log_date', from)
      .lte('log_date', to)
      .range(start, start + pageSize - 1)
    if (error) throw error
    all = all.concat(data || [])
    if (!data || data.length < pageSize) break
    start += pageSize
  }
  return all
}

export async function setLog(userId, taskId, date, status) {
  if (!status) {
    const { error } = await supabase
      .from('routine_logs')
      .delete()
      .eq('task_id', taskId)
      .eq('log_date', date)
    if (error) throw error
    return
  }
  const { error } = await supabase
    .from('routine_logs')
    .upsert(
      { user_id: userId, task_id: taskId, log_date: date, status },
      { onConflict: 'task_id,log_date' }
    )
  if (error) throw error
}

/* ---------- goals (kind: 'goal' or 'week') ---------- */
export async function fetchGoals(userId) {
  const { data, error } = await supabase
    .from('routine_goals')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data || []
}

export async function addGoal(userId, goal) {
  const { data, error } = await supabase
    .from('routine_goals')
    .insert({ ...goal, user_id: userId })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateGoal(id, patch) {
  const { error } = await supabase.from('routine_goals').update(patch).eq('id', id)
  if (error) throw error
}

export async function deleteGoal(id) {
  const { error } = await supabase.from('routine_goals').delete().eq('id', id)
  if (error) throw error
}

/* ---------- starter routine ---------- */
const ALL = [0, 1, 2, 3, 4, 5, 6]

export async function seedStarter(userId, startDate, weekStartKey) {
  const t = (title, category, s, e, extra = {}) => ({
    user_id: userId, title, category, start_time: s, end_time: e, days: ALL,
    is_habit: false, is_priority: false, start_date: startDate, ...extra,
  })
  const tasks = [
    t('Fajr Prayer', 'prayer', '05:30', '06:00', { is_priority: true }),
    t('Morning Adhkar', 'worship', '06:00', '06:15', { is_habit: true }),
    t('Reading Quran (1 page)', 'worship', '06:15', '06:45', { is_habit: true }),
    t('Gym Workout', 'fitness', '08:00', '09:30'),
    t('Breakfast & Rest', 'personal', '09:45', '10:15'),
    t('Trading Session (London)', 'trading', '10:30', '13:00', { is_priority: true }),
    t('100 Istighfar', 'worship', '13:00', '13:10', { is_habit: true }),
    t('Dhuhr Prayer', 'prayer', '13:30', '14:00'),
    t('Study / Learning (1h)', 'learning', '14:30', '16:30', { is_priority: true }),
    t('Football / Outdoor', 'fitness', '17:00', '18:30'),
    t('Evening Adhkar', 'worship', '18:30', '18:45', { is_habit: true }),
    t('Maghrib + Isha Prayers', 'prayer', '18:45', '19:45'),
    t('100 Tasbih', 'worship', '20:00', '20:10', { is_habit: true }),
    t('100 Alhamdulillah', 'worship', '20:10', '20:20', { is_habit: true }),
    t('100 Allahu Akbar', 'worship', '20:20', '20:30', { is_habit: true }),
    t('100 La ilaha illallah', 'worship', '20:30', '20:40', { is_habit: true }),
  ].map((x, i) => ({ ...x, sort_order: i }))

  const g = (title, subtitle, cur, target, unit, color, i, extra = {}) => ({
    user_id: userId, title, subtitle, kind: 'goal', current_value: cur, target_value: target,
    unit, color, sort_order: i, ...extra,
  })
  const goals = [
    g('Quran Memorization', null, 12, 30, 'pages', '#10b981', 0),
    g('Trading Funded Account', 'Phase 1 (5k)', 60, 100, '%', '#3b82f6', 1),
    g('Build Lean Physique', null, 62, 80, 'kg', '#8b5cf6', 2),
    g('Complete School / Degree', 'Year 2', 46, 100, '%', '#f59e0b', 3),
    g('Pray all 5 prayers in Jamaah', 'Deen', 0, 35, 'prayers', '#10b981', 4, {
      kind: 'week', week_start: weekStartKey,
      plan: 'Set an alarm 10 minutes before each adhan and walk to the masjid.',
    }),
    g('Take 5 quality trades only', 'Trading', 0, 5, 'trades', '#3b82f6', 5, {
      kind: 'week', week_start: weekStartKey,
      plan: 'Only A+ setups from my trading plan. Journal every trade the same day.',
    }),
    g('Gym 4 times', 'Health', 0, 4, 'sessions', '#f59e0b', 6, {
      kind: 'week', week_start: weekStartKey,
      plan: 'Mon, Wed, Fri, Sat at 8:00 AM.',
    }),
  ]

  const r1 = await supabase.from('routine_tasks').insert(tasks)
  if (r1.error) throw r1.error
  const r2 = await supabase.from('routine_goals').insert(goals)
  if (r2.error) throw r2.error
}
export async function addTasksBulk(userId, rows) {
  const { error } = await supabase
    .from('routine_tasks')
    .insert(rows.map((r) => ({ ...r, user_id: userId })))
  if (error) throw error
}
export async function fetchLearningVideos(userId) {
  const { data, error } = await supabase
    .from('learning_videos')
    .select('id, title, duration_seconds, category')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function fetchLearningProgress(userId) {
  const { data, error } = await supabase
    .from('learning_progress')
    .select('video_id, watched_seconds')
    .eq('user_id', userId)
  if (error) throw error
  return data || []
}
// Counts backtest trades logged per day (by created_at, local date)
export async function fetchBacktestShots(userId, sinceKey) {
  const { data, error } = await supabase
    .from('backtest_trades')
    .select('created_at')
    .eq('user_id', userId)
    .gte('created_at', sinceKey)
  if (error) throw error
  const map = {}
  ;(data || []).forEach((r) => {
    const d = new Date(r.created_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    map[key] = (map[key] || 0) + 1
  })
  return map
}