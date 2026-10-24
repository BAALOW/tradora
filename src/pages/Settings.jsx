import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bell, Palette, Pencil, Save, Sun, Trash2, User, X } from 'lucide-react'

import Sidebar from '../components/layout/Sidebar'
import Topbar from '../components/layout/Topbar'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import AvatarCropModal from '../components/ui/AvatarCropModal'
import NotificationsCard from '../components/settings/NotificationsCard'

import { useAuth } from '../contexts/AuthContext'
import { useAccounts } from '../hooks/useAccounts'
import { supabase } from '../lib/supabaseClient'
import { applyTheme } from '../lib/theme'

/* ------------------------------------------------------------------ */
/* Constants                                                            */
/* ------------------------------------------------------------------ */

const PREFS_KEY = 'tradora_prefs'
const AVATAR_BUCKET = 'avatars'
const AVATAR_MAX_BYTES = 5 * 1024 * 1024 // faylka la doortay ugu badnaan 5MB (waa la yareynayaa 256px)

// Notification settings hadda waxay ku kaydsan yihiin table-ka `notification_preferences` (eeg NotificationsCard)
const DEFAULT_PREFS = { theme: 'light' }

const COUNTRIES = [
  'Somalia', 'Kenya', 'Ethiopia', 'Djibouti', 'Uganda', 'Tanzania', 'Egypt', 'Saudi Arabia',
  'United Arab Emirates', 'Qatar', 'Turkey', 'United Kingdom', 'United States', 'Canada', 'Germany',
]
const THEMES = [['light', 'Light (White)'], ['dark', 'Dark'], ['system', 'System']]

const TABS = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'preferences', label: 'Preferences', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
]

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

const loadPrefs = (meta) => {
  let local = {}
  try { local = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') } catch { /* ignore */ }
  const remote = meta?.preferences || {}
  return { ...DEFAULT_PREFS, ...remote, ...local }
}

const getTimezones = () => {
  try {
    const list = Intl.supportedValuesOf('timeZone')
    if (list?.length) return list
  } catch { /* ignore */ }
  return ['Africa/Mogadishu', 'Africa/Nairobi', 'Africa/Addis_Ababa', 'Africa/Cairo', 'Asia/Riyadh', 'Asia/Dubai', 'Europe/London', 'America/New_York', 'UTC']
}

const tzLabel = (tz) => {
  try {
    const abbr = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date()).find((p) => p.type === 'timeZoneName')?.value
    return abbr ? `(${abbr}) ${tz}` : tz
  } catch { return tz }
}

const initialsOf = (name) => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'U'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

/* ------------------------------------------------------------------ */
/* UI pieces                                                            */
/* ------------------------------------------------------------------ */

const inputCls =
  'h-11 w-full rounded-xl border border-border bg-white px-3 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:cursor-not-allowed disabled:bg-surface disabled:text-text-muted'

function Field({ label, children, hint }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-text-secondary">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-text-muted">{hint}</span>}
    </label>
  )
}

function CardHead({ icon: Icon, title, sub }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-brand"><Icon className="h-5 w-5" /></div>
      <div>
        <h3 className="text-[16px] font-semibold text-text-primary">{title}</h3>
        {sub && <p className="text-xs text-text-muted">{sub}</p>}
      </div>
    </div>
  )
}

function PrefRow({ icon: Icon, label, children }) {
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 sm:grid-cols-[auto_1fr_minmax(0,220px)]">
      <Icon className="h-[18px] w-[18px] text-brand" />
      <span className="text-sm font-medium text-text-primary">{label}</span>
      <div className="col-span-2 sm:col-span-1">{children}</div>
    </div>
  )
}

function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      {options.map((o) => {
        const [v, l] = Array.isArray(o) ? o : [o, o]
        return <option key={v} value={v}>{l}</option>
      })}
    </select>
  )
}

