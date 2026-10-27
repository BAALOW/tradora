import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Search, Youtube, Play, CheckCircle2, Clock3, Flame, Video, BookOpen,
  Target, Plus, ChevronDown, ChevronRight, MoreVertical, StickyNote,
  Sparkles, LoaderCircle, X, ExternalLink, Heart, RefreshCw,
  Pencil, Trash2, CalendarClock,
} from 'lucide-react'
import Sidebar from '../components/layout/Sidebar'
import Topbar from '../components/layout/Topbar'
import { useAccounts } from '../hooks/useAccounts'
import { useToast } from '../components/ui/Toast'
import { supabase } from '../lib/supabaseClient'

const FILTER_TABS = ['All Videos', 'In Progress', 'Completed', 'Favorites']
const SORTS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'progress', label: 'Progress' },
]
const TEXT_COLOR_SWATCHES = ['#1F2937', '#DC2626', '#2563EB', '#16A34A', '#D97706', '#7C3AED']

const emptyVideoForm = { title: '', youtube_url: '', channel: '', category: '', duration_hours: '0', duration_minutes: '30', level: 'Beginner', thumbnail_url: '', description: '', deadline_date: '' }
const emptyNoteBlock = () => ({ type: 'paragraph', text: '' })

/* ---------------- Network helpers (retry + timeout + cache) ---------------- */

const CACHE_KEY = 'learning-hub-cache-v1'
const REQUEST_TIMEOUT_MS = 12000
const MAX_ATTEMPTS = 3

// IMPORTANT: the notes LIST query never selects the `images` column.
// Images are stored as base64 and can be megabytes each — pulling them
// for every note on every load is what caused the 500 / QUIC errors and
// the endless skeleton. Images are fetched lazily, one note at a time,
// only when a note is opened or edited.
const NOTE_LIST_COLUMNS = 'id, user_id, video_id, title, note_title, title_color, content, blocks, text_color, bg_color, important, created_at, learning_videos(title, channel, category, youtube_url, thumbnail_url)'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.videos)) return null
    return parsed
  } catch { return null }
}
function writeCache(data) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(data)) } catch { /* storage full / blocked — ignore */ }
}

// Runs one Supabase query with a timeout and automatic retries. A single
// dropped HTTP/3 (QUIC) connection or a transient 500 no longer breaks
// the whole page — the request is simply tried again on a fresh connection.
async function fetchWithRetry(build) {
  let lastError
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const { data, error } = await build(controller.signal)
      clearTimeout(timer)
      if (error) throw error
      return data || []
    } catch (e) {
      clearTimeout(timer)
      lastError = e
      if (attempt < MAX_ATTEMPTS - 1) await sleep(700 * (attempt + 1))
    }
  }
  throw lastError
}

const formatDuration = (seconds = 0) => {
  const n = Math.max(0, Number(seconds) || 0)
  const h = Math.floor(n / 3600)
  const m = Math.floor((n % 3600) / 60)
  const s = Math.floor(n % 60)
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}
const formatWatchTime = (seconds = 0) => {
  const mins = Math.floor((Number(seconds) || 0) / 60)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h ? `${h}h ${m}m` : `${m}m`
}
const getYoutubeId = (url = '') => {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/)
  return match?.[1] || ''
}
const thumbnailFor = (video) => video.thumbnail_url || (getYoutubeId(video.youtube_url) ? `https://img.youtube.com/vi/${getYoutubeId(video.youtube_url)}/hqdefault.jpg` : '')
const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(reader.result)
  reader.onerror = reject
  reader.readAsDataURL(file)
})
// Shrinks screenshots before they are stored, so notes stay small and
// load fast. Falls back to the original file if anything goes wrong.
const compressImage = (file, maxSize = 1280, quality = 0.78) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file)
  const img = new Image()
  img.onload = () => {
    try {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * scale))
      canvas.height = Math.max(1, Math.round(img.height * scale))
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', quality))
    } catch {
      URL.revokeObjectURL(url)
      fileToDataUrl(file).then(resolve, reject)
    }
  }
  img.onerror = () => { URL.revokeObjectURL(url); fileToDataUrl(file).then(resolve, reject) }
  img.src = url
})
const htmlToPlainText = (html = '') => {
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent || div.innerText || ''
}
const addDaysIso = (days) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
// Overdue / due-today / due-soon badge for a video with a deadline.
function deadlineInfo(video) {
  if (!video.deadline_date || video.completed) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(`${video.deadline_date}T00:00:00`)
  const diffDays = Math.round((due - today) / 86400000)
  if (diffDays < 0) return { label: `Overdue ${Math.abs(diffDays)}d`, tone: 'danger' }
  if (diffDays === 0) return { label: 'Due today', tone: 'danger' }
  if (diffDays <= 2) return { label: `Due in ${diffDays}d`, tone: 'warning' }
  return { label: `Due ${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, tone: 'neutral' }
}

// Pulls title / channel / thumbnail straight from YouTube — no API key
// needed, YouTube's public oEmbed endpoint allows browser-side fetches.
// Duration isn't available from oEmbed (that needs the paid Data API),
// so the duration field stays manually entered.
async function fetchYoutubeOEmbed(url) {
  const videoId = getYoutubeId(url)
  if (!videoId) return null
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`)
    if (!res.ok) return null
    const data = await res.json()
    return {
      title: data.title || '',
      channel: data.author_name || '',
      thumbnail_url: data.thumbnail_url || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    }
  } catch {
    return null
  }
}

// Loads the YouTube IFrame Player API once, globally.
function loadYoutubeIframeApi() {
  if (window.YT && window.YT.Player) return
  if (document.getElementById('youtube-iframe-api')) return
  const tag = document.createElement('script')
  tag.id = 'youtube-iframe-api'
  tag.src = 'https://www.youtube.com/iframe_api'
  document.body.appendChild(tag)
}

