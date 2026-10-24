import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, Brain, CalendarClock, CheckCircle2, Flag, Flame, GraduationCap, Lightbulb,
  Loader2, MessageSquare, Send, ShieldCheck, Sparkles, Target, TrendingDown, TrendingUp, Trophy,
} from 'lucide-react'

import Sidebar from '../components/layout/Sidebar'
import Topbar from '../components/layout/Topbar'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import ProgressBar from '../components/ui/ProgressBar'
import LoadingSkeleton from '../components/ui/LoadingSkeleton'

import { useAuth } from '../contexts/AuthContext'
import { useAccounts } from '../hooks/useAccounts'
import { useTrades } from '../hooks/useTrades'
import { supabase } from '../lib/supabaseClient'
import { fetchBacktestShots, fetchGoals, fetchLogs, fetchTasks } from '../services/routineService'
import { fetchWorshipDays } from '../services/worshipService'

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

const pad = (n) => String(n).padStart(2, '0')
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d) }
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const mondayOf = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -((x.getDay() + 6) % 7)) }
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0)
const pnlOf = (t) => Number(t.net_profit ?? t.profit ?? 0) || 0
const isResolved = (t) => t.result === 'WIN' || t.result === 'LOSS' || t.result === 'BREAK_EVEN'
const timeOf = (t) => { const d = new Date(t.opened_at || t.closed_at || 0); return Number.isNaN(d.getTime()) ? 0 : d.getTime() }
const parseRR = (rr) => parseFloat(String(rr ?? '').split(':')[1]) || 0
const money = (n) => `${Number(n) >= 0 ? '+' : '-'}$${Math.abs(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const tone = (v) => (v > 0 ? 'text-success' : v < 0 ? 'text-danger' : 'text-text-secondary')
const DOWN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const WORSHIP_ITEMS = [
  ['fajr', 1], ['morning_adhkar', 1], ['quran', 1], ['dhuhr', 1], ['istighfar', 100], ['asr', 1],
  ['evening_adhkar', 1], ['maghrib', 1], ['isha', 1], ['tasbih', 100], ['alhamdulillah', 100],
  ['allahu_akbar', 100], ['la_ilaha', 100],
]
const WTARGET = Object.fromEntries(WORSHIP_ITEMS)
const btNeeded = (h) => Math.ceil(Number(h) * 5)

function groupBy(trades, keyFn) {
  const map = new Map()
  trades.filter(isResolved).forEach((t) => {
    const k = keyFn(t)
    if (k == null || k === '') return
    if (!map.has(k)) map.set(k, { key: k, count: 0, wins: 0, losses: 0, pnl: 0 })
    const g = map.get(k)
    g.count++
    if (t.result === 'WIN') g.wins++
    if (t.result === 'LOSS') g.losses++
    g.pnl += pnlOf(t)
  })
  return [...map.values()].map((g) => ({ ...g, winRate: pct(g.wins, g.count) }))
}

/* ------------------------------------------------------------------ */
/* Trading analysis                                                     */
/* ------------------------------------------------------------------ */

function analyzeTrading(all) {
  const trades = all.filter(isResolved).sort((a, b) => timeOf(a) - timeOf(b))
  const n = trades.length
  const wins = trades.filter((t) => t.result === 'WIN').length
  const net = trades.reduce((s, t) => s + pnlOf(t), 0)
  const gp = trades.filter((t) => pnlOf(t) > 0).reduce((s, t) => s + pnlOf(t), 0)
  const gl = Math.abs(trades.filter((t) => pnlOf(t) < 0).reduce((s, t) => s + pnlOf(t), 0))
  const overall = { n, winRate: pct(wins, n), net, pf: gl > 0 ? gp / gl : gp > 0 ? null : null }

  const out = { overall, strengths: [], weaknesses: [], mistakes: [], training: [] }
  if (n < 3) return out

  const setups = groupBy(trades, (t) => t.setup).filter((g) => g.count >= 2)
  const bestSetup = [...setups].sort((a, b) => b.pnl - a.pnl)[0]
  const worstSetup = [...setups].sort((a, b) => a.pnl - b.pnl)[0]
  if (bestSetup && bestSetup.pnl > 0) {
    out.strengths.push({ title: `${bestSetup.key} is your best setup`, text: `${money(bestSetup.pnl)} from ${bestSetup.count} trades, ${bestSetup.winRate}% win rate (overall ${overall.winRate}%).` })
  }
  if (worstSetup && worstSetup.pnl < 0) {
    out.weaknesses.push({ title: `${worstSetup.key} is costing you the most`, text: `${money(worstSetup.pnl)} from ${worstSetup.count} trades, only ${worstSetup.winRate}% win rate. Re-check its entry rules before taking it again.` })
    out.training.push(`Backtest "${worstSetup.key}" for 15 trades and compare it with "${bestSetup?.key || 'your best setup'}" before trading it live.`)
  }
  setups.forEach((g) => {
    if (g !== worstSetup && g.winRate <= overall.winRate - 20 && g.pnl <= 0) {
      out.weaknesses.push({ title: `${g.key} underperforms your average`, text: `${g.winRate}% win rate vs ${overall.winRate}% overall.` })
    }
  })

  const pairs = groupBy(trades, (t) => t.symbol).filter((g) => g.count >= 2)
  const bp = [...pairs].sort((a, b) => b.pnl - a.pnl)[0]
  const wp = [...pairs].sort((a, b) => a.pnl - b.pnl)[0]
  if (bp && bp.pnl > 0) out.strengths.push({ title: `${bp.key} is your strongest pair`, text: `${money(bp.pnl)} across ${bp.count} trades.` })
  if (wp && wp.pnl < 0) {
    out.weaknesses.push({ title: `${wp.key} is your weakest pair`, text: `${money(wp.pnl)} across ${wp.count} trades.` })
    out.training.push(`Review your last ${wp.key} losses and mark what they have in common (session, setup, news).`)
  }

  const sessions = groupBy(trades, (t) => t.session).filter((g) => g.count >= 2)
  const bs = [...sessions].sort((a, b) => b.pnl - a.pnl)[0]
  const ws = [...sessions].sort((a, b) => a.pnl - b.pnl)[0]
  if (bs && bs.pnl > 0) out.strengths.push({ title: `${bs.key} session works for you`, text: `${money(bs.pnl)} with ${bs.winRate}% win rate.` })
  if (ws && ws.pnl < 0) out.weaknesses.push({ title: `${ws.key} session loses money`, text: `${money(ws.pnl)} across ${ws.count} trades. Consider skipping it.` })

  const days = groupBy(trades, (t) => (t.opened_at ? new Date(t.opened_at).getDay() : null)).filter((g) => g.count >= 2)
  const wd = [...days].sort((a, b) => a.pnl - b.pnl)[0]
  if (wd && wd.pnl < 0) out.weaknesses.push({ title: `${DOWN[wd.key]} is your weakest day`, text: `${money(wd.pnl)} across ${wd.count} trades.` })

  /* recurring mistakes */
  const emo = groupBy(trades, (t) => t.emotion).filter((g) => g.count >= 2 && g.pnl < 0).sort((a, b) => a.pnl - b.pnl)[0]
  if (emo) {
    out.mistakes.push({ title: `Trading while "${emo.key}"`, text: `${emo.count} trades, ${money(emo.pnl)}. Step away from the screen in this state.` })
    out.training.push(`Write a 2-line rule: "If I feel ${String(emo.key).toLowerCase()}, I do not enter a trade."`)
  }
  const cb = trades.filter((t) => t.counter_break === 'Not Confirmed')
  if (cb.length >= 2) {
    const cbLoss = cb.filter((t) => t.result === 'LOSS').length
    out.mistakes.push({ title: 'Entering without a confirmed counter break', text: `${cb.length} trades without confirmation, ${cbLoss} were losses (${pct(cbLoss, cb.length)}%).` })
    out.training.push('Do not enter until the counter break is confirmed. Add it as a hard checklist item.')
  }
  const off = trades.filter((t) => t.plan_followed === false)
  if (off.length >= 2) {
    out.mistakes.push({ title: 'Trades outside your plan', text: `${off.length} trades were marked as not following the plan, net ${money(off.reduce((s, t) => s + pnlOf(t), 0))}.` })
  }
  const risks = trades.map((t) => Number(t.risk_percent)).filter((x) => x > 0)
  if (risks.length >= 5) {
    const avg = risks.reduce((a, b) => a + b, 0) / risks.length
    const spikes = trades.filter((t) => Number(t.risk_percent) > avg * 1.5)
    if (spikes.length >= 2) out.mistakes.push({ title: 'Risk size is inconsistent', text: `${spikes.length} trades risked more than 1.5x your average (${avg.toFixed(2)}%).` })
  }
  let cur = 0, maxL = 0
  trades.forEach((t) => { if (t.result === 'LOSS') { cur++; maxL = Math.max(maxL, cur) } else cur = 0 })
  if (maxL >= 3) {
    out.mistakes.push({ title: `Losing streak of ${maxL}`, text: 'After 2 losses in a row, stop and review before the next trade.' })
    out.training.push('Add a rule: after 2 losses, no new trade until you write what went wrong.')
  }
  const texts = {}
  trades.forEach((t) => { const m = String(t.mistake || '').trim().toLowerCase(); if (m) texts[m] = (texts[m] || 0) + 1 })
  Object.entries(texts).filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 2).forEach(([m, c]) => {
    out.mistakes.push({ title: `Repeated note: "${m.slice(0, 60)}"`, text: `You wrote this ${c} times in your journal.` })
  })

  if (out.training.length === 0) out.training.push('Keep logging Emotion, Mistake and Lesson on every trade. More notes make the coach sharper.')
  return out
}

/* ------------------------------------------------------------------ */
/* Discipline analysis                                                  */
/* ------------------------------------------------------------------ */

function analyzeDiscipline({ tasks, logs, worship, shots, progress }, trades, plan) {
  const today = toKey(new Date())
  const prog = Object.fromEntries(progress.map((r) => [r.video_id, Number(r.watched_seconds) || 0]))
  const sched = (t, key) => (t.only_date ? t.only_date === key : (!t.start_date || key >= t.start_date) && t.days.includes(fromKey(key).getDay()))
  const done = (t, key) => {
    if (t.worship_key) {
      const c = worship[key]
      if (!c) return false
      if (t.worship_key === 'all') return WORSHIP_ITEMS.every(([k, target]) => (c[k] || 0) >= target)
      return (c[t.worship_key] || 0) >= (WTARGET[t.worship_key] || 1)
    }
    if (t.video_id) return Math.floor(((prog[t.video_id] || 0) - (t.video_baseline_seconds || 0)) / 60) >= (t.video_minutes || 1)
    if (t.bt_hours) return (shots[key] || 0) >= btNeeded(t.bt_hours)
    return logs[`${t.id}|${key}`] === 'done'
  }

  const dayKeys = Array.from({ length: 14 }, (_, i) => toKey(addDays(new Date(), -(13 - i))))
  const days = dayKeys.map((k) => {
    const list = tasks.filter((t) => sched(t, k))
    const d = list.filter((t) => done(t, k)).length
    return { key: k, total: list.length, done: d, pct: pct(d, list.length), past: k < today }
  })
  const pastDays = days.filter((d) => d.past && d.total > 0)
  const avg = pastDays.length ? Math.round(pastDays.reduce((s, d) => s + d.pct, 0) / pastDays.length) : 0
  const missedDays = pastDays.filter((d) => d.pct < 50)

  const byTask = tasks.map((t) => {
    let s = 0, d = 0
    dayKeys.filter((k) => k < today).forEach((k) => { if (sched(t, k)) { s++; if (done(t, k)) d++ } })
    return { t, s, d, rate: pct(d, s) }
  }).filter((x) => x.s >= 3).sort((a, b) => a.rate - b.rate)

  const dow = Array.from({ length: 7 }, () => ({ s: 0, p: 0 }))
  pastDays.forEach((d) => { const w = fromKey(d.key).getDay(); dow[w].s++; dow[w].p += d.pct })
  const weak = dow.map((x, i) => ({ day: i, avg: x.s ? Math.round(x.p / x.s) : null, n: x.s })).filter((x) => x.avg != null && x.n >= 2).sort((a, b) => a.avg - b.avg)[0]

  let streak = 0
  for (let i = pastDays.length - 1; i >= 0 && pastDays[i].pct >= 80; i--) streak++

  const wkStart = toKey(mondayOf(new Date()))
  const weekShots = Array.from({ length: 7 }, (_, i) => shots[toKey(addDays(fromKey(wkStart), i))] || 0).reduce((a, b) => a + b, 0)

  const recent = trades.filter((t) => isResolved(t) && timeOf(t) >= addDays(new Date(), -30).getTime())
  const flagged = recent.filter((t) => t.plan_followed != null)
  const followed = flagged.filter((t) => t.plan_followed === true).length
  const cbSet = recent.filter((t) => t.counter_break)
  const cbOk = cbSet.filter((t) => t.counter_break === 'Confirmed').length
  const compliance = {
    planFollowed: flagged.length ? pct(followed, flagged.length) : null,
    checklist: cbSet.length ? pct(cbOk, cbSet.length) : null,
    trades: recent.length,
  }

  const findings = []
  if (!tasks.length) findings.push({ tone: 'warning', title: 'No routine yet', text: 'Add tasks in Daily Routine so the coach can track your consistency.' })
  else {
    if (avg >= 80) findings.push({ tone: 'success', title: 'Strong consistency', text: `You completed ${avg}% of your tasks on average over the last 14 days.` })
    else if (avg >= 50) findings.push({ tone: 'warning', title: 'Consistency is average', text: `${avg}% completion over 14 days. Aim for 80% by removing 1 or 2 tasks you never finish.` })
    else findings.push({ tone: 'danger', title: 'Consistency is low', text: `${avg}% completion over 14 days. Cut your routine to the 3 most important tasks and rebuild.` })
    if (missedDays.length >= 2) findings.push({ tone: 'danger', title: `${missedDays.length} days with less than 50% done`, text: missedDays.slice(-4).map((d) => `${fromKey(d.key).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} (${d.pct}%)`).join(', ') })
    if (weak && weak.avg < 70) findings.push({ tone: 'warning', title: `${DOWN[weak.day]} is your weakest day`, text: `Average ${weak.avg}% completion. Plan a lighter schedule for ${DOWN[weak.day]}.` })
    byTask.slice(0, 3).filter((x) => x.rate < 60).forEach((x) => findings.push({ tone: 'warning', title: `You often skip "${x.t.title}"`, text: `Done ${x.d} of ${x.s} times (${x.rate}%). Move it to a time when you are free, or make it shorter.` }))
  }
  if (compliance.planFollowed != null) {
    findings.push(compliance.planFollowed >= 80
      ? { tone: 'success', title: 'You follow your trading plan', text: `${compliance.planFollowed}% of your last 30-day trades followed the plan.` }
      : { tone: 'danger', title: 'Plan compliance needs work', text: `Only ${compliance.planFollowed}% of trades followed the plan in the last 30 days.` })
  }
  if (compliance.checklist != null && compliance.checklist < 80) {
    findings.push({ tone: 'warning', title: 'Checklist is not always confirmed', text: `Counter break was confirmed on ${compliance.checklist}% of trades. Your plan has ${plan?.strategies?.length || 0} strategies; use them as a checklist.` })
  }

  const suggestions = []
  const btGoal = tasks.find((t) => t.bt_hours)
  if (btGoal) {
    const need = btNeeded(btGoal.bt_hours) * 5
    if (weekShots < need) suggestions.push(`This week you logged ${weekShots} backtest trades, target about ${need}. Block 45 minutes tomorrow for backtesting.`)
  }
  if (byTask[0] && byTask[0].rate < 60) suggestions.push(`Give "${byTask[0].t.title}" a fixed 30-minute slot right after a task you never miss.`)
  if (weak && weak.avg < 70) suggestions.push(`Keep ${DOWN[weak.day]} light: only 3 must-do tasks.`)
  if (!suggestions.length) suggestions.push('Your schedule is working. Keep the same times for the next 7 days.')

  return { days, avg, streak, missedDays, byTask, weekShots, compliance, findings, suggestions, tasksCount: tasks.length }
}

/* ------------------------------------------------------------------ */
/* Goals analysis                                                       */
/* ------------------------------------------------------------------ */

function analyzeGoals(goals, extras, horizonWeeks) {
  const wkStart = toKey(mondayOf(new Date()))
  const daysLeft = 7 - ((new Date().getDay() + 6) % 7)
  const prog = Object.fromEntries(extras.progress.map((r) => [r.video_id, Number(r.watched_seconds) || 0]))
  const cur = (g) => {
    if (g.link_type === 'backtest' && g.week_start) {
      return Array.from({ length: 7 }, (_, i) => extras.shots[toKey(addDays(fromKey(g.week_start), i))] || 0).reduce((a, b) => a + b, 0)
    }
    if (g.link_type === 'learning' && g.link_video_id) return Math.max(0, Math.floor(((prog[g.link_video_id] || 0) - (g.link_baseline_seconds || 0)) / 60))
    return Number(g.current_value) || 0
  }
  const view = (g) => {
    const c = cur(g), t = Number(g.target_value) || 1
    return { ...g, cur: c, tgt: t, p: Math.min(100, pct(c, t)), left: Math.max(0, t - c) }
  }
  const week = goals.filter((g) => g.kind === 'week' && g.week_start === wkStart).map(view)
  const lastWeek = goals.filter((g) => g.kind === 'week' && g.week_start === toKey(addDays(fromKey(wkStart), -7))).map(view)
  const big = goals.filter((g) => g.kind === 'goal').map(view).map((g) => ({
    ...g,
    perWeek: Math.ceil(g.left / horizonWeeks),
    perDay: Math.ceil(g.left / (horizonWeeks * 7)),
  }))
  return {
    week, lastWeek, big, daysLeft,
    achieved: week.filter((g) => g.p >= 100),
    remaining: week.filter((g) => g.p < 100),
  }
}

/* ------------------------------------------------------------------ */
/* Next week plan                                                       */
/* ------------------------------------------------------------------ */

function buildNextWeek(trading, discipline, goalsA, horizon) {
  const plan = []
  const best = trading.strengths.find((s) => s.title.includes('best setup'))
  const worst = trading.weaknesses.find((s) => s.title.includes('costing'))
  if (best) plan.push({ icon: Target, title: 'Trade your edge', text: `Focus on ${best.title.replace(' is your best setup', '')}. ${worst ? `Pause ${worst.title.replace(' is costing you the most', '')} until it is backtested again.` : ''}` })
  const dayWeak = trading.weaknesses.find((s) => s.title.includes('weakest day'))
  if (dayWeak) plan.push({ icon: CalendarClock, title: 'Protect your weak day', text: `${dayWeak.title}. Skip it or trade half size.` })
  discipline.suggestions.slice(0, 2).forEach((s) => plan.push({ icon: ShieldCheck, title: 'Discipline', text: s }))
  goalsA.remaining.slice(0, 3).forEach((g) => plan.push({ icon: Flag, title: `Carry over: ${g.title}`, text: `${g.left} ${g.unit || ''} left. About ${Math.ceil(g.left / 5)} per day if you work 5 days.` }))
  goalsA.big.slice(0, 2).forEach((g) => plan.push({ icon: Flag, title: `Big goal: ${g.title}`, text: `${g.perWeek} ${g.unit || ''} this week keeps you on a ${horizon}-week pace.` }))
  if (!plan.length) plan.push({ icon: Lightbulb, title: 'Build your data', text: 'Log trades, routine and goals for a few days. Then the coach can build a real plan.' })
  return plan
}

/* ------------------------------------------------------------------ */
/* Local answers (fallback when the AI function is not reachable)      */
/* ------------------------------------------------------------------ */

function localAnswer(q, t, d, g, plan) {
  const s = q.toLowerCase()
  const bullets = (arr) => arr.map((x) => `• ${x.title}: ${x.text}`).join('\n')
  if (/(khasaar|loss|lost|why)/.test(s)) {
    const items = [...t.weaknesses, ...t.mistakes].slice(0, 5)
    return items.length ? `Main reasons for your losses:\n${bullets(items)}` : 'I need at least 3 closed trades to explain your losses.'
  }
  if (/(discipline|routine|consisten)/.test(s)) {
    return `Average routine completion is ${d.avg}% over 14 days.\n${bullets(d.findings.slice(0, 4))}\n\nNext step: ${d.suggestions[0]}`
  }
  if (/(plan|qorsh|week|toddob)/.test(s)) return `Plan for next week:\n${plan.map((p) => `• ${p.title}: ${p.text}`).join('\n')}`
  if (/(goal|yool)/.test(s)) {
    return g.week.length ? `This week: ${g.achieved.length}/${g.week.length} goals complete.\n${g.remaining.map((x) => `• ${x.title}: ${x.cur}/${x.tgt}`).join('\n')}` : 'You have no weekly goals yet. Add them in Daily Routine.'
  }
  if (/(best|strong|working|shaq)/.test(s)) return t.strengths.length ? bullets(t.strengths) : 'Not enough closed trades yet.'
  return 'The AI model is not connected right now, so I can only answer from built-in analysis. Meanwhile ask about losses, discipline, goals, or next week plan.'
}

/* ------------------------------------------------------------------ */
/* UI pieces                                                            */
/* ------------------------------------------------------------------ */

const tonePanel = {
  success: 'border-green-100 bg-green-50/60 text-success',
  danger: 'border-red-100 bg-red-50/60 text-danger',
  warning: 'border-amber-100 bg-amber-50/60 text-warning',
}

function Head({ icon: Icon, iconBg = 'bg-blue-50 text-brand', title, sub, right }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconBg}`}><Icon className="h-4 w-4" /></div>
        <div>
          <h3 className="text-[16px] font-semibold text-text-primary">{title}</h3>
          {sub && <p className="text-xs text-text-muted">{sub}</p>}
        </div>
      </div>
      {right}
    </div>
  )
}