function MountainBanner() {
  return (
    <div className="relative hidden h-[88px] w-full max-w-[480px] overflow-hidden rounded-2xl border border-border bg-gradient-to-r from-blue-50 via-white to-sky-100 lg:block">
      <svg className="absolute bottom-0 right-0 h-full w-[55%]" viewBox="0 0 260 90" preserveAspectRatio="xMaxYMax slice" aria-hidden="true">
        <defs>
          <linearGradient id="mtnA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#93C5FD" /><stop offset="1" stopColor="#2563EB" /></linearGradient>
          <linearGradient id="mtnB" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#BFDBFE" /><stop offset="1" stopColor="#60A5FA" /></linearGradient>
        </defs>
        <polygon points="40,90 120,18 160,52 190,30 260,90" fill="url(#mtnB)" />
        <polygon points="90,90 170,8 250,90" fill="url(#mtnA)" />
        <polygon points="170,8 150,34 165,28 172,40 182,26 195,38" fill="#fff" opacity="0.9" />
      </svg>
      <div className="relative z-10 flex h-full max-w-[60%] flex-col justify-center px-5">
        <p className="text-[11px] italic leading-snug text-text-secondary">“A little adjustment today can make a big difference tomorrow.”</p>
        <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-text-muted">— TRADORA</p>
      </div>
    </div>
  )
}