function Panel({ children, className = '' }) {
  return <section className={`rounded-xl border border-slate-200/80 bg-white shadow-[0_2px_8px_rgba(15,23,42,0.025)] ${className}`}>{children}</section>
}
function ProgressLine({ value, color = 'bg-blue-600' }) {
  return <div className="h-1.5 overflow-hidden rounded-full bg-blue-100"><div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.min(100, Math.max(0, value || 0))}%` }} /></div>
}
function Modal({ title, onClose, children }) {
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
      <div className="mb-4 flex items-center justify-between"><h2 className="text-base font-bold text-slate-900">{title}</h2><button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={18} /></button></div>
      {children}
    </div>
  </div>
}
function ImageLightbox({ src, onClose }) {
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4" onMouseDown={onClose}>
    <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-slate-700 hover:text-rose-600"><X size={20} /></button>
    <img src={src} alt="" onMouseDown={(e) => e.stopPropagation()} className="max-h-[90vh] max-w-[95vw] rounded-lg object-contain" />
  </div>
}

// A single rich-text paragraph block. Hydrates its HTML once on mount
// (so edit mode shows existing content + any saved colors/lists) and
// then lets the browser own the DOM while typing — re-feeding state
// back into dangerouslySetInnerHTML on every keystroke would reset the
// caret position, so onInput only reports the latest HTML upward for
// saving, it never writes back into the element itself.
function RichParagraphBlock({ html, onChange }) {
  const ref = useRef(null)
  const hydrated = useRef(false)
  useEffect(() => {
    if (!hydrated.current && ref.current) {
      ref.current.innerHTML = html || ''
      hydrated.current = true
    }
  }, [html])
  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onInput={(e) => onChange(e.currentTarget.innerHTML)}
      className="min-h-[2.25rem] flex-1 bg-transparent text-sm leading-6 outline-none [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
    />
  )
}

export default function LearningHub() {
  const { accounts = [] } = useAccounts()
  const { showToast } = useToast()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Last good data is cached for this browser session, so a refresh shows
  // real numbers instantly instead of a skeleton + zeros while Supabase
  // answers (or fails) in the background.
  const [cache] = useState(readCache)
  const [videos, setVideos] = useState(() => cache?.videos || [])
  const [progressRows, setProgressRows] = useState(() => cache?.progressRows || [])
  const [notes, setNotes] = useState(() => cache?.notes || [])
  const [goals, setGoals] = useState(() => cache?.goals || [])
  const [loading, setLoading] = useState(() => !cache)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [source, setSource] = useState('YouTube')
  const [tab, setTab] = useState('All Videos')
  const [category, setCategory] = useState('All')
  const [sort, setSort] = useState('newest')
  const [categoryPage, setCategoryPage] = useState(0)
  const [activeVideo, setActiveVideo] = useState(null)
  const [noteModal, setNoteModal] = useState(null)
  const [goalModal, setGoalModal] = useState(false)
  const [videoModal, setVideoModal] = useState(false)
  const [editingVideoId, setEditingVideoId] = useState(null)
  const [deletingVideo, setDeletingVideo] = useState(null)
  const [goalTitle, setGoalTitle] = useState('')
  const [goalTarget, setGoalTarget] = useState('5')
  const [videoForm, setVideoForm] = useState(emptyVideoForm)
  const [fetchingMeta, setFetchingMeta] = useState(false)
  const [metaFetched, setMetaFetched] = useState(false)

  // Rich note editor state
  const [editingNoteId, setEditingNoteId] = useState(null)
  const [noteTitleText, setNoteTitleText] = useState('')
  const [noteTitleColor, setNoteTitleColor] = useState('#111827')
  const [noteBlocks, setNoteBlocks] = useState([emptyNoteBlock()])
  const [noteTextColor, setNoteTextColor] = useState('#1F2937')
  const [noteBgColor, setNoteBgColor] = useState('#FFFFFF')
  const [noteImages, setNoteImages] = useState([])
  const [noteImagesLoaded, setNoteImagesLoaded] = useState(true)
  const [noteImportant, setNoteImportant] = useState(false)
  const [viewingNote, setViewingNote] = useState(null)
  const [viewImagesLoading, setViewImagesLoading] = useState(false)
  const [deletingNote, setDeletingNote] = useState(null)
  const [lightboxImage, setLightboxImage] = useState(null)

  // Embedded YouTube player (real watch-time tracking)
  const playerRef = useRef(null)
  const watchIntervalRef = useRef(null)
  const remindedRef = useRef(false)

  // Refs so long-lived callbacks (player interval, etc.) never read stale state.
  const loadSeq = useRef(0)
  const hasDataRef = useRef(!!cache)
  const userIdRef = useRef(null)
  const progressRef = useRef({})
  const showToastRef = useRef(showToast)
  showToastRef.current = showToast
  const editingNoteIdRef = useRef(null)

  // Auth user id without a network round-trip every time.
  const getUserId = useCallback(async () => {
    if (userIdRef.current) return userIdRef.current
    try {
      const { data } = await supabase.auth.getSession()
      userIdRef.current = data?.session?.user?.id || null
      if (!userIdRef.current) {
        const { data: u } = await supabase.auth.getUser()
        userIdRef.current = u?.user?.id || null
      }
    } catch { /* handled by caller */ }
    return userIdRef.current
  }, [])

  const loadData = useCallback(async ({ silent = false } = {}) => {
    const seq = ++loadSeq.current
    // Skeleton only when there is truly nothing to show yet.
    if (!silent && !hasDataRef.current) setLoading(true)
    else setRefreshing(true)
    setError('')

    const results = await Promise.allSettled([
      fetchWithRetry((signal) => supabase.from('learning_videos').select('*').order('created_at', { ascending: false }).abortSignal(signal)),
      fetchWithRetry((signal) => supabase.from('learning_progress').select('*').abortSignal(signal)),
      fetchWithRetry((signal) => supabase.from('learning_notes').select(NOTE_LIST_COLUMNS).order('created_at', { ascending: false }).abortSignal(signal)),
      fetchWithRetry((signal) => supabase.from('learning_goals').select('*').order('created_at', { ascending: false }).abortSignal(signal)),
    ])
    if (seq !== loadSeq.current) return // a newer load superseded this one

    const [v, p, n, g] = results
    const failures = results.filter((r) => r.status === 'rejected')

    // A failed query keeps the data we already have — it never wipes the
    // page back to zeros.
    if (v.status === 'fulfilled') { setVideos(v.value); hasDataRef.current = true }
    if (p.status === 'fulfilled') setProgressRows(p.value)
    if (n.status === 'fulfilled') setNotes(n.value)
    if (g.status === 'fulfilled') setGoals(g.value)

    if (failures.length === 0) {
      writeCache({ videos: v.value, progressRows: p.value, notes: n.value, goals: g.value })
    } else {
      const reason = failures[0].reason
      const message = reason?.name === 'AbortError' ? 'The request timed out.' : (reason?.message || 'Could not load Learning Hub data.')
      setError(message)
    }
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { loadYoutubeIframeApi() }, [])

  // If the connection drops and comes back, quietly refresh.
  useEffect(() => {
    const onOnline = () => loadData({ silent: true })
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [loadData])

  // Only the user's own videos — no hardcoded demo/seed content.
  const progressByVideo = useMemo(() => Object.fromEntries(progressRows.map((row) => [row.video_id, row])), [progressRows])
  progressRef.current = progressByVideo
  const mergedVideos = useMemo(() => videos.map((video) => {
    const progress = progressByVideo[video.id]
    return { ...video, watched_seconds: progress?.watched_seconds || 0, completed: !!progress?.completed, favorite: !!progress?.favorite, progress_id: progress?.id || null, progress_percent: video.duration_seconds ? Math.min(100, Math.round(((progress?.watched_seconds || 0) / video.duration_seconds) * 100)) : 0 }
  }), [videos, progressByVideo])

  // Keep the modal's activeVideo in sync once fresh progress arrives —
  // otherwise the "Watched x / y" label goes stale after the first save.
  useEffect(() => {
    if (!activeVideo) return
    const fresh = mergedVideos.find((v) => v.id === activeVideo.id)
    if (fresh && (fresh.watched_seconds !== activeVideo.watched_seconds || fresh.completed !== activeVideo.completed)) setActiveVideo(fresh)
  }, [mergedVideos]) // eslint-disable-line react-hooks/exhaustive-deps

  // Deadline reminder — checked once per visit to this page. There's no
  // backend/push setup here, so this is a best-effort in-app nudge: if
  // anything is due today, overdue, or due within a day, it shows a
  // toast once the data is available.
  useEffect(() => {
    if (remindedRef.current || loading) return
    if (mergedVideos.length === 0) return
    remindedRef.current = true
    const dueSoon = mergedVideos.filter((v) => {
      const info = deadlineInfo(v)
      return info && (info.tone === 'danger' || info.tone === 'warning')
    })
    if (dueSoon.length > 0) {
      showToastRef.current({
        type: 'info',
        title: dueSoon.length === 1 ? 'A video deadline is coming up' : `${dueSoon.length} video deadlines are coming up`,
        description: dueSoon.slice(0, 3).map((v) => v.title).join(', '),
      })
    }
  }, [loading, mergedVideos])

  // Categories are entirely whatever the user has actually typed on
  // their own videos — no preset list baked into the UI anywhere.
  const categoryOptions = useMemo(() => ['All', ...Array.from(new Set(videos.map((v) => v.category).filter(Boolean)))], [videos])

  // Category progress in the sidebar is built purely from categories
  // that actually have videos — no hardcoded placeholders.
  const categoryProgress = useMemo(() => {
    const counts = {}
    mergedVideos.forEach((v) => {
      if (!v.category) return
      if (!counts[v.category]) counts[v.category] = { all: 0, done: 0 }
      counts[v.category].all += 1
      if (v.completed) counts[v.category].done += 1
    })
    return Object.entries(counts)
      .map(([name, c]) => ({ name, all: c.all, done: c.done, percent: c.all ? Math.round((c.done / c.all) * 100) : 0 }))
      .sort((a, b) => b.all - a.all)
      .slice(0, 4)
  }, [mergedVideos])

  const filteredVideos = useMemo(() => {
    let list = mergedVideos.filter((video) => {
      const query = search.trim().toLowerCase()
      if (query && !`${video.title} ${video.channel || ''} ${video.category || ''}`.toLowerCase().includes(query)) return false
      if (category !== 'All' && video.category !== category) return false
      if (tab === 'Completed' && !video.completed) return false
      if (tab === 'In Progress' && (video.completed || video.watched_seconds <= 0)) return false
      if (tab === 'Favorites' && !video.favorite) return false
      return true
    })
    if (sort === 'title') list.sort((a, b) => a.title.localeCompare(b.title))
    if (sort === 'oldest') list.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))
    if (sort === 'newest') list.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    if (sort === 'progress') list.sort((a, b) => b.progress_percent - a.progress_percent)
    return list
  }, [mergedVideos, search, category, tab, sort])
  const watchedSeconds = progressRows.reduce((sum, row) => sum + (Number(row.watched_seconds) || 0), 0)
  const completedCount = mergedVideos.filter((video) => video.completed).length
  const inProgressCount = mergedVideos.filter((video) => !video.completed && video.watched_seconds > 0).length
  const overallProgress = mergedVideos.length ? Math.round((completedCount / mergedVideos.length) * 100) : 0

  // Saves progress and updates local state directly — no full reload, so
  // the page never flashes back to a skeleton after a progress change.
  const updateProgress = useCallback(async (video, patch = {}) => {
    const old = progressRef.current[video.id] || { watched_seconds: 0, completed: false, favorite: false }
    const userId = await getUserId()
    if (!userId) { showToastRef.current({ type: 'error', title: 'Could not update progress', description: 'You are not signed in.' }); return }
    const next = { user_id: userId, video_id: video.id, watched_seconds: old.watched_seconds || 0, completed: old.completed || false, favorite: old.favorite || false, ...patch, updated_at: new Date().toISOString() }
    const { data, error: saveError } = await supabase.from('learning_progress').upsert(next, { onConflict: 'user_id,video_id' }).select().maybeSingle()
    if (saveError) { showToastRef.current({ type: 'error', title: 'Could not update progress', description: saveError.message }); return }
    const saved = data || { ...old, ...next }
    setProgressRows((rows) => {
      const idx = rows.findIndex((r) => r.video_id === video.id)
      if (idx >= 0) { const copy = rows.slice(); copy[idx] = { ...rows[idx], ...saved }; return copy }
      return [...rows, saved]
    })
  }, [getUserId])

  const markCompleted = useCallback(async (video) => {
    const known = progressRef.current[video.id]?.watched_seconds || 0
    await updateProgress(video, { completed: true, watched_seconds: Number(video.duration_seconds) || known })
    showToastRef.current({ type: 'success', title: 'Video completed', description: 'Your learning progress has been updated.' })
  }, [updateProgress])

  /* ---------------- Embedded YouTube player: real watch-time tracking ---------------- */

  useEffect(() => {
    const stopTracking = () => {
      if (watchIntervalRef.current) { clearInterval(watchIntervalRef.current); watchIntervalRef.current = null }
      if (playerRef.current) { try { playerRef.current.destroy() } catch { /* no-op */ } playerRef.current = null }
    }

    if (!activeVideo) { stopTracking(); return }
    const videoId = getYoutubeId(activeVideo.youtube_url)
    if (!videoId) return

    let cancelled = false
    const videoSnapshot = activeVideo
    const saveCurrentTime = () => {
      if (!playerRef.current || typeof playerRef.current.getCurrentTime !== 'function') return
      const t = Math.floor(playerRef.current.getCurrentTime())
      const known = progressRef.current[videoSnapshot.id]?.watched_seconds || 0
      if (t > known) updateProgress(videoSnapshot, { watched_seconds: t })
    }

    const initPlayer = () => {
      if (cancelled || !window.YT) return
      playerRef.current = new window.YT.Player(`yt-player-${videoSnapshot.id}`, {
        videoId,
        playerVars: { rel: 0, origin: window.location.origin },
        events: {
          onReady: () => {
            const known = progressRef.current[videoSnapshot.id]?.watched_seconds || 0
            if (known > 5) {
              try { playerRef.current.seekTo(known, true) } catch { /* no-op */ }
            }
          },
          onStateChange: (e) => {
            if (e.data === window.YT.PlayerState.PLAYING) {
              if (watchIntervalRef.current) clearInterval(watchIntervalRef.current)
              watchIntervalRef.current = setInterval(saveCurrentTime, 10000)
            } else {
              if (watchIntervalRef.current) { clearInterval(watchIntervalRef.current); watchIntervalRef.current = null }
              if (e.data === window.YT.PlayerState.ENDED) markCompleted(videoSnapshot)
              else saveCurrentTime()
            }
          },
        },
      })
    }

    if (window.YT && window.YT.Player) initPlayer()
    else window.onYouTubeIframeAPIReady = initPlayer

    return () => { cancelled = true; stopTracking() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVideo?.id])

  /* ---------------- Notes (rich editor, per-video, editable/deletable) ---------------- */

  const openNoteModal = async (context, existingNote = null) => {
    setNoteModal(context)
    if (existingNote) {
      editingNoteIdRef.current = existingNote.id
      setEditingNoteId(existingNote.id)
      setNoteTitleText(existingNote.note_title || '')
      setNoteTitleColor(existingNote.title_color || '#111827')
      setNoteBlocks(Array.isArray(existingNote.blocks) && existingNote.blocks.length ? existingNote.blocks : [emptyNoteBlock()])
      setNoteTextColor(existingNote.text_color || '#1F2937')
      setNoteBgColor(existingNote.bg_color || '#FFFFFF')
      setNoteImportant(!!existingNote.important)
      if (existingNote.images !== undefined) {
        setNoteImages(existingNote.images || [])
        setNoteImagesLoaded(true)
      } else {
        // Images are not part of the list query — load them for this note only.
        setNoteImages([])
        setNoteImagesLoaded(false)
        const { data, error: imgError } = await supabase.from('learning_notes').select('images').eq('id', existingNote.id).maybeSingle()
        if (editingNoteIdRef.current === existingNote.id) {
          if (!imgError && data) { setNoteImages(data.images || []); setNoteImagesLoaded(true) }
          else showToastRef.current({ type: 'error', title: 'Could not load note images', description: 'You can still edit the text. Existing images will be kept.' })
        }
      }
    } else {
      editingNoteIdRef.current = null
      setEditingNoteId(null)
      setNoteTitleText('')
      setNoteTitleColor('#111827')
      setNoteBlocks([emptyNoteBlock()])
      setNoteTextColor('#1F2937')
      setNoteBgColor('#FFFFFF')
      setNoteImages([])
      setNoteImagesLoaded(true)
      setNoteImportant(false)
    }
  }
  const closeNoteModal = () => { setNoteModal(null); setEditingNoteId(null); editingNoteIdRef.current = null }

  const openViewNote = useCallback(async (note) => {
    setViewingNote(note)
    if (note.images !== undefined) return
    setViewImagesLoading(true)
    const { data } = await supabase.from('learning_notes').select('images').eq('id', note.id).maybeSingle()
    setViewImagesLoading(false)
    if (data) setViewingNote((prev) => (prev && prev.id === note.id ? { ...prev, images: data.images || [] } : prev))
  }, [])

  const addNoteBlock = (type) => setNoteBlocks((b) => [...b, { type, text: '' }])
  const updateNoteBlock = (i, text) => setNoteBlocks((b) => b.map((blk, idx) => (idx === i ? { ...blk, text } : blk)))
  const removeNoteBlock = (i) => setNoteBlocks((b) => (b.length > 1 ? b.filter((_, idx) => idx !== i) : b))
  const handleNoteImageUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const dataUrls = await Promise.all(files.map((f) => compressImage(f).catch(() => fileToDataUrl(f))))
    setNoteImages((prev) => [...prev, ...dataUrls])
    e.target.value = ''
  }
  const removeNoteImage = (i) => setNoteImages((prev) => prev.filter((_, idx) => idx !== i))

  // Runs document.execCommand against whatever text is currently
  // selected inside one of the contentEditable paragraph blocks.
  const applyInlineColor = (color) => document.execCommand('foreColor', false, color)
  const applyList = (type) => document.execCommand(type === 'ordered' ? 'insertOrderedList' : 'insertUnorderedList')

  const saveNote = async (e) => {
    e.preventDefault()
    const userId = await getUserId()
    const cleanBlocks = noteBlocks.filter((b) => htmlToPlainText(b.text).trim())
    if (!userId || (!cleanBlocks.length && !noteImages.length)) {
      showToast({ type: 'error', title: 'Write something first', description: 'Add at least one paragraph or image before saving.' })
      return
    }
    const videoId = noteModal?.id || null
    const plainContent = cleanBlocks.map((b) => (b.type === 'subtitle' ? b.text : htmlToPlainText(b.text))).join('\n\n')
    const payload = {
      video_id: videoId,
      title: noteModal?.title || 'Learning note',
      note_title: noteTitleText.trim() || null,
      title_color: noteTitleColor,
      content: plainContent || null,
      blocks: cleanBlocks,
      text_color: noteTextColor,
      bg_color: noteBgColor,
      important: noteImportant,
    }
    // When editing and the existing images never finished loading, leave
    // the `images` column untouched so they can't be overwritten with [].
    if (!editingNoteId || noteImagesLoaded) payload.images = noteImages

    if (editingNoteId) {
      const { error: saveError } = await supabase.from('learning_notes').update(payload).eq('id', editingNoteId)
      if (saveError) { showToast({ type: 'error', title: 'Could not update note', description: saveError.message }); return }
      showToast({ type: 'success', title: 'Note updated' })
    } else {
      const { error: saveError } = await supabase.from('learning_notes').insert({ user_id: userId, ...payload })
      if (saveError) { showToast({ type: 'error', title: 'Could not save note', description: saveError.message }); return }
      showToast({ type: 'success', title: 'Note saved', description: 'Your learning note was saved.' })
    }
    closeNoteModal()
    await loadData({ silent: true })
  }

  const confirmDeleteNote = async () => {
    if (!deletingNote) return
    const { error: delError } = await supabase.from('learning_notes').delete().eq('id', deletingNote.id)
    if (delError) { showToast({ type: 'error', title: 'Could not delete note', description: delError.message }); setDeletingNote(null); return }
    setDeletingNote(null)
    if (viewingNote?.id === deletingNote.id) setViewingNote(null)
    setNotes((list) => list.filter((n) => n.id !== deletingNote.id))
    await loadData({ silent: true })
    showToast({ type: 'success', title: 'Note deleted' })
  }

  const saveGoal = async (e) => {
    e.preventDefault()
    const userId = await getUserId()
    if (!userId || !goalTitle.trim()) return
    const { error: saveError } = await supabase.from('learning_goals').insert({ user_id: userId, title: goalTitle.trim(), target_videos: Math.max(1, Number(goalTarget) || 1), completed_videos: 0 })
    if (saveError) { showToast({ type: 'error', title: 'Could not save goal', description: saveError.message }); return }
    setGoalModal(false); setGoalTitle(''); setGoalTarget('5'); await loadData({ silent: true })
  }

  /* ---------------- Videos: add / edit / delete ---------------- */

  const handleYoutubeUrlBlur = async () => {
    const url = videoForm.youtube_url.trim()
    if (!url || !getYoutubeId(url)) return
    setFetchingMeta(true)
    const meta = await fetchYoutubeOEmbed(url)
    setFetchingMeta(false)
    if (!meta) {
      showToast({ type: 'error', title: 'Could not fetch video info', description: 'Check the YouTube link, or fill in the details manually.' })
      return
    }
    setVideoForm((f) => ({
      ...f,
      title: f.title.trim() ? f.title : meta.title,
      channel: f.channel.trim() ? f.channel : meta.channel,
      thumbnail_url: meta.thumbnail_url,
    }))
    setMetaFetched(true)
  }

  const openAddVideoModal = () => {
    setEditingVideoId(null)
    setVideoForm(emptyVideoForm)
    setMetaFetched(false)
    setVideoModal(true)
  }
  const openEditVideoModal = (video) => {
    setEditingVideoId(video.id)
    const totalSeconds = Number(video.duration_seconds) || 0
    setVideoForm({
      title: video.title || '',
      youtube_url: video.youtube_url || '',
      channel: video.channel || '',
      category: video.category || '',
      duration_hours: String(Math.floor(totalSeconds / 3600)),
      duration_minutes: String(Math.floor((totalSeconds % 3600) / 60)),
      level: video.level || 'Beginner',
      thumbnail_url: video.thumbnail_url || '',
      description: video.description || '',
      deadline_date: video.deadline_date || '',
    })
    setMetaFetched(false)
    setVideoModal(true)
  }
  const closeVideoModal = () => {
    setVideoModal(false)
    setEditingVideoId(null)
    setVideoForm(emptyVideoForm)
    setMetaFetched(false)
  }

  const saveVideo = async (e) => {
    e.preventDefault()
    const userId = await getUserId()
    if (!userId || !videoForm.title.trim() || !videoForm.youtube_url.trim()) return
    const payload = {
      title: videoForm.title.trim(),
      youtube_url: videoForm.youtube_url.trim(),
      channel: videoForm.channel.trim() || 'YouTube',
      category: videoForm.category.trim() || 'Uncategorized',
      duration_seconds: Math.max(0, (Number(videoForm.duration_hours) || 0) * 3600 + (Number(videoForm.duration_minutes) || 0) * 60),
      level: videoForm.level,
      thumbnail_url: videoForm.thumbnail_url || null,
      description: videoForm.description || null,
      deadline_date: videoForm.deadline_date || null,
    }

    if (editingVideoId) {
      const { error: saveError } = await supabase.from('learning_videos').update(payload).eq('id', editingVideoId)
      if (saveError) { showToast({ type: 'error', title: 'Could not update video', description: saveError.message }); return }
      showToast({ type: 'success', title: 'Video updated' })
    } else {
      const { error: saveError } = await supabase.from('learning_videos').insert({ user_id: userId, ...payload })
      if (saveError) { showToast({ type: 'error', title: 'Could not add video', description: saveError.message }); return }
      showToast({ type: 'success', title: 'Video added', description: 'The video is now in your Learning Hub.' })
    }
    closeVideoModal()
    await loadData({ silent: true })
  }

  const confirmDeleteVideo = async () => {
    if (!deletingVideo) return
    const { error: delError } = await supabase.from('learning_videos').delete().eq('id', deletingVideo.id)
    if (delError) { showToast({ type: 'error', title: 'Could not delete video', description: delError.message }); setDeletingVideo(null); return }
    const removedId = deletingVideo.id
    setDeletingVideo(null)
    if (activeVideo?.id === removedId) setActiveVideo(null)
    setVideos((list) => list.filter((v) => v.id !== removedId))
    await loadData({ silent: true })
    showToast({ type: 'success', title: 'Video deleted' })
  }

  const videoNotes = (videoId) => notes.filter((n) => n.video_id === videoId)

  return <div className="flex min-h-screen bg-[#f6f9ff] font-sans antialiased text-slate-900" style={{ fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
    <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
    <div className="flex min-w-0 flex-1 flex-col">
      <Topbar onMenuClick={() => setSidebarOpen(true)} accounts={accounts.map((a) => ({ id: a.id, label: a.name, status: a.mt5_connected ? 'connected' : 'disconnected' }))} selectedAccount={accounts[0] ? { label: accounts[0].name } : { label: 'No Account' }} onSelectAccount={() => {}} breadcrumb="Learning / Learning Hub" />
      <main className="mx-auto w-full max-w-[1800px] flex-1 px-3 py-4 sm:px-4 lg:px-5">
        <div className="mb-4 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_318px]">
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-blue-100 bg-white px-4 py-3 shadow-sm"><Search size={18} className="shrink-0 text-blue-500" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search videos, topics, or keywords..." className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" /></label>
              <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm"><Youtube size={16} className="text-red-500" /><select value={source} onChange={(e) => setSource(e.target.value)} className="bg-transparent outline-none"><option>YouTube</option><option>All Sources</option></select><ChevronDown size={14} className="text-slate-400" /></div>
              <button onClick={openAddVideoModal} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"><Plus size={16} /> Add Video</button>
            </div>
            <section className="relative overflow-hidden rounded-xl bg-[#06152c] p-5 text-white shadow-sm sm:p-6">
              <div className="pointer-events-none absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 75% 20%, #1d4ed8 0, transparent 35%), linear-gradient(110deg, transparent 35%, #0e7490 100%)' }} />
              <div className="relative z-10 max-w-4xl">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600"><BookOpen size={17} /></span> Learning Hub</div>
                <h1 className="text-2xl font-extrabold tracking-tight sm:text-[28px]">Learn <span className="px-1 text-blue-300">·</span> <span className="text-indigo-300">Improve</span> <span className="px-1 text-blue-300">·</span> <span className="text-sky-300">Become a Better</span> Trader</h1>
                <p className="mt-2 text-sm text-blue-100">Watch, take notes, and track your progress. Turn knowledge into skill.</p>
                <div className="mt-5 grid grid-cols-2 gap-3 rounded-xl border border-white/10 bg-slate-950/50 p-3 sm:grid-cols-5">
                  <Metric icon={Video} label="Total Videos" value={mergedVideos.length} />
                  <Metric icon={CheckCircle2} label="Completed" value={completedCount} />
                  <Metric icon={Clock3} label="In Progress" value={inProgressCount} />
                  <Metric icon={Clock3} label="Total Watch Time" value={formatWatchTime(watchedSeconds)} />
                  <Metric icon={Flame} label="Learning Streak" value="—" />
                </div>
              </div>
            </section>
            <Panel className="p-3">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex flex-wrap gap-5">{FILTER_TABS.map((item) => <button key={item} onClick={() => setTab(item)} className={`border-b-2 px-1 pb-2 text-sm font-medium ${tab === item ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{item}</button>)}</div>
                <div className="flex gap-2"><select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-blue-100 bg-white px-3 py-2 text-xs outline-none"><option value="All">All Categories</option>{categoryOptions.slice(1).map((c) => <option key={c}>{c}</option>)}</select><select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-lg border border-blue-100 bg-white px-3 py-2 text-xs outline-none">{SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select></div>
              </div>
              {categoryOptions.length > 1 ? (
                <div className="flex flex-wrap items-center gap-2 pt-3">{categoryOptions.slice(categoryPage * 5, categoryPage * 5 + 5).map((item) => <button key={item} onClick={() => setCategory(item)} className={`rounded-full border px-3 py-1.5 text-xs ${category === item ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-blue-100 bg-slate-50 text-slate-600 hover:border-blue-300'}`}>{item}</button>)}{categoryOptions.length > 5 && <button onClick={() => setCategoryPage((p) => (p + 1) % Math.ceil(categoryOptions.length / 5))} className="ml-auto rounded-full p-1.5 text-blue-600 hover:bg-blue-50" aria-label="More categories"><ChevronRight size={17} /></button>}</div>
              ) : (
                <p className="pt-3 text-xs text-slate-400">Categories you type on your videos will show up here as quick filters.</p>
              )}
            </Panel>
            <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-bold"><span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-600 text-white"><Play size={13} fill="currentColor" /></span> Continue Learning</h2><span className="flex items-center gap-1.5 text-xs text-blue-600">{refreshing && <RefreshCw size={12} className="animate-spin" />}{filteredVideos.length} videos</span></div>
            {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{hasDataRef.current ? 'Connection problem — showing your last saved data.' : error} <button onClick={() => loadData()} className="ml-2 font-semibold underline">Retry</button><p className="mt-1 text-xs">{error}</p></div>}
            {loading ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{[1,2,3].map((n) => <div key={n} className="h-60 animate-pulse rounded-xl border border-slate-200 bg-white" />)}</div> : filteredVideos.length === 0 ? <Panel className="p-10 text-center"><BookOpen className="mx-auto mb-3 text-slate-300" size={30} /><p className="font-semibold">No videos found</p><p className="mt-1 text-sm text-slate-500">Try another category or add a YouTube video.</p></Panel> : <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{filteredVideos.map((video) => <VideoCard key={video.id} video={video} notes={videoNotes(video.id)} onOpen={() => setActiveVideo(video)} onComplete={() => markCompleted(video)} onFavorite={() => updateProgress(video, { favorite: !video.favorite })} onNote={() => openNoteModal(video)} onViewNote={openViewNote} onEditNote={(note) => openNoteModal({ id: note.video_id, title: note.title }, note)} onEdit={() => openEditVideoModal(video)} onDelete={() => setDeletingVideo(video)} />)}</div>}
          </div>
          <aside className="flex flex-col gap-3">
            <Panel className="p-4">
              <h2 className="text-sm font-bold">Your Learning Progress</h2>
              <div className="mt-3 flex items-center gap-4"><div className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full" style={{ background: `conic-gradient(#2875ed ${overallProgress * 3.6}deg, #e4edfc 0deg)` }}><div className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-white text-sm font-semibold text-slate-700">{overallProgress}%</div></div><p className="text-xs text-slate-500">{completedCount} of {mergedVideos.length} videos completed</p></div>
              <div className="mt-4 space-y-4">
                {categoryProgress.map((item, index) => <div key={item.name}><div className="mb-1.5 flex items-center justify-between gap-2 text-[11px]"><span className="font-medium text-slate-700">{item.name}</span><span className="text-slate-400">{item.done}/{item.all} · {item.percent}%</span></div><ProgressLine value={item.percent} color={['bg-blue-600','bg-emerald-500','bg-violet-500','bg-orange-500'][index]} /></div>)}
                {categoryProgress.length === 0 && <p className="text-xs text-slate-400">Add videos to see category progress.</p>}
              </div>
            </Panel>
            <Panel className="p-4"><div className="flex items-center gap-2"><Target size={22} className="text-blue-500" /><div><h2 className="text-sm font-bold">Learning Goals</h2><p className="mt-1 text-[10px] text-slate-500">Set your learning goals and stay consistent.</p></div></div><button onClick={() => setGoalModal(true)} className="mt-4 w-full rounded-lg border border-indigo-100 bg-indigo-50/70 py-2.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"><Plus size={13} className="mr-1 inline" /> Set New Goal</button>{goals.length > 0 && <div className="mt-3 space-y-3">{goals.slice(0,3).map((goal) => <div key={goal.id}><div className="mb-1 flex justify-between gap-2 text-xs"><span className="font-medium">{goal.title}</span><span className="text-slate-500">{Math.min(completedCount, goal.target_videos)}/{goal.target_videos}</span></div><ProgressLine value={goal.target_videos ? Math.min(100, completedCount / goal.target_videos * 100) : 0} /></div>)}</div>}</Panel>
            <Panel className="p-4"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-bold">Recently Watched</h2><button onClick={() => setTab('In Progress')} className="text-[11px] text-blue-600">View all →</button></div><div className="space-y-3">{mergedVideos.filter((v) => v.watched_seconds > 0 || v.completed).slice(0,5).map((video) => <button key={video.id} onClick={() => setActiveVideo(video)} className="flex w-full items-center gap-3 text-left"><Thumbnail video={video} small /><span className="min-w-0 flex-1"><span className="line-clamp-1 block text-[11px] font-medium text-slate-700">{video.title}</span><span className="mt-1 block text-[10px] text-slate-400">{video.completed ? 'Completed' : `${formatDuration(video.watched_seconds)} / ${formatDuration(video.duration_seconds)}`}</span><span className="mt-1 block"><ProgressLine value={video.progress_percent} /></span></span>{video.completed && <CheckCircle2 size={15} className="text-emerald-500" />}</button>)}{mergedVideos.every((v) => !v.watched_seconds && !v.completed) && <p className="text-xs text-slate-500">Videos you watch will appear here.</p>}</div></Panel>
            <div className="relative overflow-hidden rounded-xl border border-blue-100 bg-gradient-to-br from-white to-indigo-50 p-5"><Sparkles size={18} className="text-indigo-500" /><p className="mt-3 max-w-[180px] text-sm font-bold leading-5 text-slate-800">Small steps every day lead to big results.</p><p className="mt-2 text-[11px] text-slate-500">Keep learning, keep growing.</p><div className="mt-5 flex justify-end text-blue-300"><Target size={44} /></div></div>
          </aside>
        </div>
      </main>
    </div>

    {activeVideo && <Modal title={activeVideo.title} onClose={() => setActiveVideo(null)}>
      <div className="space-y-4">
        {getYoutubeId(activeVideo.youtube_url) ? (
          <div className="aspect-video w-full overflow-hidden rounded-xl bg-slate-900">
            <div id={`yt-player-${activeVideo.id}`} className="h-full w-full" />
          </div>
        ) : <Thumbnail video={activeVideo} large />}
        <p className="text-sm text-slate-600">{activeVideo.description || `${activeVideo.channel || 'YouTube'} · ${activeVideo.category}`}</p>
        <p className="text-xs text-slate-400">{activeVideo.completed ? 'Completed' : `Watched ${formatDuration(activeVideo.watched_seconds)} / ${formatDuration(activeVideo.duration_seconds)} · ${activeVideo.progress_percent}%`}</p>
        <div className="flex flex-wrap gap-2">
          <a href={activeVideo.youtube_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Open on YouTube.com <ExternalLink size={15} /></a>
          <button onClick={() => openNoteModal(activeVideo)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium">Take Notes</button>
          <button onClick={() => markCompleted(activeVideo)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700">Mark Completed</button>
          <button onClick={() => { setActiveVideo(null); openEditVideoModal(activeVideo) }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium">Edit</button>
          <button onClick={() => setDeletingVideo(activeVideo)} className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700">Delete</button>
        </div>
        <div className="border-t border-slate-100 pt-3">
          <p className="mb-2 text-xs font-semibold text-slate-500">Notes for this video</p>
          {videoNotes(activeVideo.id).length === 0 ? (
            <p className="text-xs text-slate-400">No notes yet for this video.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {videoNotes(activeVideo.id).map((n) => (
                <button key={n.id} onClick={() => openViewNote(n)} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 text-left hover:bg-slate-50">
                  <span className="line-clamp-1 text-xs font-medium" style={{ color: n.title_color || '#334155' }}>{n.note_title || 'Note'} <span className="font-normal text-slate-400">· {new Date(n.created_at).toLocaleDateString()}</span></span>
                  <ChevronRight size={14} className="shrink-0 text-slate-400" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>}

    {noteModal && <Modal title={editingNoteId ? 'Edit Note' : 'Save Learning Note'} onClose={closeNoteModal}>
      <form onSubmit={saveNote} className="space-y-4">
        <p className="text-xs text-slate-500">{noteModal.title || 'General learning note'}</p>

        <label className="block text-xs font-medium">Note Title (optional)
          <div className="mt-1 flex items-center gap-2">
            <input value={noteTitleText} onChange={(e) => setNoteTitleText(e.target.value)} placeholder="e.g. Key takeaways" style={{ color: noteTitleColor }} className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-bold" />
            <input type="color" value={noteTitleColor} onChange={(e) => setNoteTitleColor(e.target.value)} title="Title color" className="h-10 w-10 shrink-0 cursor-pointer rounded-lg border border-slate-200" />
          </div>
        </label>

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs font-medium">Note background<input type="color" value={noteBgColor} onChange={(e) => setNoteBgColor(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-slate-200" /></label>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-600">Select text in a paragraph below, then click a color to highlight it, or use the list buttons:</p>
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-1.5">
            {TEXT_COLOR_SWATCHES.map((c) => (
              <button key={c} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => applyInlineColor(c)} title={`Color text ${c}`} className="h-6 w-6 rounded-full border border-slate-200" style={{ background: c }} />
            ))}
            <input type="color" onMouseDown={(e) => e.preventDefault()} onChange={(e) => applyInlineColor(e.target.value)} title="Custom color" className="h-6 w-7 cursor-pointer rounded border border-slate-200" />
            <span className="mx-1 h-5 w-px bg-slate-200" />
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => applyList('bullet')} className="rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">• Bullets</button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => applyList('ordered')} className="rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">1. Numbered</button>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-slate-200 p-3" style={{ background: noteBgColor }}>
          {noteBlocks.map((block, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-2 shrink-0 rounded bg-slate-900/5 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">{block.type}</span>
              {block.type === 'subtitle' ? (
                <input value={block.text} onChange={(e) => updateNoteBlock(i, e.target.value)} placeholder="Subtitle…" className="flex-1 bg-transparent text-sm font-bold text-slate-800 outline-none" />
              ) : (
                <RichParagraphBlock html={block.text} onChange={(html) => updateNoteBlock(i, html)} />
              )}
              {noteBlocks.length > 1 && <button type="button" onClick={() => removeNoteBlock(i)} className="mt-1 shrink-0 text-slate-400 hover:text-rose-500"><X size={14} /></button>}
            </div>
          ))}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={() => addNoteBlock('subtitle')} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50">+ Subtitle</button>
            <button type="button" onClick={() => addNoteBlock('paragraph')} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50">+ Paragraph</button>
          </div>
        </div>

        <label className="block text-xs font-medium">Images / Screenshots {!noteImagesLoaded && <span className="ml-1 inline-flex items-center gap-1 font-normal text-slate-400"><LoaderCircle size={11} className="animate-spin" /> Loading existing images…</span>}
          <input type="file" accept="image/*" multiple disabled={!noteImagesLoaded} onChange={handleNoteImageUpload} className="mt-1 block w-full text-xs file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium disabled:opacity-50" />
        </label>
        {noteImages.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {noteImages.map((src, i) => (
              <div key={i} className="relative aspect-square overflow-hidden rounded-lg border border-slate-200">
                <img src={src} alt="" className="h-full w-full object-cover" />
                <button type="button" onClick={() => removeNoteImage(i)} className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-slate-600 hover:text-rose-600"><X size={12} /></button>
              </div>
            ))}
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={noteImportant} onChange={(e) => setNoteImportant(e.target.checked)} /> Mark as important</label>
        <div className="flex justify-end gap-2"><button type="button" onClick={closeNoteModal} className="rounded-lg border px-4 py-2 text-sm">Cancel</button><button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">{editingNoteId ? 'Save Changes' : 'Save Note'}</button></div>
      </form>
    </Modal>}

    {viewingNote && <Modal title={<span style={{ color: viewingNote.title_color || '#111827' }}>{viewingNote.note_title || viewingNote.title || 'Learning note'}</span>} onClose={() => setViewingNote(null)}>
      <div className="space-y-3 rounded-xl p-3" style={{ background: viewingNote.bg_color || '#ffffff' }}>
        {(Array.isArray(viewingNote.blocks) ? viewingNote.blocks : []).map((b, i) => b.type === 'subtitle'
          ? <h4 key={i} className="text-base font-bold text-slate-800">{b.text}</h4>
          : <div key={i} className="whitespace-pre-wrap text-sm leading-6 text-slate-700 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{ __html: b.text }} />
        )}
        {!(viewingNote.blocks?.length) && viewingNote.content && <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{viewingNote.content}</p>}
        {viewImagesLoading && <p className="flex items-center gap-1.5 text-[11px] text-slate-400"><LoaderCircle size={12} className="animate-spin" /> Loading images…</p>}
        {viewingNote.images?.length > 0 && (
          <div className="grid grid-cols-3 gap-2 pt-2">
            {viewingNote.images.map((src, i) => (
              <button key={i} type="button" onClick={() => setLightboxImage(src)} className="aspect-square overflow-hidden rounded-lg border border-slate-200">
                <img src={src} alt="" className="h-full w-full object-cover transition hover:scale-105" />
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={() => { const n = viewingNote; setViewingNote(null); openNoteModal({ id: n.video_id, title: n.title }, n) }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50">Edit</button>
        <button onClick={() => setDeletingNote(viewingNote)} className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100">Delete</button>
      </div>
    </Modal>}
    {lightboxImage && <ImageLightbox src={lightboxImage} onClose={() => setLightboxImage(null)} />}

    {deletingNote && <Modal title="Delete this note?" onClose={() => setDeletingNote(null)}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Delete this note? This can't be undone.</p>
        <div className="flex justify-end gap-2"><button onClick={() => setDeletingNote(null)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button><button onClick={confirmDeleteNote} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">Delete</button></div>
      </div>
    </Modal>}

    {goalModal && <Modal title="Set a Learning Goal" onClose={() => setGoalModal(false)}><form onSubmit={saveGoal} className="space-y-4"><label className="block text-sm font-medium">Goal name<input value={goalTitle} onChange={(e) => setGoalTitle(e.target.value)} required placeholder="e.g. Finish Market Structure course" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-blue-400" /></label><label className="block text-sm font-medium">Target videos<input type="number" min="1" value={goalTarget} onChange={(e) => setGoalTarget(e.target.value)} required className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-normal outline-none focus:border-blue-400" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setGoalModal(false)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button><button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Save Goal</button></div></form></Modal>}

    {videoModal && <Modal title={editingVideoId ? 'Edit Video' : 'Add YouTube Video'} onClose={closeVideoModal}>
      <form onSubmit={saveVideo} className="space-y-3">
        <label className="block text-xs font-medium">YouTube URL
          <div className="relative mt-1">
            <input
              required
              type="url"
              value={videoForm.youtube_url}
              onChange={(e) => { setVideoForm({ ...videoForm, youtube_url: e.target.value }); setMetaFetched(false) }}
              onBlur={handleYoutubeUrlBlur}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 pr-9 text-sm font-normal"
            />
            {fetchingMeta && <LoaderCircle size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-blue-500" />}
          </div>
          <span className="mt-1 block text-[10px] font-normal text-slate-400">
            {fetchingMeta ? 'Fetching title, channel and thumbnail from YouTube…' : metaFetched ? '✓ Title, channel and thumbnail filled in from the link — edit if needed.' : 'Paste the link and the details below fill in automatically.'}
          </span>
        </label>
        {videoForm.thumbnail_url && (
          <img src={videoForm.thumbnail_url} alt="" className="aspect-video w-full rounded-lg border border-slate-200 object-cover" />
        )}
        <label className="block text-xs font-medium">Video title<input required value={videoForm.title} onChange={(e) => setVideoForm({ ...videoForm, title: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal" /></label>
        <label className="block text-xs font-medium">Channel<input value={videoForm.channel} onChange={(e) => setVideoForm({ ...videoForm, channel: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium">Category
            <input
              list="categorySuggestions"
              value={videoForm.category}
              onChange={(e) => setVideoForm({ ...videoForm, category: e.target.value })}
              placeholder="Type your own category"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal"
            />
            <datalist id="categorySuggestions">
              {categoryOptions.slice(1).map((c) => <option key={c} value={c} />)}
            </datalist>
          </label>
          <label className="block text-xs font-medium">Level<select value={videoForm.level} onChange={(e) => setVideoForm({ ...videoForm, level: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2.5 text-sm font-normal"><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
        </div>
        <div>
          <p className="text-xs font-medium">Duration</p>
          <div className="mt-1 grid grid-cols-2 gap-3">
            <label className="block text-[10px] font-medium text-slate-500">Hours
              <input type="number" min="0" value={videoForm.duration_hours} onChange={(e) => setVideoForm({ ...videoForm, duration_hours: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal" />
            </label>
            <label className="block text-[10px] font-medium text-slate-500">Minutes
              <input type="number" min="0" max="59" value={videoForm.duration_minutes} onChange={(e) => setVideoForm({ ...videoForm, duration_minutes: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal" />
            </label>
          </div>
          <span className="mt-1 block text-[10px] font-normal text-slate-400">YouTube doesn't expose duration without a paid API key — enter it manually. Actual progress still tracks automatically once you watch it here.</span>
        </div>
        <label className="block text-xs font-medium">Deadline (optional)
          <input type="date" value={videoForm.deadline_date} onChange={(e) => setVideoForm({ ...videoForm, deadline_date: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal" />
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {[1, 3, 7].map((d) => (
              <button key={d} type="button" onClick={() => setVideoForm((f) => ({ ...f, deadline_date: addDaysIso(d) }))} className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50">{d} day{d > 1 ? 's' : ''}</button>
            ))}
            {videoForm.deadline_date && <button type="button" onClick={() => setVideoForm((f) => ({ ...f, deadline_date: '' }))} className="rounded-lg px-2 py-1 text-[10px] font-medium text-rose-500 hover:bg-rose-50">Clear</button>}
          </div>
          <span className="mt-1 block text-[10px] font-normal text-slate-400">You'll get a reminder here when it's due soon or overdue.</span>
        </label>
        <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={closeVideoModal} className="rounded-lg border px-4 py-2 text-sm">Cancel</button><button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">{editingVideoId ? 'Save Changes' : 'Add Video'}</button></div>
      </form>
    </Modal>}

    {deletingVideo && <Modal title="Delete this video?" onClose={() => setDeletingVideo(null)}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">Remove <span className="font-semibold text-slate-900">{deletingVideo.title}</span> from your Learning Hub? Its progress and notes will be removed too. This can't be undone.</p>
        <div className="flex justify-end gap-2"><button onClick={() => setDeletingVideo(null)} className="rounded-lg border px-4 py-2 text-sm">Cancel</button><button onClick={confirmDeleteVideo} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">Delete</button></div>
      </div>
    </Modal>}
  </div>
}

function Metric({ icon: Icon, label, value }) {
  return <div className="flex items-center gap-2 border-white/5 px-1 py-1 sm:border-r"><span className="text-blue-400"><Icon size={20} /></span><div><p className="text-[10px] text-blue-200">{label}</p><p className="text-sm font-bold text-white">{value}</p></div></div>
}
function Thumbnail({ video, small = false, large = false, compact = false }) {
  const src = thumbnailFor(video)
  if (large) return <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-900">{src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-950 to-blue-900 text-blue-200"><Video size={38} /></div>}</div>
  return <div className={`${small ? 'h-12 w-[72px]' : compact ? 'aspect-[2/1]' : 'aspect-video'} relative shrink-0 overflow-hidden rounded-lg bg-slate-900`}>{src ? <img src={src} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-950 to-blue-900 text-blue-300"><Video size={small ? 16 : 26} /></div>}{!small && <span className="absolute bottom-1 right-1 rounded bg-slate-950/90 px-1.5 py-0.5 text-[10px] text-white">{formatDuration(video.duration_seconds)}</span>}</div>
}
function VideoCard({ video, notes = [], onOpen, onComplete, onFavorite, onNote, onViewNote, onEditNote, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [showAllNotes, setShowAllNotes] = useState(false)
  const [expandedNoteId, setExpandedNoteId] = useState(null)
  const deadline = deadlineInfo(video)
  const deadlineTone = deadline?.tone === 'danger' ? 'bg-red-50 text-red-700' : deadline?.tone === 'warning' ? 'bg-amber-50 text-amber-700' : 'bg-slate-50 text-slate-600'
  const visibleNotes = showAllNotes ? notes : notes.slice(0, 2)
  return <article className="flex h-full flex-col rounded-xl border border-blue-100/80 bg-white p-2.5 shadow-[0_2px_8px_rgba(37,99,235,0.05)] transition hover:-translate-y-0.5 hover:shadow-md">
    <button onClick={onOpen} className="group block w-full text-left"><div className="relative overflow-hidden rounded-lg"><Thumbnail video={video} compact /><span className="absolute inset-0 flex items-center justify-center bg-slate-950/0 text-white transition group-hover:bg-slate-950/20"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 opacity-0 shadow-lg transition group-hover:opacity-100"><Play size={16} fill="currentColor" /></span></span></div></button>
    <div className="flex items-start gap-2 pt-2.5">
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[10px] font-bold text-indigo-700">{(video.channel || 'Y').slice(0,1).toUpperCase()}</div>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left"><h3 className="line-clamp-2 min-h-[2.5rem] text-xs font-semibold leading-5 text-slate-800">{video.title}</h3><p className="line-clamp-1 text-[10px] text-slate-400">{video.channel || 'YouTube'}</p></button>
      <button onClick={onFavorite} title={video.favorite ? 'Remove favorite' : 'Add favorite'} className={`rounded p-1 ${video.favorite ? 'text-rose-500' : 'text-slate-400 hover:text-rose-500'}`}><Heart size={15} fill={video.favorite ? 'currentColor' : 'none'} /></button>
      <div className="relative">
        <button onClick={() => setMenuOpen((o) => !o)} title="More options" className="rounded p-1 text-slate-400 hover:text-blue-600"><MoreVertical size={15} /></button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-7 z-20 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              <button onClick={() => { setMenuOpen(false); onNote() }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"><StickyNote size={13} /> Take Notes</button>
              <button onClick={() => { setMenuOpen(false); onEdit() }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-slate-50"><Pencil size={13} /> Edit</button>
              <button onClick={() => { setMenuOpen(false); onDelete() }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-rose-600 hover:bg-rose-50"><Trash2 size={13} /> Delete</button>
            </div>
          </>
        )}
      </div>
    </div>
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-700">{video.category}</span>
      <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">{video.level || 'All levels'}</span>
      {deadline && <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${deadlineTone}`}><CalendarClock size={11} /> {deadline.label}</span>}
    </div>
    <div className="mt-2.5"><div className="mb-1 flex justify-between text-[10px] text-slate-400"><span>{video.completed ? 'Completed' : video.watched_seconds ? `Watched ${formatDuration(video.watched_seconds)} / ${formatDuration(video.duration_seconds)}` : 'Not started'}</span><span>{video.completed ? '100%' : `${video.progress_percent}%`}</span></div><ProgressLine value={video.completed ? 100 : video.progress_percent} /></div>
    <button onClick={onOpen} className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700">{video.completed ? 'Review Video' : video.watched_seconds ? 'Continue Watching' : 'Start Learning'} <ChevronRight size={14} /></button>
    <button onClick={onComplete} className="mt-1.5 w-full text-[10px] font-medium text-emerald-600 hover:text-emerald-700">{video.completed ? '✓ Completed' : 'Mark as completed'}</button>

    {/* Notes for THIS video only. Collapsed = first two lines (with "..."); click a note to read it in full, click again to fold it back. */}
    <div className="mt-auto border-t border-slate-100 pt-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
          <StickyNote size={12} className="text-blue-600" /> Notes
          <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">{notes.length}</span>
        </span>
        <button onClick={onNote} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold text-blue-600 hover:bg-blue-50"><Plus size={11} /> Take Notes</button>
      </div>
      {notes.length === 0 ? (
        <p className="text-[10px] text-slate-400">No notes for this video yet.</p>
      ) : (
        <div className="space-y-1.5">
          {visibleNotes.map((note) => {
            const expanded = expandedNoteId === note.id
            const preview = note.content || ''
            const hasBlocks = Array.isArray(note.blocks) && note.blocks.length > 0
            const isLong = preview.length > 90 || preview.includes('\n')
            return (
              <div key={note.id} className="rounded-lg border border-slate-100 px-2 py-1.5" style={{ background: note.bg_color || '#ffffff' }}>
                <div className="flex items-start gap-1">
                  <button onClick={() => setExpandedNoteId(expanded ? null : note.id)} aria-expanded={expanded} className="min-w-0 flex-1 text-left">
                    <span className="flex items-center gap-1.5">
                      <span className="line-clamp-1 text-[11px] font-semibold" style={{ color: note.title_color || '#334155' }}>{note.note_title || 'Note'}</span>
                      {note.important && <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">Important</span>}
                    </span>
                    {!expanded && <span className="line-clamp-2 block text-[10px] leading-4 text-slate-500">{preview || 'Image note'}</span>}
                    <span className="mt-0.5 flex items-center justify-between text-[9px] text-slate-400">
                      <span>{new Date(note.created_at).toLocaleDateString()}</span>
                      {(isLong || expanded) && <span className="inline-flex items-center gap-0.5 font-medium text-blue-600">{expanded ? 'Show less' : 'Read more'}<ChevronDown size={10} className={expanded ? 'rotate-180 transition' : 'transition'} /></span>}
                    </span>
                  </button>
                  <button onClick={() => onEditNote(note)} title="Edit note" className="shrink-0 rounded p-1 text-slate-400 hover:bg-white hover:text-blue-600"><Pencil size={12} /></button>
                </div>
                {expanded && (
                  <div className="mt-1.5 space-y-1.5 border-t border-slate-100 pt-1.5">
                    {hasBlocks ? note.blocks.map((b, i) => b.type === 'subtitle'
                      ? <h4 key={i} className="text-[11px] font-bold text-slate-800">{b.text}</h4>
                      : <div key={i} className="whitespace-pre-wrap text-[11px] leading-5 text-slate-700 [&_ol]:list-decimal [&_ol]:pl-4 [&_ul]:list-disc [&_ul]:pl-4" dangerouslySetInnerHTML={{ __html: b.text }} />
                    ) : (
                      <p className="whitespace-pre-wrap text-[11px] leading-5 text-slate-700">{preview || 'This note only contains images.'}</p>
                    )}
                    <div className="flex items-center justify-between pt-0.5">
                      <button onClick={() => setExpandedNoteId(null)} className="text-[10px] font-medium text-slate-500 hover:text-slate-700">Collapse</button>
                      <button onClick={() => onViewNote(note)} className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-600 hover:text-blue-700"><ExternalLink size={10} /> Open note &amp; images</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {notes.length > 2 && (
            <button onClick={() => setShowAllNotes((v) => !v)} className="text-[10px] font-medium text-blue-600 hover:text-blue-700">{showAllNotes ? 'Show less' : `Show all ${notes.length} notes`}</button>
          )}
        </div>
      )}
    </div>
  </article>
}