function Stat({ icon: Icon, iconBg, label, value, valueTone = 'text-text-primary', hint }) {
  return (
    <Card padded className="flex flex-col gap-2 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-popover">
      <div className="flex items-center gap-2">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBg}`}><Icon className="h-4 w-4" /></div>
        <span className="text-xs font-medium text-text-secondary">{label}</span>
      </div>
      <p className={`tabular-nums text-xl font-bold tracking-tight ${valueTone}`}>{value}</p>
      <span className="text-[11px] text-text-muted">{hint || ' '}</span>
    </Card>
  )
}

function Findings({ items, kind, empty }) {
  if (!items.length) return <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-text-muted">{empty}</p>
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((i, idx) => {
        const k = i.tone || kind
        return (
          <div key={`${i.title}-${idx}`} className={`flex items-start gap-2.5 rounded-xl border p-3.5 ${tonePanel[k]}`}>
            {k === 'success' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
            <div>
              <p className="text-sm font-semibold">{i.title}</p>
              <p className="mt-0.5 text-xs text-text-secondary">{i.text}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Tabs({ value, onChange, items }) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-2xl border border-border bg-white p-1.5">
      {items.map(([k, label, Icon]) => (
        <button
          key={k} type="button" onClick={() => onChange(k)}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${value === k ? 'bg-brand text-white shadow-sm' : 'text-text-secondary hover:bg-surface'}`}
        ><Icon className="h-4 w-4" />{label}</button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

