const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Models are tried in order. If one is busy or removed by Google, the next is used.
const MODELS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite', 'gemini-3.8-flash']

const TRADORA_KNOWLEDGE = `
ABOUT TRADORA
TRADORA is a trading performance and discipline platform ("Trade with Structure"). It helps a trader journal trades, backtest, follow a trading plan, learn, keep a daily routine, track worship (ibaadah) and goals, and get coaching from their own data.

PAGES AND WHAT THEY DO
- Dashboard: overview of the selected trading account and recent performance.
- Accounts: add and manage trading accounts (name, starting balance, current balance). An account can show as connected or disconnected (MT5). Opening an account shows its detail page.
- Journal: where the user logs trades. Fields include symbol (pair), direction, setup, session, RR (risk:reward), risk percent, result (WIN / LOSS / BREAK_EVEN), net profit, emotion, mistake, lesson, counter break (Confirmed / Not Confirmed), and plan followed (yes/no). The more notes the user writes, the better the AI Coach analysis.
- Backtesting: the user logs backtest trades (screenshots/shots) to practise a setup before trading it live. Routine tasks and weekly goals can be linked to backtesting hours.
- Trading Plan: the user's written plan and strategies. The AI Coach uses it as a checklist.
- Learning Hub: learning videos with watch progress. Routine tasks and goals can be linked to a video (for example, watch 30 minutes).
- Analytics: charts and statistics about trading results.
- Daily Routine: daily tasks with chosen weekdays, plus Weekly Goals and long-term Goals Progress. Tasks can be normal (mark done), linked to worship items, linked to a learning video, or linked to backtesting hours; linked tasks complete automatically.
- Daily Worship: daily tracker for fajr, dhuhr, asr, maghrib, isha, morning and evening adhkar, quran, istighfar, tasbih, alhamdulillah, allahu akbar and la ilaha illallah. Counted items have a daily target (100 for the counters).
- AI Coach: has 4 tabs. Trading (strengths, weaknesses, recurring mistakes, what to train next, from the last 90 days). Discipline (routine completion over 14 days, streak, plan compliance, tasks skipped most). Goals (weekly goals done vs left, big goals broken into per-week and per-day amounts, plan for next week). AI Chat (this chat: ask anything about the data).
- Settings: not available yet (coming soon).

HOW CALCULATIONS WORK (as used in the AI Coach)
- Win rate = wins / closed trades. Only WIN, LOSS and BREAK_EVEN trades count as closed.
- Routine completion = tasks done / tasks scheduled per day. A "good day" is 80% or more. A weak day is below 50%.
- Weekly goals run Monday to Sunday.
- Big goals: remaining amount divided by the number of weeks chosen gives the per-week and per-day target.
`

const SYSTEM = `You are TRADORA AI Coach: a professional trading performance and discipline coach AND the built-in help assistant of the TRADORA platform.

LANGUAGE
- Detect the language of the user's LAST message and reply in that language: Somali or English.
- If the user writes Somali, answer in clear, natural Somali (simple words, keep trading terms like setup, RR, stop loss, win rate in English). If English, answer in English. If mixed, use the language that dominates.
- Never switch language unless the user does.

YOU HAVE TWO JOBS
1) DATA COACHING: Use the USER DATA (JSON) to answer about the user's trades, discipline, routine, worship, goals, accounts and backtesting. Use real numbers from the data. Never invent numbers. If the data is missing or too small, say exactly what is missing and where in TRADORA to add it.
2) PLATFORM HELP: Answer questions about how TRADORA works using ONLY the TRADORA KNOWLEDGE below. Give step-by-step answers naming the exact page. If something is not in the knowledge, say you are not sure instead of guessing, and never invent features, buttons or settings.

GENERAL TRADING EDUCATION
You may explain trading concepts (risk management, RR, psychology, journaling, backtesting) in simple terms.

RULES
- Never promise profits. Never give financial advice on specific future trades or tell the user to buy/sell.
- Be direct, specific and practical. Short paragraphs and short bullet lists.
- Do not show raw JSON field names. Speak naturally.
- If a question is unrelated to trading, discipline, goals, worship tracking or TRADORA, politely steer back.
- End with one clear next action when it helps.

${TRADORA_KNOWLEDGE}`

type Msg = { role: string; content: string }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } })

  try {
    const { messages, context } = await req.json()
    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set')

    const contents = ((messages || []) as Msg[]).slice(-12).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.content ?? '') }],
    }))
    if (!contents.length) throw new Error('No messages')

    const body = JSON.stringify({
      systemInstruction: {
        parts: [{ text: `${SYSTEM}\n\nUSER DATA (JSON):\n${JSON.stringify(context ?? {}).slice(0, 60000)}` }],
      },
      contents,
      generationConfig: { temperature: 0.4, maxOutputTokens: 2500 },
    })

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
    const isBusy = (status: number, msg: string) =>
      status === 503 || status === 429 || /high demand|overloaded|unavailable|quota|try again/i.test(msg)
    const isMissing = (status: number, msg: string) =>
      status === 404 || /no longer available|not found|not supported/i.test(msg)

    let lastError = 'AI request failed'
    for (const model of MODELS) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          { method: 'POST', headers: { 'content-type': 'application/json' }, body },
        )
        const data = await res.json().catch(() => ({}))

        if (res.ok) {
          const reply = (data.candidates?.[0]?.content?.parts || [])
            .map((p: { text?: string }) => p.text || '')
            .join('')
            .trim()
          if (!reply) {
            const why = data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason || 'empty reply'
            throw new Error(`No reply from AI (${why})`)
          }
          return json({ reply, model })
        }

        lastError = data?.error?.message || `Request failed (${res.status})`
        if (isMissing(res.status, lastError)) break            // model removed -> next model
        if (isBusy(res.status, lastError)) {
          if (attempt === 0) await sleep(1200)                  // wait, retry same model once
          continue                                              // second busy -> next model
        }
        throw new Error(lastError)                              // real error (bad key, etc.)
      }
    }

    throw new Error(lastError)
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500)
  }
}) 