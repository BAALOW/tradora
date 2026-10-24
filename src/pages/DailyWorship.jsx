import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  Award, BarChart3, BookOpen, CalendarCheck, CalendarDays, Check, CheckCircle2, ChevronDown,
  ChevronLeft, ChevronRight, CloudSun, Flame, Flower2, Hand, Heart, Landmark, Moon, Orbit,
  Star, Sun, Sunrise, Sunset, TrendingUp, Users, X,
} from 'lucide-react'
import Sidebar from '../components/layout/Sidebar'
import Topbar from '../components/layout/Topbar'
import { useAuth } from '../contexts/AuthContext'
import { fetchWorshipDays, saveWorshipDay } from '../services/worshipService'

/* ---------- constants ---------- */
const ARABIC = { fontFamily: "'Amiri','Noto Naskh Arabic',serif" }

const COUNTERS = [
  { key: 'quran', title: 'Reading Quran', arabic: 'قراءة القرآن', target: 1, unit: 'page', step: 1, Icon: BookOpen, color: '#166f55' },
  { key: 'istighfar', title: '100 Istighfar', arabic: 'أستغفر الله', target: 100, step: 10, Icon: Hand, color: '#2563eb' },
  { key: 'tasbih', title: '100 Tasbih', arabic: 'سبحان الله', target: 100, step: 10, Icon: Orbit, color: '#7c3aed' },
  { key: 'alhamdulillah', title: '100 Alhamdulillah', arabic: 'الحمد لله', target: 100, step: 10, Icon: Flower2, color: '#10b981' },
  { key: 'allahu_akbar', title: '100 Allahu Akbar', arabic: 'الله أكبر', target: 100, step: 10, Icon: Landmark, color: '#f59e0b' },
  { key: 'la_ilaha', title: '100 La ilaha illallah', arabic: 'لا إله إلا الله', target: 100, step: 10, Icon: Heart, color: '#e11d48' },
]

const ADHKAR = [
  {
    key: 'morning_adhkar',
    title: 'Morning (Subax)',
    short: 'Morning Adhkar',
    target: 1,
    Icon: Sun,
    list: [
      {
        arabic: 'أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ',
        meaning: 'We have reached the morning and the dominion belongs to Allah. All praise is for Allah. None has the right to be worshipped except Allah alone, with no partner. To Him belongs the dominion and all praise, and He is able to do all things.',
        repeat: 'Read 1 time',
      },
      {
        arabic: 'اللَّهُمَّ بِكَ أَصْبَحْنَا، وَبِكَ أَمْسَيْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ النُّشُورُ',
        meaning: 'O Allah, by You we enter the morning and by You we enter the evening. By You we live and by You we die, and to You is the resurrection.',
        repeat: 'Read 1 time',
      },
      {
        arabic: 'بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ',
        meaning: 'In the name of Allah, with whose name nothing on earth or in heaven can cause harm. He is the All-Hearing, the All-Knowing.',
        repeat: 'Read 3 times',
      },
      {
        arabic: 'رَضِيتُ بِاللَّهِ رَبًّا، وَبِالْإِسْلَامِ دِينًا، وَبِمُحَمَّدٍ ﷺ نَبِيًّا',
        meaning: 'I am pleased with Allah as my Lord, with Islam as my religion, and with Muhammad (peace be upon him) as my Prophet.',
        repeat: 'Read 3 times',
      },
      {
        arabic: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ',
        meaning: 'Glory is to Allah, and praise is to Him.',
        repeat: 'Read 100 times',
      },
    ],
  },
  {
    key: 'evening_adhkar',
    title: 'Evening (Galab)',
    short: 'Evening Adhkar',
    target: 1,
    Icon: Moon,
    list: [
      {
        arabic: 'أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ',
        meaning: 'We have reached the evening and the dominion belongs to Allah. All praise is for Allah. None has the right to be worshipped except Allah alone, with no partner. To Him belongs the dominion and all praise, and He is able to do all things.',
        repeat: 'Read 1 time',
      },
      {
        arabic: 'اللَّهُمَّ بِكَ أَمْسَيْنَا، وَبِكَ أَصْبَحْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ الْمَصِيرُ',
        meaning: 'O Allah, by You we enter the evening and by You we enter the morning. By You we live and by You we die, and to You is the final return.',
        repeat: 'Read 1 time',
      },
      {
        arabic: 'أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ',
        meaning: 'I seek protection in the perfect words of Allah from the evil of what He has created.',
        repeat: 'Read 3 times',
      },
      {
        arabic: 'بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ',
        meaning: 'In the name of Allah, with whose name nothing on earth or in heaven can cause harm. He is the All-Hearing, the All-Knowing.',
        repeat: 'Read 3 times',
      },
      {
        arabic: 'رَضِيتُ بِاللَّهِ رَبًّا، وَبِالْإِسْلَامِ دِينًا، وَبِمُحَمَّدٍ ﷺ نَبِيًّا',
        meaning: 'I am pleased with Allah as my Lord, with Islam as my religion, and with Muhammad (peace be upon him) as my Prophet.',
        repeat: 'Read 3 times',
      },
    ],
  },
]

