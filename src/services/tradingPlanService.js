// Trading Plan storage. The whole plan is one JSON document per user
// (see supabase-migration-10-trading-plan.sql); RLS guarantees a user can
// only ever read or write their own row.

import { supabase } from '../lib/supabaseClient'

const uid = () => Math.random().toString(36).slice(2, 10)

// Starter plan shown the first time a trader opens the page. Everything
// in it can be edited or deleted.
export const DEFAULT_PLAN = {
  quote: 'Plan your trade, trade your plan.',
  footer: 'The plan is simple. Execute it.',
  strategies: [
    {
      id: uid(),
      name: 'A+ Setup',
      description: 'High probability setup with all 4 rules.',
      note: 'This setup gives the highest accuracy and is your primary trade type.',
      rules: [
        { id: uid(), title: 'Real Trend (15M)', description: 'Trade with the main trend (up or down).' },
        { id: uid(), title: 'Zone (Supply & Demand)', description: 'Look for key supply or demand zones.' },
        { id: uid(), title: 'Liquidity & Manipulation', description: 'Identify liquidity grabs and manipulation.' },
        { id: uid(), title: 'Counter Break', description: 'Wait for the counter break confirmation.' },
      ],
    },
    {
      id: uid(),
      name: 'Momentum Trade',
      description: 'Quick moves with strong momentum.',
      note: 'This setup works when there is momentum, even without a clear trend.',
      rules: [
        { id: uid(), title: 'Momentum Move (15M)', description: 'Look for strong momentum (2 × 15M move).' },
        { id: uid(), title: 'Zone (Supply & Demand)', description: 'Look for key supply or demand zones.' },
        { id: uid(), title: 'Liquidity & Manipulation', description: 'Identify liquidity grabs and manipulation.' },
        { id: uid(), title: 'Counter Break', description: 'Wait for the counter break confirmation.' },
      ],
    },
  ],
  risk: {
    profiles: [
      {
        id: uid(),
        name: 'Evaluation',
        subtitle: '5K Account',
        badge: 'Phase 1',
        rows: [
          { id: uid(), label: 'Risk per Trade', value: '2%', helper: '', tone: 'danger' },
          { id: uid(), label: 'Target', value: '2R', helper: '', tone: 'neutral' },
          { id: uid(), label: 'Drop to', value: '1%', helper: 'After reaching target (reduce risk).', tone: 'brand' },
        ],
      },
      {
        id: uid(),
        name: 'Funded Account',
        subtitle: '',
        badge: 'Live',
        rows: [
          { id: uid(), label: 'Risk per Trade', value: '1%', helper: '', tone: 'success' },
          { id: uid(), label: 'Target', value: '2R', helper: '', tone: 'neutral' },
          { id: uid(), label: 'Drop to', value: '1%', helper: 'Every trade (keep it consistent).', tone: 'brand' },
        ],
      },
    ],
    tip: { title: 'Risk less. Let your edge work.', text: 'Consistency beats high risk.' },
  },
  conditions: {
    pairs: [
      { id: uid(), symbol: 'GBPUSD', priority: 'Primary' },
      { id: uid(), symbol: 'EURUSD', priority: 'Primary' },
      { id: uid(), symbol: 'USDCHF', priority: 'Rarely' },
    ],
    sessions: [
      { id: uid(), name: 'London Session', time: '08:00 – 11:00 (GMT)' },
      { id: uid(), name: 'New York Session', time: '13:30 – 16:00 (GMT)' },
    ],
    note: 'Trade during London & New York sessions only. Avoid other times.',
  },
  noTrade: [
    { id: uid(), title: 'High Impact News', description: 'Avoid trading during high impact news (FOMC, NFP, CPI, etc.).' },
    { id: uid(), title: 'Rule Conflicts', description: 'Do not trade when your rules are not aligned or unclear.' },
    { id: uid(), title: 'London & New York Sessions Only', description: 'Only trade during London & NY sessions.' },
    { id: uid(), title: 'Overtrading / Revenge Trading / High Risk', description: 'No overtrading, no revenge trading, no high risk trades.' },
  ],
}

// Guards against a partially-filled document so the page never crashes.
export function normalizePlan(content) {
  const c = content || {}
  return {
    quote: c.quote ?? DEFAULT_PLAN.quote,
    footer: c.footer ?? DEFAULT_PLAN.footer,
    strategies: Array.isArray(c.strategies) ? c.strategies : [],
    risk: {
      profiles: Array.isArray(c.risk?.profiles) ? c.risk.profiles : [],
      tip: c.risk?.tip ?? { title: '', text: '' },
    },
    conditions: {
      pairs: Array.isArray(c.conditions?.pairs) ? c.conditions.pairs : [],
      sessions: Array.isArray(c.conditions?.sessions) ? c.conditions.sessions : [],
      note: c.conditions?.note ?? '',
    },
    noTrade: Array.isArray(c.noTrade) ? c.noTrade : [],
  }
}

export async function getTradingPlan() {
  const { data, error } = await supabase.from('trading_plans').select('content, updated_at').maybeSingle()
  if (error) throw error
  return data
}

export async function saveTradingPlan(content) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('You must be signed in to save your trading plan.')

  const { data, error } = await supabase
    .from('trading_plans')
    .upsert({ user_id: user.id, content }, { onConflict: 'user_id' })
    .select('updated_at')
    .single()

  if (error) throw error
  return data
}