/** Avatar: sawir (custom ama Google) haddii uu jiro, hadday kale initials */
function Avatar({ src, initials, size = 80 }) {
  const [broken, setBroken] = useState(false)
  useEffect(() => { setBroken(false) }, [src])
  const style = { width: size, height: size }
  if (src && !broken) {
    return (
      <img
        src={src} alt="Profile" style={style} referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="rounded-full object-cover ring-2 ring-white"
      />
    )
  }
  return (
    <div style={style} className="flex items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 text-2xl font-bold text-white ring-2 ring-white">
      {initials}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */

export default function Settings() {
  const { user } = useAuth()
  const { accounts = [] } = useAccounts()
  const meta = user?.user_metadata || {}
  const fileRef = useRef(null)

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [tab, setTab] = useState('profile')
  const [toast, setToast] = useState(null)

  /* profile */
  const [saved, setSaved] = useState({ fullName: '', country: 'Somalia', timezone: 'Africa/Mogadishu' })
  const [profile, setProfile] = useState(saved)
  const [savingProfile, setSavingProfile] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [cropFile, setCropFile] = useState(null)

  /* preferences */
  const [prefs, setPrefs] = useState(() => loadPrefs(meta))

  const timezones = useMemo(getTimezones, [])

  const notify = useCallback((msg, type = 'success') => {
    setToast({ msg, type })
    window.setTimeout(() => setToast(null), 3400)
  }, [])

  /* ----- sync from auth user ----- */
  useEffect(() => {
    if (!user) return
    const m = user.user_metadata || {}
    const next = {
      fullName: m.full_name || m.name || '',
      country: m.country || 'Somalia',
      timezone: m.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Mogadishu',
    }
    setSaved(next)
    setProfile(next)
    setPrefs(loadPrefs(m))
  }, [user])

  useEffect(() => { applyTheme(prefs.theme) }, [prefs.theme])

  /* ----- avatar source: custom > Google/OAuth > initials ----- */
  const customAvatar = meta.custom_avatar_url || ''
  const providerAvatar = meta.avatar_url || meta.picture || ''
  const avatarSrc = customAvatar || providerAvatar
  const avatarSource = customAvatar ? 'Custom photo' : providerAvatar ? 'Google photo' : 'No photo — initials'
  const displayName = profile.fullName || meta.name || user?.email?.split('@')[0] || 'Trader'
  const initials = initialsOf(displayName)

  const dirty =
    profile.fullName.trim() !== saved.fullName.trim() ||
    profile.country !== saved.country ||
    profile.timezone !== saved.timezone

  /* ----- actions: profile ----- */
  const saveProfile = async () => {
    const fullName = profile.fullName.trim()
    if (fullName.length < 2) return notify('Fadlan geli magac sax ah (ugu yaraan 2 xaraf).', 'error')
    setSavingProfile(true)
    // Timezone-ka halkan lagu kaydiyo ayaa loo isticmaalaa waqtiga reminders-ka (server-ka)
    const { error } = await supabase.auth.updateUser({
      data: { full_name: fullName, country: profile.country, timezone: profile.timezone },
    })
    setSavingProfile(false)
    if (error) return notify(error.message, 'error')
    setSaved({ fullName, country: profile.country, timezone: profile.timezone })
    setProfile((p) => ({ ...p, fullName }))
    notify('Profile waa la kaydiyay.')
  }

  const resetProfile = () => setProfile(saved)

  const pickAvatar = () => fileRef.current?.click()

  const removeStoredAvatar = async (path) => {
    if (!path) return
    try { await supabase.storage.from(AVATAR_BUCKET).remove([path]) } catch { /* ignore */ }
  }

  const onAvatarFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !user) return
    if (!file.type.startsWith('image/')) return notify('Fadlan dooro sawir (JPG, PNG ama WEBP).', 'error')
    if (file.size > AVATAR_MAX_BYTES) return notify('Sawirku aad buu u weyn yahay (ugu badnaan 5MB).', 'error')

    setCropFile(file) // furo crop modal-ka; upload-ku wuxuu bilaabmayaa marka "Save photo" la riixo
  }

  const uploadAvatar = async (blob) => {
    if (!user) return
    setUploading(true)
    try {
      const path = `${user.id}/avatar-${Date.now()}.jpg`
      const { error: upErr } = await supabase.storage.from(AVATAR_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: true })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path)

      const oldPath = meta.custom_avatar_path
      const { error } = await supabase.auth.updateUser({ data: { custom_avatar_url: pub.publicUrl, custom_avatar_path: path } })
      if (error) throw error
      await removeStoredAvatar(oldPath)
      setCropFile(null)
      notify('Sawirka profile-ka waa la cusboonaysiiyay.')
    } catch (err) {
      notify(err?.message || 'Sawirka lama soo geli karo.', 'error')
    } finally {
      setUploading(false)
    }
  }

  const removeAvatar = async () => {
    if (!customAvatar) return
    setUploading(true)
    const oldPath = meta.custom_avatar_path
    const { error } = await supabase.auth.updateUser({ data: { custom_avatar_url: null, custom_avatar_path: null } })
    if (!error) await removeStoredAvatar(oldPath)
    setUploading(false)
    if (error) notify(error.message, 'error')
    else notify(providerAvatar ? 'Waxaa dib loo celiyay sawirka Google.' : 'Sawirka waa la saaray.')
  }

  /* ----- actions: preferences (theme) ----- */
  const updatePrefs = async (patch) => {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
    const { error } = await supabase.auth.updateUser({ data: { preferences: next } })
    if (error) notify('Local ayaa la kaydiyay, laakiin cloud sync wuu fashilmay.', 'error')
  }

  /* ------------------------------ sections ------------------------------ */

  const profileCard = (
    <Card className="max-w-3xl">
      <CardHead icon={User} title="Profile Information" sub="Update your personal details." />

      <div className="mb-6 flex flex-wrap items-center gap-5">
        <div className="relative">
          <Avatar src={avatarSrc} initials={initials} size={80} />
          <button
            type="button" onClick={pickAvatar} disabled={uploading} title="Change photo"
            className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-teal-400 text-white transition-transform hover:scale-110 disabled:opacity-60"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-white/70">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text-primary">{displayName}</p>
          <p className="text-xs text-text-muted">{avatarSource}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={pickAvatar} disabled={uploading} className="text-xs font-medium text-brand hover:underline disabled:opacity-60">Upload photo</button>
            {customAvatar && (
              <button type="button" onClick={removeAvatar} disabled={uploading} className="inline-flex items-center gap-1 text-xs font-medium text-danger hover:underline disabled:opacity-60">
                <Trash2 className="h-3 w-3" />Remove
              </button>
            )}
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={onAvatarFile} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Full Name">
          <input
            className={inputCls} value={profile.fullName} maxLength={60} placeholder="Your full name"
            onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
          />
        </Field>
        <Field label="Email" hint="Email-ka laga bedeli karo Supabase verification kaliya.">
          <input className={inputCls} value={user?.email || ''} disabled readOnly />
        </Field>
        <Field label="Country">
          <select className={inputCls} value={profile.country} onChange={(e) => setProfile({ ...profile, country: e.target.value })}>
            {!COUNTRIES.includes(profile.country) && <option value={profile.country}>{profile.country}</option>}
            {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Timezone" hint="Waqtiga reminders-ka iyo warbixinnada waxaa lagu xisaabiyaa timezone-kan.">
          <select className={inputCls} value={profile.timezone} onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}>
            {!timezones.includes(profile.timezone) && <option value={profile.timezone}>{profile.timezone}</option>}
            {timezones.map((tz) => <option key={tz} value={tz}>{tzLabel(tz)}</option>)}
          </select>
        </Field>
      </div>

      <div className="mt-6 flex items-center justify-end gap-3">
        {dirty && <Button variant="secondary" icon={X} onClick={resetProfile} disabled={savingProfile}>Discard</Button>}
        <Button icon={Save} onClick={saveProfile} disabled={!dirty || savingProfile}>{savingProfile ? 'Saving…' : 'Save Changes'}</Button>
      </div>
    </Card>
  )

  const prefsCard = (
    <Card className="max-w-3xl">
      <CardHead icon={Palette} title="App Preferences" sub="Customize your app experience." />
      <div className="flex flex-col gap-5">
        <PrefRow icon={Sun} label="Theme"><Select value={prefs.theme} onChange={(v) => updatePrefs({ theme: v })} options={THEMES} /></PrefRow>
      </div>
    </Card>
  )

  const notificationsCard = <NotificationsCard notify={notify} />

  /* ------------------------------ layout ------------------------------ */

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onMenuClick={() => setSidebarOpen(true)}
          accounts={accounts.map((a) => ({ id: a.id, label: a.name, status: a.mt5_connected ? 'connected' : 'disconnected' }))}
          selectedAccount={{ label: 'All Accounts' }}
          onSelectAccount={() => {}}
          breadcrumb="Overview / Settings"
        />

        {toast && (
          <div
            role="status"
            className={`fixed right-4 top-20 z-50 max-w-sm rounded-xl border px-4 py-3 text-sm font-medium shadow-popover ${
              toast.type === 'error' ? 'border-red-200 bg-red-50 text-danger'
                : toast.type === 'info' ? 'border-blue-200 bg-blue-50 text-brand'
                  : 'border-green-200 bg-green-50 text-success'
            }`}
          >{toast.msg}</div>
        )}

        {cropFile && (
          <AvatarCropModal
            file={cropFile}
            busy={uploading}
            onCancel={() => { if (!uploading) setCropFile(null) }}
            onConfirm={uploadAvatar}
          />
        )}

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-[28px] font-bold tracking-tight text-text-primary sm:text-[32px]">Settings</h1>
              <p className="mt-1 text-sm text-text-secondary">Manage your account, preferences and system settings.</p>
            </div>
            <MountainBanner />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[230px_1fr]">
            <Card className="h-fit !p-3">
              <nav className="flex gap-1 overflow-x-auto lg:flex-col">
                {TABS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id} type="button" onClick={() => setTab(id)}
                    className={`flex shrink-0 items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
                      tab === id ? 'bg-blue-50 text-brand' : 'text-text-secondary hover:bg-surface'
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px]" />{label}
                  </button>
                ))}
              </nav>
            </Card>

            <div className="min-w-0">
              {tab === 'profile' && profileCard}
              {tab === 'preferences' && prefsCard}
              {tab === 'notifications' && notificationsCard}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}