const DAILY_ITEMS = [...COUNTERS, ...ADHKAR]

const PRAYERS = [
  { key: 'fajr', title: 'Fajr', arabic: 'الفجر', Icon: Sunrise },
  { key: 'dhuhr', title: 'Dhuhr', arabic: 'الظهر', Icon: Sun },
  { key: 'asr', title: 'Asr', arabic: 'العصر', Icon: CloudSun },
  { key: 'maghrib', title: 'Maghrib', arabic: 'المغرب', Icon: Sunset },
  { key: 'isha', title: 'Isha', arabic: 'العشاء', Icon: Moon },
]
const TOTAL_ITEMS = DAILY_ITEMS.length + PRAYERS.length
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/* ---------- date helpers ---------- */
const pad = (n) => String(n).padStart(2, '0')
const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fromKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d) }
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const nowTime = () => new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const shortDate = (k) => fromKey(k).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const rowDate = (k) => `${shortDate(k)} (${fromKey(k).toLocaleDateString('en-US', { weekday: 'short' })})`
const monthDates = (y, m) =>
  Array.from({ length: new Date(y, m + 1, 0).getDate() }, (_, i) => toKey(new Date(y, m, i + 1)))

/* ---------- small ui pieces ---------- */
function Ring({ percent, size = 140, stroke = 12, children }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="worshipRing" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#0d9488" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#e3f3ee" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#worshipRing)"
          strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(percent, 100) / 100)}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  )
}

function Card({ className = '', children, ...rest }) {
  return (
    <div className={`rounded-2xl border border-[#e8ecf3] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className}`} {...rest}>
      {children}
    </div>
  )
}