const SUGGESTIONS = [
  'Maxaa sababay khasaaraha bishan?',
  'Sidee ayaan discipline-kayga u hagaajin karaa?',
  'Ii samee qorshaha toddobaadka soo socda.',
  'Isbarbar dhig 30-kii trade ee iigu dambeeyay.',
]

export default function AiCoach() {
  const { user } = useAuth()
  const { accounts = [] } = useAccounts()
  const { trades = [], loading } = useTrades()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [tab, setTab] = useState('trading')
  const [horizon, setHorizon] = useState(4)
  const [extras, setExtras] = useState(null)
  const [goals, setGoals] = useState([])
  const [plan, setPlan] = useState(null)

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [aiOnline, setAiOnline] = useState(null) // null = not tested yet
  const [aiError, setAiError] = useState('')
  const bottomRef = useRef(null)

  const load = useCallback(async () => {
    if (!user) return
    const today = new Date()
    const from = toKey(addDays(today, -29))
    const to = toKey(today)
    const [t, l, w, s, p, g, tp] = await Promise.allSettled([
      fetchTasks(user.id),
      fetchLogs(user.id, from, to),
      fetchWorshipDays(user.id, from, to),
      fetchBacktestShots(user.id, from),
      supabase.from('learning_progress').select('video_id, watched_seconds').eq('user_id', user.id),
      fetchGoals(user.id),
      supabase.from('trading_plans').select('*').eq('user_id', user.id).maybeSingle(),
    ])
    const ok = (r, d) => (r.status === 'fulfilled' ? r.value : d)
    const logs = {}
    ok(l, []).forEach((r) => { logs[`${r.task_id}|${r.log_date}`] = r.status })
    const worship = {}
    ok(w, []).forEach((r) => { worship[r.log_date] = r.counts || {} })
    setExtras({
      tasks: ok(t, []).map((x) => ({ ...x, days: x.days || [], bt_hours: x.bt_hours ? Number(x.bt_hours) : null })),
      logs, worship, shots: ok(s, {}),
      progress: ok(p, { data: [] }).data || [],
    })
    setGoals(ok(g, []))
    const planRow = ok(tp, { data: null }).data
    setPlan(planRow?.plan || planRow || null)
  }, [user])

  useEffect(() => {
    load()
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  const last90 = useMemo(() => trades.filter((t) => timeOf(t) >= addDays(new Date(), -90).getTime()), [trades])
  const trading = useMemo(() => analyzeTrading(last90), [last90])
  const discipline = useMemo(
    () => (extras ? analyzeDiscipline(extras, trades, plan) : null),
    [extras, trades, plan]
  )
  const goalsA = useMemo(
    () => (extras ? analyzeGoals(goals, extras, horizon) : null),
    [goals, extras, horizon]
  )
  const nextWeek = useMemo(
    () => (discipline && goalsA ? buildNextWeek(trading, discipline, goalsA, horizon) : []),
    [trading, discipline, goalsA, horizon]
  )

  /* compact snapshot sent to the AI */
  const snapshot = useMemo(() => {
    const resolved = trades.filter(isResolved).sort((a, b) => timeOf(b) - timeOf(a))
    return {
      today: toKey(new Date()),
      trading: {
        overall: trading.overall,
        strengths: trading.strengths, weaknesses: trading.weaknesses, mistakes: trading.mistakes,
        bySetup: groupBy(resolved, (t) => t.setup), byPair: groupBy(resolved, (t) => t.symbol),
        bySession: groupBy(resolved, (t) => t.session),
        byWeekday: groupBy(resolved, (t) => (t.opened_at ? DOWN[new Date(t.opened_at).getDay()] : null)),
        byEmotion: groupBy(resolved, (t) => t.emotion),
        last30Trades: resolved.slice(0, 30).map((t) => ({
          date: t.opened_at ? t.opened_at.slice(0, 10) : null, pair: t.symbol, dir: t.direction, setup: t.setup,
          session: t.session, rr: t.rr, pnl: pnlOf(t), result: t.result, outcome: t.outcome, emotion: t.emotion,
          counterBreak: t.counter_break, planFollowed: t.plan_followed, mistake: t.mistake,
        })),
      },
      discipline: discipline && {
        avg14d: discipline.avg, streak: discipline.streak, compliance: discipline.compliance,
        findings: discipline.findings, suggestions: discipline.suggestions,
        weakestTasks: discipline.byTask.slice(0, 4).map((x) => ({ task: x.t.title, rate: x.rate })),
        last14: discipline.days.map((d) => ({ date: d.key, pct: d.pct })),
      },
      goals: goalsA && {
        thisWeek: goalsA.week.map((g) => ({ title: g.title, cur: g.cur, target: g.tgt, unit: g.unit })),
        longTerm: goalsA.big.map((g) => ({ title: g.title, cur: g.cur, target: g.tgt, unit: g.unit })),
      },
      accounts: accounts.map((a) => ({ name: a.name, start: a.starting_balance, balance: a.current_balance })),
    }
  }, [trades, trading, discipline, goalsA, accounts])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, sending])

  const send = async (text) => {
    const q = (text ?? input).trim()
    if (!q || sending) return
    const next = [...messages, { role: 'user', content: q }]
    setMessages(next)
    setInput('')
    setSending(true)
    try {
      // History for the AI: skip built-in (local) answers, last 12, must start with a user message
      let history = next.filter((m) => !m.local).slice(-12).map(({ role, content }) => ({ role, content }))
      while (history.length && history[0].role !== 'user') history.shift()

      const { data, error } = await supabase.functions.invoke('ai-coach', {
        body: { messages: history, context: snapshot },
      })

      if (error || !data?.reply) {
        let detail = data?.error || error?.message || 'No reply'
        if (error?.context?.json) {
          try { const b = await error.context.json(); if (b?.error) detail = b.error } catch { /* ignore */ }
        }
        throw new Error(detail)
      }
      setAiOnline(true)
      setAiError('')
      setMessages([...next, { role: 'assistant', content: data.reply }])
    } catch (e) {
      setAiOnline(false)
      setAiError(String(e?.message || e))
      const local = discipline && goalsA ? localAnswer(q, trading, discipline, goalsA, nextWeek) : 'Data is still loading, try again in a moment.'
      setMessages([...next, { role: 'assistant', content: local, local: true }])
    } finally {
      setSending(false)
    }
  }

  const ov = trading.overall
  const ready = !loading && extras && discipline && goalsA

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onMenuClick={() => setSidebarOpen(true)}
          accounts={accounts.map((a) => ({ id: a.id, label: a.name, status: a.mt5_connected ? 'connected' : 'disconnected' }))}
          selectedAccount={accounts[0] ? { label: accounts[0].name } : { label: 'No Account' }}
          onSelectAccount={() => {}}
          breadcrumb="AI / AI Coach"
        />

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-ai"><Sparkles className="h-5 w-5" /></div>
              <div>
                <h1 className="text-[28px] font-bold tracking-tight text-text-primary sm:text-[32px]">AI Coach</h1>
                <p className="mt-1 text-sm text-text-secondary">Your trading, discipline and goals, analysed from your own data.</p>
              </div>
            </div>
            <Tabs value={tab} onChange={setTab} items={[
              ['trading', 'Trading', TrendingUp], ['discipline', 'Discipline', ShieldCheck],
              ['goals', 'Goals', Flag], ['chat', 'AI Chat', MessageSquare],
            ]} />
          </div>

          {!ready && tab !== 'chat' && (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => <Card key={i} padded><LoadingSkeleton className="h-3 w-16" /><LoadingSkeleton className="mt-3 h-6 w-16" /></Card>)}
            </div>
          )}

          {/* ---------------- TRADING COACH ---------------- */}
          {ready && tab === 'trading' && (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Stat icon={TrendingUp} iconBg={ov.net >= 0 ? 'bg-green-50 text-success' : 'bg-red-50 text-danger'} label="Net P&L (90d)" value={money(ov.net)} valueTone={tone(ov.net)} hint={`${ov.n} closed trades`} />
                <Stat icon={Target} iconBg="bg-blue-50 text-brand" label="Win Rate" value={`${ov.winRate}%`} hint="Last 90 days" />
                <Stat icon={Trophy} iconBg="bg-green-50 text-success" label="Strengths found" value={trading.strengths.length} />
                <Stat icon={AlertTriangle} iconBg="bg-red-50 text-danger" label="Issues found" value={trading.weaknesses.length + trading.mistakes.length} />
              </div>

              {ov.n < 3 ? (
                <Card><p className="py-10 text-center text-sm text-text-muted">Log at least 3 closed trades in the Journal and the Trading Coach will start analysing them.</p></Card>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <Card>
                      <Head icon={Trophy} iconBg="bg-green-50 text-success" title="What works for you" sub="Setups, pairs and sessions to keep" />
                      <Findings items={trading.strengths} kind="success" empty="No clear strength yet. Keep logging trades." />
                    </Card>
                    <Card>
                      <Head icon={TrendingDown} iconBg="bg-red-50 text-danger" title="What loses money" sub="Where your results are weakest" />
                      <Findings items={trading.weaknesses} kind="danger" empty="No clear weakness found. Good." />
                    </Card>
                  </div>
                  <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                    <Card>
                      <Head icon={AlertTriangle} iconBg="bg-amber-50 text-warning" title="Recurring mistakes" sub="Patterns that repeat in your trades" />
                      <Findings items={trading.mistakes} kind="warning" empty="No repeating mistake detected." />
                    </Card>
                    <Card>
                      <Head icon={GraduationCap} iconBg="bg-violet-50 text-ai" title="What to train next" sub="Practice that fixes the issues above" />
                      <div className="flex flex-col gap-2.5">
                        {trading.training.map((x, i) => (
                          <div key={i} className="flex items-start gap-3 rounded-xl border border-border p-3.5">
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">{i + 1}</span>
                            <p className="text-sm text-text-primary">{x}</p>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ---------------- DISCIPLINE COACH ---------------- */}
          {ready && tab === 'discipline' && (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Stat icon={ShieldCheck} iconBg="bg-green-50 text-success" label="Routine (14d avg)" value={`${discipline.avg}%`} hint={`${discipline.tasksCount} tasks`} />
                <Stat icon={Flame} iconBg="bg-amber-50 text-warning" label="Good-day streak" value={discipline.streak} hint="Days with 80%+ done" />
                <Stat icon={CheckCircle2} iconBg="bg-blue-50 text-brand" label="Plan followed" value={discipline.compliance.planFollowed == null ? '—' : `${discipline.compliance.planFollowed}%`} hint="Trades, last 30 days" />
                <Stat icon={AlertTriangle} iconBg="bg-red-50 text-danger" label="Weak days" value={discipline.missedDays.length} hint="Below 50% in 14 days" />
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <Card className="xl:col-span-2">
                  <Head icon={CalendarClock} title="Last 14 days" sub="Daily routine completion" />
                  <div className="flex h-36 items-end gap-1.5">
                    {discipline.days.map((d) => (
                      <div key={d.key} className="flex flex-1 flex-col items-center gap-1" title={`${d.key}: ${d.pct}%`}>
                        <div className="flex h-28 w-full items-end rounded-md bg-surface">
                          <div className={`w-full rounded-md ${d.total === 0 ? 'bg-border' : d.pct >= 80 ? 'bg-success' : d.pct >= 50 ? 'bg-warning' : 'bg-danger'}`} style={{ height: `${Math.max(d.total ? d.pct : 6, 6)}%` }} />
                        </div>
                        <span className="text-[10px] text-text-muted">{fromKey(d.key).getDate()}</span>
                      </div>
                    ))}
                  </div>
                </Card>
                <Card>
                  <Head icon={Lightbulb} iconBg="bg-amber-50 text-warning" title="Suggested schedule" sub="Small changes that fit your week" />
                  <div className="flex flex-col gap-2.5">
                    {discipline.suggestions.map((s, i) => (
                      <div key={i} className="rounded-xl border border-amber-100 bg-amber-50/50 p-3 text-sm text-text-primary">{s}</div>
                    ))}
                  </div>
                </Card>
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <Card>
                  <Head icon={ShieldCheck} title="Coach review" sub="Plan, routine and consistency" />
                  <Findings items={discipline.findings} kind="warning" empty="Not enough data yet." />
                </Card>
                <Card>
                  <Head icon={AlertTriangle} iconBg="bg-red-50 text-danger" title="Tasks you skip most" sub="Lowest completion in 14 days" />
                  {discipline.byTask.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-text-muted">Need at least 3 days of data per task.</p>
                  ) : (
                    <div className="flex flex-col gap-3.5">
                      {discipline.byTask.slice(0, 6).map((x) => (
                        <div key={x.t.id}>
                          <div className="mb-1.5 flex items-center justify-between text-sm">
                            <span className="font-medium text-text-primary">{x.t.title}</span>
                            <span className="tabular-nums text-xs text-text-secondary">{x.d}/{x.s} · {x.rate}%</span>
                          </div>
                          <ProgressBar value={x.rate} tone={x.rate >= 80 ? 'success' : x.rate >= 50 ? 'warning' : 'danger'} />
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>
            </div>
          )}

          {/* ---------------- GOALS COACH ---------------- */}
          {ready && tab === 'goals' && (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Stat icon={Flag} iconBg="bg-blue-50 text-brand" label="Weekly goals" value={goalsA.week.length} hint="This week" />
                <Stat icon={CheckCircle2} iconBg="bg-green-50 text-success" label="Achieved" value={goalsA.achieved.length} />
                <Stat icon={Target} iconBg="bg-amber-50 text-warning" label="Remaining" value={goalsA.remaining.length} hint={`${goalsA.daysLeft} days left this week`} />
                <Stat icon={Trophy} iconBg="bg-violet-50 text-ai" label="Long-term goals" value={goalsA.big.length} />
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <Card>
                  <Head icon={CheckCircle2} iconBg="bg-green-50 text-success" title="This week: done vs left" sub="From your Weekly Goals" />
                  {goalsA.week.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-text-muted">No weekly goals. Add them in Daily Routine.</p>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {goalsA.week.map((g) => (
                        <div key={g.id}>
                          <div className="mb-1.5 flex items-center justify-between text-sm">
                            <span className="font-semibold text-text-primary">{g.title}</span>
                            <Badge tone={g.p >= 100 ? 'success' : g.p >= 50 ? 'warning' : 'danger'}>{g.p}%</Badge>
                          </div>
                          <ProgressBar value={g.p} tone={g.p >= 100 ? 'success' : g.p >= 50 ? 'warning' : 'danger'} />
                          <p className="mt-1 text-xs text-text-muted">
                            {g.cur}/{g.tgt} {g.unit} done
                            {g.left > 0 ? `, ${g.left} left. ${goalsA.daysLeft} days to go, about ${Math.ceil(g.left / goalsA.daysLeft)} per day.` : '. Completed.'}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>

                <Card>
                  <Head icon={Trophy} iconBg="bg-violet-50 text-ai" title="Big goals into small tasks"
                    sub="Pick how many weeks you want to finish in"
                    right={
                      <select value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} className="h-9 rounded-lg border border-border bg-white px-2 text-xs font-medium text-text-primary focus:border-brand focus:outline-none">
                        {[2, 4, 8, 12, 24].map((w) => <option key={w} value={w}>{w} weeks</option>)}
                      </select>
                    } />
                  {goalsA.big.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-text-muted">No long-term goals. Add them in Goals Progress.</p>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {goalsA.big.map((g) => (
                        <div key={g.id} className="rounded-xl border border-border p-3.5">
                          <div className="mb-1.5 flex items-center justify-between text-sm">
                            <span className="font-semibold text-text-primary">{g.title}</span>
                            <span className="tabular-nums text-xs text-text-secondary">{g.cur}/{g.tgt} {g.unit} · {g.p}%</span>
                          </div>
                          <ProgressBar value={g.p} tone="brand" />
                          {g.left > 0 ? (
                            <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
                              {[['Left', g.left], ['Per week', g.perWeek], ['Per day', g.perDay]].map(([l, v]) => (
                                <div key={l} className="rounded-lg bg-surface py-2">
                                  <p className="text-[10px] text-text-muted">{l}</p>
                                  <p className="tabular-nums text-sm font-bold text-text-primary">{v} <span className="text-[10px] font-normal text-text-muted">{g.unit}</span></p>
                                </div>
                              ))}
                            </div>
                          ) : <p className="mt-2 text-xs font-medium text-success">Goal reached.</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </div>

              <Card>
                <Head icon={CalendarClock} iconBg="bg-blue-50 text-brand" title="Plan for next week" sub="Built from your trades, routine and goals" />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {nextWeek.map((p, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-xl border border-border p-3.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-brand"><p.icon className="h-4 w-4" /></div>
                      <div>
                        <p className="text-sm font-semibold text-text-primary">{p.title}</p>
                        <p className="mt-0.5 text-xs text-text-secondary">{p.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* ---------------- AI CHAT ---------------- */}
          {tab === 'chat' && (
            <Card padded={false} className="flex h-[calc(100vh-240px)] min-h-[520px] flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-ai"><Brain className="h-4 w-4" /></div>
                  <div>
                    <p className="text-sm font-semibold text-text-primary">Ask about your data</p>
                    <p className="text-xs text-text-muted">Trades, routine, worship, goals and backtesting</p>
                  </div>
                </div>
                <Badge tone={aiOnline === false ? 'warning' : 'success'}>
                  {aiOnline === null ? 'AI ready' : aiOnline ? 'AI connected' : 'Built-in answers'}
                </Badge>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                {messages.length === 0 ? (
                  <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-8 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-ai"><Sparkles className="h-6 w-6" /></div>
                    <p className="text-base font-semibold text-text-primary">What do you want to know?</p>
                    <div className="grid w-full gap-2 sm:grid-cols-2">
                      {SUGGESTIONS.map((s) => (
                        <button key={s} onClick={() => send(s)} className="rounded-xl border border-border bg-white p-3 text-left text-sm text-text-secondary transition-colors hover:border-brand hover:text-brand">{s}</button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    {messages.map((m, i) => (
                      <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${m.role === 'user' ? 'bg-brand text-white' : 'border border-border bg-surface text-text-primary'}`}>
                          {m.content}
                        </div>
                      </div>
                    ))}
                    {sending && (
                      <div className="flex justify-start">
                        <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Thinking...</div>
                      </div>
                    )}
                    <div ref={bottomRef} />
                  </div>
                )}
              </div>

              {aiOnline === false && (
                <p className="border-t border-amber-100 bg-amber-50/60 px-5 py-2 text-xs text-warning">
                  The AI function is not reachable. Make sure "ai-coach" is deployed and GEMINI_API_KEY is set.
                  {aiError ? ` Error: ${aiError}` : ''}
                </p>
              )}

              <form onSubmit={(e) => { e.preventDefault(); send() }} className="flex items-center gap-2 border-t border-border p-3.5">
                <input
                  value={input} onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask anything about your trading, discipline or goals..."
                  className="h-11 flex-1 rounded-xl border border-border bg-white px-4 text-[15px] text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
                />
                <button type="submit" disabled={!input.trim() || sending} className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-white transition-colors hover:bg-blue-700 disabled:opacity-40" aria-label="Send">
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </Card>
          )}
        </main>
      </div>
    </div>
  )
}