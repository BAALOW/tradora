import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, X, ZoomIn, ZoomOut } from 'lucide-react'

const VIEW = 280 // cabbirka goobta crop-ka (px)
const OUT = 256 // cabbirka sawirka ugu dambeeya (px)
const MAX_ZOOM = 3

/**
 * Crop modal: jiid sawirka + zoom si wajiga ugu dhex ekaado wareegga.
 * onConfirm(blob) waxay helaysaa JPEG square 256x256.
 */
export default function AvatarCropModal({ file, busy = false, onCancel, onConfirm }) {
  const imgRef = useRef(null)
  const drag = useRef(null)
  const [url, setUrl] = useState('')
  const [nat, setNat] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [error, setError] = useState('')

  useEffect(() => {
    const u = URL.createObjectURL(file)
    setUrl(u)
    setNat(null)
    setZoom(1)
    setPos({ x: 0, y: 0 })
    setError('')
    return () => URL.revokeObjectURL(u)
  }, [file])

  const base = nat ? VIEW / Math.min(nat.w, nat.h) : 1
  const scale = base * zoom
  const dw = nat ? nat.w * scale : 0
  const dh = nat ? nat.h * scale : 0

  // Sawirku waa inuu had iyo jeer buuxiyaa goobta (meel madhan ha jirin)
  const clamp = useCallback(
    (p, s) => {
      if (!nat) return p
      const mx = Math.max(0, (nat.w * s - VIEW) / 2)
      const my = Math.max(0, (nat.h * s - VIEW) / 2)
      return { x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)) }
    },
    [nat]
  )

  const changeZoom = (z) => {
    const nz = Math.min(MAX_ZOOM, Math.max(1, z))
    setZoom(nz)
    setPos((p) => clamp(p, base * nz))
  }

  const onDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y }
  }
  const onMove = (e) => {
    if (!drag.current) return
    setPos(clamp({ x: drag.current.ox + e.clientX - drag.current.sx, y: drag.current.oy + e.clientY - drag.current.sy }, scale))
  }
  const onUp = () => { drag.current = null }

  const confirm = () => {
    const img = imgRef.current
    if (!img || !nat) return
    const canvas = document.createElement('canvas')
    canvas.width = OUT
    canvas.height = OUT
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, OUT, OUT)
    const sSize = VIEW / scale
    const sx = nat.w / 2 + (-VIEW / 2 - pos.x) / scale
    const sy = nat.h / 2 + (-VIEW / 2 - pos.y) / scale
    ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUT, OUT)
    canvas.toBlob((b) => (b ? onConfirm(b) : setError('Sawirka lama habayn karo.')), 'image/jpeg', 0.9)
  }

  return (
    <div className="fixed inset-0 z-[45] flex items-center justify-center bg-slate-900/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-white p-5 shadow-popover">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-[16px] font-semibold text-text-primary">Crop your photo</h3>
          <button type="button" onClick={onCancel} disabled={busy} className="rounded-lg p-1.5 text-text-muted hover:bg-surface disabled:opacity-50" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mb-4 text-xs text-text-muted">Jiid sawirka si wajigaagu ugu dhex ekaado wareegga, kadibna weyneey ama yaree.</p>

        {/* Goobta crop-ka */}
        <div
          className="relative mx-auto cursor-grab touch-none select-none overflow-hidden rounded-xl bg-slate-100 active:cursor-grabbing"
          style={{ width: VIEW, height: VIEW }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {url && (
            <img
              ref={imgRef}
              src={url}
              alt="Crop preview"
              draggable={false}
              onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              onError={() => setError('Faylkan ma aha sawir sax ah.')}
              className="pointer-events-none absolute max-w-none"
              style={{
                left: '50%',
                top: '50%',
                width: dw || 'auto',
                height: dh || 'auto',
                transform: `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px)`,
              }}
            />
          )}
          {/* Wareegga hagaha + hadhka dibadda */}
          <div
            className="pointer-events-none absolute inset-0 rounded-full border-2 border-white"
            style={{ boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.55)' }}
          />
        </div>

        {/* Zoom */}
        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={() => changeZoom(zoom - 0.25)} className="rounded-lg p-1.5 text-text-secondary hover:bg-surface" aria-label="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </button>
          <input
            type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom}
            onChange={(e) => changeZoom(Number(e.target.value))}
            className="h-1.5 flex-1 cursor-pointer accent-brand"
            aria-label="Zoom"
          />
          <button type="button" onClick={() => changeZoom(zoom + 0.25)} className="rounded-lg p-1.5 text-text-secondary hover:bg-surface" aria-label="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>

        {error && <p className="mt-3 text-xs font-medium text-danger">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button" onClick={onCancel} disabled={busy}
            className="h-10 rounded-xl border border-border px-4 text-sm font-medium text-text-secondary transition-colors hover:bg-surface disabled:opacity-50"
          >Cancel</button>
          <button
            type="button" onClick={confirm} disabled={busy || !nat}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Check className="h-4 w-4" />}
            {busy ? 'Saving…' : 'Save photo'}
          </button>
        </div>
      </div>
    </div>
  )
}