function StatCard({ tone, Icon, RightIcon, label, children }) {
  return (
    <Card className="flex items-start gap-4 p-5">
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white ${tone}`}>
        <Icon className="h-6 w-6" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        {children}
      </div>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500">
        <RightIcon className="h-4 w-4" />
      </span>
    </Card>
  )
}

function CounterCard({ item, value, onChange }) {
  const done = value >= item.target
  const { Icon } = item
  return (
    <Card className="flex flex-col items-center px-4 pb-4 pt-5 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: item.color }}>
        <Icon className="h-7 w-7 text-white" strokeWidth={1.8} />
      </div>
      <p className="mt-3 text-[15px] font-semibold text-slate-900">{item.title}</p>
      <p className="mt-0.5 text-lg leading-7 text-slate-600" style={ARABIC}>{item.arabic}</p>
      <div className="mt-1 flex items-center gap-2.5">
        <button
          onClick={() => onChange(value - item.step)} disabled={value <= 0}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 text-base leading-none text-slate-600 hover:bg-slate-50 disabled:opacity-30"
        >−</button>
        <p className="text-[15px] font-bold tabular-nums text-slate-900">
          {value}/{item.target}{item.unit ? ` ${item.unit}` : ''}
        </p>
        <button
          onClick={() => onChange(value + item.step)} disabled={done}
          className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 text-base leading-none text-slate-600 hover:bg-slate-50 disabled:opacity-30"
        >+</button>
      </div>
      <button
        onClick={() => onChange(done ? 0 : item.target)}
        title={done ? 'Click to undo' : 'Mark as completed'}
        className={`mt-3 inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-[13px] font-medium transition ${
          done
            ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
            : 'border-slate-200 bg-white text-slate-500 hover:border-emerald-200 hover:text-emerald-600'
        }`}
      >
        <Check className="h-3.5 w-3.5" /> {done ? 'Completed' : 'Mark done'}
      </button>
    </Card>
  )
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-lg bg-white px-3 py-1.5 text-[11px] shadow-lg ring-1 ring-slate-100">
      <p className="font-semibold text-slate-800">{p.label}</p>
      <p className="text-slate-500">{p.tip}</p>
    </div>
  )
}

function AdhkarModal({ adhkar, done, time, onToggleDone, onClose }) {
  const [read, setRead] = useState({})
  const isMorning = adhkar.key === 'morning_adhkar'

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const readCount = adhkar.list.filter((_, i) => read[i]).length

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <span className={`flex h-10 w-10 items-center justify-center rounded-full ${isMorning ? 'bg-amber-50 text-amber-500' : 'bg-indigo-500 text-white'}`}>
            <adhkar.Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[17px] font-bold text-slate-900">{adhkar.title} Adhkar</h3>
            <p className="text-xs text-slate-500">{readCount}/{adhkar.list.length} read · tap an adhkar to tick it</p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-5 py-4">
          {adhkar.list.map((d, i) => (
            <button
              key={i}
              onClick={() => setRead((p) => ({ ...p, [i]: !p[i] }))}
              className={`block w-full rounded-xl border p-4 text-left transition ${
                read[i] ? 'border-emerald-200 bg-emerald-50/60' : 'border-[#e8ecf3] hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">{i + 1}</span>
                <span className="flex items-center gap-2">
                  <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-600">{d.repeat}</span>
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full ${read[i] ? 'bg-emerald-500' : 'border border-slate-300'}`}>
                    {read[i] && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                  </span>
                </span>
              </div>
              <p className="mt-3 text-[24px] leading-[2.4rem] text-slate-900" style={ARABIC} dir="rtl">{d.arabic}</p>
              <p className="mt-2 text-[13px] leading-5 text-slate-600">{d.meaning}</p>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
          <p className="text-xs text-slate-500">{done && time ? `Completed at ${time}` : 'Not completed yet'}</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50">Close</button>
            <button
              onClick={onToggleDone}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-medium ${
                done ? 'border border-emerald-200 bg-emerald-50 text-emerald-600' : 'bg-emerald-600 text-white hover:bg-emerald-700'
              }`}
            >
              <Check className="h-4 w-4" /> {done ? 'Completed (tap to undo)' : 'Mark as completed'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------- page ---------- */
export default function DailyWorship() {
  const { user } = useAuth()
  const todayKey = useMemo(() => toKey(new Date()), [])
  const [days, setDays] = useState({})
  const [selectedDate, setSelectedDate] = useState(todayKey)
  const [viewMonth, setViewMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1) })
  const [tab, setTab] = useState('monthly')
  const [error, setError] = useState('')
  const [adhkarOpen, setAdhkarOpen] = useState(null)

  const vy = viewMonth.getFullYear()
  const vm = viewMonth.getMonth()

  /* load data (year of the viewed month, plus edges) */
  useEffect(() => {
    if (!user) return
    let off = false
    fetchWorshipDays(user.id, `${vy - 1}-12-01`, `${vy + 1}-01-31`)
      .then((rows) => {
        if (off) return
        const map = {}
        rows.forEach((r) => { map[r.log_date] = { counts: r.counts || {}, times: r.times || {} } })
        setDays((p) => ({ ...p, ...map }))
      })
      .catch((e) => { console.error(e); setError('Could not load worship data. Check the worship_days table and policies in Supabase.') })
    return () => { off = true }
  }, [user, vy])

  /* save helpers (optimistic, with rollback) */
  const commit = useCallback(async (date, counts, times) => {
    if (!user) return
    const prev = days[date]
    setDays((p) => ({ ...p, [date]: { counts, times } }))
    try {
      await saveWorshipDay(user.id, date, counts, times)
      setError('')
    } catch (e) {
      console.error(e)
      setError('Could not save. Check your connection and the Supabase table/policies.')
      setDays((p) => { const n = { ...p }; if (prev) n[date] = prev; else delete n[date]; return n })
    }
  }, [days, user])

  const setValue = useCallback((date, key, target, value) => {
    const prev = days[date]
    const counts = { ...(prev?.counts || {}), [key]: Math.max(0, Math.min(value, target)) }
    const times = { ...(prev?.times || {}) }
    if (counts[key] >= target) times[key] = times[key] || nowTime()
    else delete times[key]
    commit(date, counts, times)
  }, [days, commit])

  const setPrayer = useCallback((date, key, prayed, jamaah) => {
    const prev = days[date]
    const counts = {
      ...(prev?.counts || {}),
      [key]: prayed ? 1 : 0,
      [`${key}_jamaah`]: prayed && jamaah ? 1 : 0,
    }
    const times = { ...(prev?.times || {}) }
    if (prayed) times[key] = times[key] || nowTime()
    else delete times[key]
    commit(date, counts, times)
  }, [days, commit])

  /* derived helpers */
  const getCounts = (k) => days[k]?.counts || {}
  const isDone = (k, item) => (getCounts(k)[item.key] || 0) >= item.target
  const prayerOn = (k, p) => (getCounts(k)[p.key] || 0) >= 1
  const jamaahOn = (k, p) => prayerOn(k, p) && (getCounts(k)[`${p.key}_jamaah`] || 0) >= 1
  const prayersDone = (k) => PRAYERS.filter((p) => prayerOn(k, p)).length
  const jamaahDone = (k) => PRAYERS.filter((p) => jamaahOn(k, p)).length
  const doneCount = (k) => DAILY_ITEMS.filter((i) => isDone(k, i)).length + prayersDone(k)
  const isFull = (k) => doneCount(k) === TOTAL_ITEMS
  const dayState = (k) => {
    if (isFull(k)) return 'full'
    if (doneCount(k) > 0) return 'partial'
    return k < todayKey ? 'missed' : 'none'
  }

  const selCounts = getCounts(selectedDate)
  const selDone = doneCount(selectedDate)
  const selPercent = Math.round((selDone / TOTAL_ITEMS) * 100)
  const isToday = selectedDate === todayKey
  const selPrayers = prayersDone(selectedDate)
  const selJamaah = jamaahDone(selectedDate)

  /* top stat cards */
  const score = Math.round((selDone / TOTAL_ITEMS) * 10)
  const scoreMsg = score >= 10 ? 'MashaAllah! A perfect day.' : score >= 7 ? "Keep going, you're doing great!" : 'Every step counts, keep going.'
  const streak = (() => {
    let n = 0
    let d = fromKey(todayKey)
    if (!isFull(todayKey)) d = addDays(d, -1)
    while (n < 3650 && isFull(toKey(d))) { n++; d = addDays(d, -1) }
    return n
  })()

  /* month stats */
  const mDates = useMemo(() => monthDates(vy, vm), [vy, vm])
  const monthFull = mDates.filter(isFull).length
  const monthMissed = mDates.filter((k) => k < todayKey && !isFull(k)).length
  const monthPercent = Math.round((monthFull / mDates.length) * 100)
  const monthPrayed = mDates.reduce((s, k) => s + prayersDone(k), 0)
  const monthJamaah = mDates.reduce((s, k) => s + jamaahDone(k), 0)

  /* calendar cells */
  const cells = useMemo(() => {
    const first = new Date(vy, vm, 1)
    const start = addDays(first, -first.getDay())
    return Array.from({ length: 42 }, (_, i) => {
      const d = addDays(start, i)
      return { key: toKey(d), day: d.getDate(), inMonth: d.getMonth() === vm }
    })
  }, [vy, vm])

  /* analysis */
  const analysis = (() => {
    let dates
    if (tab === 'weekly') dates = Array.from({ length: 7 }, (_, i) => toKey(addDays(fromKey(selectedDate), i - 6)))
    else if (tab === 'monthly') dates = mDates
    else dates = Array.from({ length: 12 }, (_, m) => monthDates(vy, m)).flat()

    const pct = (k) => Math.round((doneCount(k) / TOTAL_ITEMS) * 100)
    let points
    if (tab === 'yearly') {
      points = Array.from({ length: 12 }, (_, m) => {
        const ds = monthDates(vy, m)
        const avg = Math.round(ds.reduce((s, k) => s + pct(k), 0) / ds.length)
        return { label: new Date(vy, m, 1).toLocaleDateString('en-US', { month: 'short' }), pct: avg, tip: `${avg}% average` }
      })
    } else {
      points = dates.map((k) => ({ label: shortDate(k), pct: pct(k), tip: `${doneCount(k)}/${TOTAL_ITEMS} completed` }))
    }
    const full = dates.filter(isFull).length
    const rate = Math.round((full / dates.length) * 100)
    const adhkar = ADHKAR.map((a) => {
      const n = dates.filter((k) => (getCounts(k)[a.key] || 0) >= 1).length
      return { ...a, n, total: dates.length, pct: Math.round((n / dates.length) * 100) }
    })
    return { points, rate, adhkar }
  })()
  const periodLabel = tab === 'weekly' ? 'Last 7 days' : tab === 'monthly' ? 'This month' : 'This year'

  const breakdownDates = Array.from({ length: 6 }, (_, i) => toKey(addDays(fromKey(selectedDate), -i)))

  const selectDay = (c) => {
    setSelectedDate(c.key)
    if (!c.inMonth) { const d = fromKey(c.key); setViewMonth(new Date(d.getFullYear(), d.getMonth(), 1)) }
  }
  const monthLabel = viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const dotColor = { full: 'bg-emerald-500', partial: 'bg-amber-400', missed: 'bg-rose-300', none: 'bg-slate-300' }
  const dayLabel = isToday ? 'Today' : shortDate(selectedDate)

  const openAdhkar = ADHKAR.find((a) => a.key === adhkarOpen)

  if (!user) return null

  return (
    <div className="flex min-h-screen bg-[#f6f8fc] text-slate-900">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 space-y-4 p-4 sm:p-6">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">{error}</div>
          )}

          {/* HERO */}
          <div
            className="relative overflow-hidden rounded-2xl border border-[#e3e9f5] px-6 py-5"
            style={{ background: 'linear-gradient(90deg,#f6f8ff 0%,#e9f0ff 48%,#fbeee3 100%)' }}
          >
            <svg viewBox="0 0 520 130" className="pointer-events-none absolute bottom-0 right-0 hidden h-full opacity-40 md:block" preserveAspectRatio="xMaxYMax meet">
              <g fill="#64748b">
                <rect x="40" y="30" width="10" height="100" /><polygon points="38,30 52,30 45,8" />
                <rect x="470" y="40" width="10" height="90" /><polygon points="468,40 482,40 475,16" />
                <path d="M170 130 V92 A55 55 0 0 1 280 92 V130 Z" /><rect x="224" y="24" width="2" height="14" />
                <path d="M290 130 V104 A32 32 0 0 1 354 104 V130 Z" />
                <path d="M120 130 V108 A26 26 0 0 1 172 108 V130 Z" />
                <rect x="360" y="96" width="100" height="34" />
                <path d="M380 96 A20 20 0 0 1 420 96 Z" />
              </g>
            </svg>
            <div className="relative flex items-center justify-between gap-6">
              <div className="flex items-center gap-5">
                <div className="flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-2xl shadow-md" style={{ background: 'linear-gradient(135deg,#16a34a,#0f766e)' }}>
                  <Landmark className="h-9 w-9 text-white" strokeWidth={1.6} />
                </div>
                <div>
                  <h1 className="text-[32px] font-bold leading-tight text-slate-900">Daily Worship</h1>
                  <p className="mt-0.5 text-[15px] text-slate-700">Strengthen your iman, get closer to Allah.</p>
                  <p className="mt-1.5 text-[12.5px] text-slate-500">
                    "And whoever relies upon Allah — then He is sufficient for him." — At-Talaq 65:3
                  </p>
                </div>
              </div>
              <div className="relative hidden text-right lg:block">
                <p className="text-[28px] leading-10 text-slate-800" style={ARABIC}>وَمَا تَوْفِيقِي إِلَّا بِاللَّهِ</p>
                <p className="text-[12.5px] text-slate-600">"My success is only by Allah."</p>
                <p className="text-[12.5px] text-slate-500">— Qur'an 11:88</p>
              </div>
            </div>
          </div>

          {/* TOP STAT CARDS */}
          <div className="grid gap-3 md:grid-cols-3">
            <StatCard tone="bg-indigo-500" Icon={Star} RightIcon={BarChart3} label="Worship Score">
              <p className="mt-1 text-[28px] font-bold leading-none text-slate-900">
                {score} <span className="text-lg font-medium text-slate-500">/ 10</span>
              </p>
              <div className="mt-2.5 h-1.5 rounded-full bg-slate-100">
                <div className="h-1.5 rounded-full bg-blue-600 transition-all duration-700" style={{ width: `${score * 10}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-slate-500">{scoreMsg}</p>
            </StatCard>

            <StatCard tone="bg-emerald-500" Icon={Award} RightIcon={Flame} label="Streak">
              <p className="mt-1 text-[28px] font-bold leading-none text-slate-900">{streak}</p>
              <p className="mt-3 text-xs text-slate-500">Consecutive days</p>
            </StatCard>

            <StatCard tone="bg-violet-500" Icon={CalendarCheck} RightIcon={CheckCircle2} label={dayLabel}>
              <p className="mt-1 text-[28px] font-bold leading-none text-slate-900">
                {selPrayers}<span className="text-lg font-medium text-slate-500">/{PRAYERS.length}</span>
              </p>
              <p className="mt-3 text-xs text-slate-500">Prayers completed</p>
            </StatCard>
          </div>

          {/* COUNTER CARDS */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {COUNTERS.map((item) => (
              <CounterCard
                key={item.key}
                item={item}
                value={selCounts[item.key] || 0}
                onChange={(v) => setValue(selectedDate, item.key, item.target, v)}
              />
            ))}
          </div>

          {/* FIVE DAILY PRAYERS */}
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-[17px] font-bold text-slate-900">
                  Five Daily Prayers <span className="ml-1 text-lg font-normal text-slate-500" style={ARABIC}>الصلوات الخمس</span>
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {isToday ? 'Today' : shortDate(selectedDate)} · Prayed {selPrayers}/5 · In Jamaah {selJamaah}/5
                </p>
              </div>
              <div className="flex gap-2 text-xs">
                <span className="rounded-lg bg-emerald-50 px-3 py-1.5 font-medium text-emerald-700">
                  This month: {monthPrayed} prayers
                </span>
                <span className="rounded-lg bg-indigo-50 px-3 py-1.5 font-medium text-indigo-700">
                  {monthJamaah} in Jamaah
                </span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              {PRAYERS.map((p) => {
                const prayed = prayerOn(selectedDate, p)
                const jamaah = jamaahOn(selectedDate, p)
                const time = days[selectedDate]?.times?.[p.key]
                return (
                  <div
                    key={p.key}
                    className={`rounded-xl border p-3.5 text-center transition ${prayed ? 'border-emerald-200 bg-emerald-50/50' : 'border-[#e8ecf3]'}`}
                  >
                    <span className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full ${prayed ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      <p.Icon className="h-5 w-5" />
                    </span>
                    <p className="mt-2 text-[14px] font-semibold text-slate-900">{p.title}</p>
                    <p className="text-base leading-6 text-slate-500" style={ARABIC}>{p.arabic}</p>
                    <p className="h-4 text-[11px] text-slate-400">{prayed && time ? time : ''}</p>

                    <button
                      onClick={() => setPrayer(selectedDate, p.key, !prayed, false)}
                      className={`mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition ${
                        prayed
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                          : 'border-slate-200 bg-white text-slate-500 hover:border-emerald-200 hover:text-emerald-600'
                      }`}
                    >
                      <Check className="h-3.5 w-3.5" /> {prayed ? 'Prayed' : 'Mark prayed'}
                    </button>
                    <button
                      onClick={() => setPrayer(selectedDate, p.key, true, !jamaah)}
                      className={`mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-medium transition ${
                        jamaah
                          ? 'border-indigo-200 bg-indigo-50 text-indigo-600'
                          : 'border-slate-200 bg-white text-slate-500 hover:border-indigo-200 hover:text-indigo-600'
                      }`}
                    >
                      <Users className="h-3.5 w-3.5" /> {jamaah ? 'In Jamaah' : 'Jamaah?'}
                    </button>
                  </div>
                )
              })}
            </div>
          </Card>

          {/* PROGRESS / CALENDAR / MONTH / ADHKAR */}
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1.35fr)_minmax(0,0.95fr)_minmax(0,1.35fr)]">
            {/* Today's progress */}
            <Card className="p-5">
              <h3 className="text-[17px] font-bold text-slate-900">
                {isToday ? "Today's Progress" : `${shortDate(selectedDate)} Progress`}
              </h3>
              <div className="mt-4 flex items-center gap-5">
                <Ring percent={selPercent} size={140} stroke={13}>
                  <p className="text-[26px] font-bold leading-none text-slate-900">{selPercent}%</p>
                  <p className="mt-1 text-xs text-slate-500">Completed</p>
                  <p className="text-xs font-semibold text-slate-600">{selDone}/{TOTAL_ITEMS}</p>
                </Ring>
                <ul className="min-w-0 flex-1 space-y-2">
                  {DAILY_ITEMS.map((item) => {
                    const v = selCounts[item.key] || 0
                    const done = v >= item.target
                    const isAdhkar = item.key.endsWith('adhkar')
                    return (
                      <li key={item.key} className="flex items-center gap-2 text-[12.5px]">
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${done ? 'bg-emerald-500' : 'border border-slate-300'}`}>
                          {done && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                        </span>
                        <span className="flex-1 truncate text-slate-700">{isAdhkar ? item.short : item.title.replace('100 ', '')}</span>
                        {isAdhkar
                          ? done && <Check className="h-4 w-4 text-emerald-500" strokeWidth={2.5} />
                          : <span className="tabular-nums text-slate-500">{v}/{item.target}</span>}
                      </li>
                    )
                  })}
                  <li className="flex items-center gap-2 text-[12.5px]">
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${selPrayers === 5 ? 'bg-emerald-500' : 'border border-slate-300'}`}>
                      {selPrayers === 5 && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                    </span>
                    <span className="flex-1 truncate text-slate-700">Prayers</span>
                    <span className="tabular-nums text-slate-500">{selPrayers}/5</span>
                  </li>
                </ul>
              </div>
            </Card>

            {/* Calendar */}
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-[17px] font-bold text-slate-900">{monthLabel}</h3>
                <div className="flex gap-1.5">
                  <button onClick={() => setViewMonth(new Date(vy, vm - 1, 1))} className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-500 hover:bg-slate-200"><ChevronLeft className="h-4 w-4" /></button>
                  <button onClick={() => setViewMonth(new Date(vy, vm + 1, 1))} className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-slate-500 hover:bg-slate-200"><ChevronRight className="h-4 w-4" /></button>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-7 text-center text-[11px] text-slate-500">
                {WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-y-1 text-center">
                {cells.map((c) => {
                  const st = dayState(c.key)
                  const sel = c.key === selectedDate
                  return (
                    <button key={c.key} onClick={() => selectDay(c)} className="flex flex-col items-center py-0.5">
                      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-medium ${
                        sel ? 'bg-indigo-600 text-white'
                          : !c.inMonth ? 'text-slate-300'
                          : st === 'partial' ? 'text-amber-500'
                          : 'text-slate-700'
                      }`}>{c.day}</span>
                      <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${sel ? 'bg-transparent' : c.inMonth ? dotColor[st] : 'bg-slate-200'}`} />
                    </button>
                  )
                })}
              </div>
            </Card>

            {/* This month */}
            <Card className="p-5">
              <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><CalendarDays className="h-4 w-4" /></span>
                <span className="text-[13px] font-semibold text-slate-700">This Month</span>
              </div>
              <div className="mt-4 flex justify-center">
                <Ring percent={monthPercent} size={112} stroke={9}>
                  <p className="text-[22px] font-bold leading-none text-slate-900">
                    {monthFull}<span className="text-sm font-medium text-slate-400">/{mDates.length}</span>
                  </p>
                  <p className="mt-1 text-[10px] text-slate-500">Days Completed</p>
                </Ring>
              </div>
              <p className="mt-2 text-center text-[20px] font-bold text-slate-900">{monthPercent}%</p>
              <div className="mt-3 flex items-center justify-center gap-2">
                <span className="h-3 w-3 rounded-full bg-rose-500" />
                <span className="text-lg font-bold text-slate-900">{monthMissed}</span>
                <span className="text-xs text-slate-500">Days Missed</span>
              </div>
            </Card>

            {/* Adhkar */}
            <Card className="min-w-0 p-5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-500"><Sun className="h-4 w-4" /></span>
                <h3 className="text-[17px] font-bold text-slate-900">Adhkar</h3>
              </div>
              <div className="mt-3 divide-y divide-slate-100">
                {ADHKAR.map((a) => {
                  const done = (selCounts[a.key] || 0) >= 1
                  const time = days[selectedDate]?.times?.[a.key]
                  const isMorning = a.key === 'morning_adhkar'
                  return (
                    <button
                      key={a.key}
                      onClick={() => setAdhkarOpen(a.key)}
                      className="flex w-full min-w-0 items-start gap-3 py-3 text-left first:pt-1"
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isMorning ? 'bg-amber-50 text-amber-500' : 'bg-indigo-500 text-white'}`}>
                        <a.Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13.5px] font-semibold text-slate-900">{a.title}</span>
                        <span className="block w-full whitespace-normal break-words text-right text-[15px] leading-7 text-slate-600" style={ARABIC} dir="rtl">{a.list[0].arabic}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                          <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-medium ${done ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'border-slate-200 text-slate-500'}`}>
                            <Check className="h-3 w-3" /> {done ? 'Completed' : 'Not done'}
                          </span>
                          <span className="text-slate-500">{done && time ? time : `${a.list.length} adhkar · tap to read`}</span>
                        </span>
                      </span>
                      <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-slate-700" />
                    </button>
                  )
                })}
              </div>
            </Card>
          </div>

          {/* DETAILED ANALYSIS */}
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-[17px] font-bold text-slate-900">Detailed Analysis</h3>
              <div className="flex items-center gap-3">
                <div className="flex rounded-full border border-slate-200 bg-white p-0.5 text-[12.5px]">
                  {['weekly', 'monthly', 'yearly'].map((t) => (
                    <button
                      key={t} onClick={() => setTab(t)}
                      className={`rounded-full px-4 py-1.5 font-medium capitalize ${tab === t ? 'bg-[#3b5bdb] text-white' : 'text-slate-500'}`}
                    >{t}</button>
                  ))}
                </div>
                <label className="relative flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] text-slate-700">
                  <CalendarDays className="h-4 w-4 text-slate-500" />
                  <span>{monthLabel}</span>
                  <ChevronDown className="h-3.5 w-3.5" />
                  <input
                    type="month" value={`${vy}-${pad(vm + 1)}`}
                    onChange={(e) => { if (!e.target.value) return; const [y, m] = e.target.value.split('-').map(Number); setViewMonth(new Date(y, m - 1, 1)) }}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                </label>
              </div>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-[1.15fr_1fr_1.15fr]">
              {/* chart */}
              <div className="rounded-xl border border-[#e8ecf3] p-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600"><TrendingUp className="h-4 w-4" /></span>
                  <span className="text-[12.5px] font-medium text-blue-700">Daily Completion Rate</span>
                </div>
                <p className="mt-2 text-[24px] font-bold leading-none text-slate-900">{analysis.rate}%</p>
                <p className="mt-1 text-xs text-slate-500">{periodLabel}</p>
                <div className="mt-2 h-[170px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analysis.points} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                      <defs>
                        <linearGradient id="worshipArea" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                          <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#eef1f6" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} interval={tab === 'monthly' ? 4 : 0} />
                      <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                      <Tooltip content={<ChartTooltip />} />
                      <Area
                        type="monotone" dataKey="pct" stroke="#3b82f6" strokeWidth={2} fill="url(#worshipArea)"
                        dot={{ r: 2, fill: '#3b82f6', strokeWidth: 0 }} activeDot={{ r: 5 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* adhkar performance */}
              <div className="rounded-xl border border-[#e8ecf3] p-4">
                <div className="flex items-center gap-2.5">
                  <BarChart3 className="h-4 w-4 text-blue-600" />
                  <span className="text-[12.5px] font-medium text-blue-700">Adhkar Performance</span>
                </div>
                <div className="mt-3 space-y-4">
                  {analysis.adhkar.map((a) => {
                    const isMorning = a.key === 'morning_adhkar'
                    return (
                      <div key={a.key} className="flex items-center gap-3">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${isMorning ? 'bg-amber-50 text-amber-500' : 'bg-indigo-500 text-white'}`}>
                          <a.Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12.5px] font-semibold text-slate-800">{a.title}</p>
                          <p className="text-[11px] text-slate-500">Completed {a.n}/{a.total}</p>
                          <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                            <div className="h-1.5 rounded-full bg-emerald-500 transition-all duration-700" style={{ width: `${a.pct}%` }} />
                          </div>
                        </div>
                        <span className="self-end text-[11px] font-medium text-emerald-600">{a.pct}%</span>
                      </div>
                    )
                  })}
                </div>
                <div className="mt-4 rounded-xl bg-[#eef3fd] px-4 py-3 text-center">
                  <p className="text-lg text-slate-700" style={ARABIC}>أَلَا بِذِكْرِ اللَّهِ تَطْمَئِنُّ الْقُلُوبُ</p>
                  <p className="mt-0.5 text-[11px] italic text-slate-500">"It is only in the remembrance of Allah that hearts find peace."</p>
                  <p className="text-[11px] italic text-slate-500">— Qur'an 13:28</p>
                </div>
              </div>

              {/* breakdown */}
              <div className="rounded-xl border border-[#e8ecf3] p-4">
                <p className="text-[13.5px] font-bold text-slate-900">Daily Breakdown</p>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[480px] text-[11.5px]">
                    <thead>
                      <tr className="text-slate-500">
                        <th className="py-2 text-left font-medium">Date</th>
                        {PRAYERS.map((p) => <th key={p.key} className="font-medium">{p.title}</th>)}
                        <th className="font-medium">Jamaah</th>
                        <th className="font-medium">Adhkar</th>
                        <th className="text-right font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {breakdownDates.map((k) => {
                        const adhkarOk = ADHKAR.every((a) => isDone(k, a))
                        const complete = prayersDone(k) === PRAYERS.length && adhkarOk
                        return (
                          <tr key={k} className="border-t border-slate-100">
                            <td className="py-2">
                              <button onClick={() => setSelectedDate(k)} className={`text-left ${k === selectedDate ? 'font-semibold text-indigo-600' : 'text-slate-700'}`}>{rowDate(k)}</button>
                            </td>
                            {PRAYERS.map((p) => (
                              <td key={p.key} className="text-center">
                                <button onClick={() => setPrayer(k, p.key, !prayerOn(k, p), false)} className="inline-flex">
                                  {prayerOn(k, p)
                                    ? <Check className="h-4 w-4 text-emerald-500" strokeWidth={2.5} />
                                    : <X className="h-4 w-4 text-rose-500" strokeWidth={2.5} />}
                                </button>
                              </td>
                            ))}
                            <td className="text-center font-medium tabular-nums text-indigo-600">{jamaahDone(k)}/5</td>
                            <td className="text-center">
                              {adhkarOk
                                ? <Check className="mx-auto h-4 w-4 text-emerald-500" strokeWidth={2.5} />
                                : <X className="mx-auto h-4 w-4 text-rose-500" strokeWidth={2.5} />}
                            </td>
                            <td className="text-right">
                              <span className={`inline-block rounded-md px-2 py-0.5 font-medium ${complete ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                                {complete ? 'Completed' : 'Partial'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </Card>
        </main>
      </div>

      {openAdhkar && (
        <AdhkarModal
          adhkar={openAdhkar}
          done={(selCounts[openAdhkar.key] || 0) >= 1}
          time={days[selectedDate]?.times?.[openAdhkar.key]}
          onToggleDone={() =>
            setValue(selectedDate, openAdhkar.key, 1, (selCounts[openAdhkar.key] || 0) >= 1 ? 0 : 1)
          }
          onClose={() => setAdhkarOpen(null)}
        />
      )}
    </div>
  )
}