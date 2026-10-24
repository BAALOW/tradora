import { supabase } from '../lib/supabaseClient'

export async function fetchWorshipDays(userId, from, to) {
  const { data, error } = await supabase
    .from('worship_days')
    .select('log_date, counts, times')
    .eq('user_id', userId)
    .gte('log_date', from)
    .lte('log_date', to)
  if (error) throw error
  return data || []
}

export async function saveWorshipDay(userId, date, counts, times) {
  const { error } = await supabase
    .from('worship_days')
    .upsert(
      { user_id: userId, log_date: date, counts, times },
      { onConflict: 'user_id,log_date' }
    )
  if (error) throw error
}