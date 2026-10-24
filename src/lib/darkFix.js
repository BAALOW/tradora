// src/lib/darkFix.js
//
// Dark mode "catch-all": marka `.dark` shidan yahay, wuxuu si automatic ah u saxaa midabada
// CSS-ku aanu garan karin (hex arbitrary sida bg-[#F8FAFF], inline style, gradients gaar ah):
//   1. background iftiin ah  → dark equivalent (hue-ka waa la ilaaliyaa: green box → dark green)
//   2. gradient iftiin ah     → dark gradient
//   3. qoraal madow oo ku jira background dark (contrast hooseeya) → la iftiimiyo
//
// Waxba ma beddelo Light mode: wuxuu isticmaalaa data-dk-* attributes + CSS variables,
// oo CSS-ka `.dark [data-dk-bg]` ayaa u shaqeeya (index.css). Escape hatch: data-no-darkfix.

const A_BG = 'data-dk-bg'
const A_IMG = 'data-dk-img'
const A_FG = 'data-dk-fg'
const A_BD = 'data-dk-bd'
const SVG_NS = 'http://www.w3.org/2000/svg'
const SKIP = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'IMG', 'VIDEO', 'AUDIO', 'CANVAS', 'IFRAME', 'OBJECT', 'EMBED', 'BR', 'HR'])

const COLOR_RE = /rgba?\(\s*[\d.]+[\s,]+[\d.]+[\s,]+[\d.]+(?:\s*[,/]\s*[\d.]+%?)?\s*\)/g

/* ----------------------------- colour helpers ----------------------------- */

function parseColor(str) {
  if (!str) return null
  const m = /rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/.exec(str)
  if (!m) return null
  let a = 1
  if (m[4] !== undefined) a = m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])
  return { r: +m[1], g: +m[2], b: +m[3], a }
}

const lin = (v) => {
  const x = v / 255
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
}
const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
const contrast = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)

function hueChroma(c) {
  const r = c.r / 255
  const g = c.g / 255
  const b = c.b / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h = Math.round(h * 60)
    if (h < 0) h += 360
  }
  return { h, chroma: d }
}

/** background iftiin ah → dark (tint-ka hue-ga waa la ilaaliyaa) */
function darkBg(c) {
  const { h, chroma } = hueChroma(c)
  if (chroma < 0.04) return lum(c) > 0.96 ? 'rgb(var(--card))' : 'rgb(var(--surface))'
  const sat = Math.round(Math.min(46, 22 + chroma * 40))
  return `hsl(${h} ${sat}% 16%)`
}

/** qoraal madow → iftiin (hue ilaali) */
function lightFg(c) {
  const { h, chroma } = hueChroma(c)
  if (chroma < 0.15) {
    const l = lum(c)
    if (l < 0.08) return 'rgb(var(--text-primary))'
    if (l < 0.2) return 'rgb(var(--text-secondary))'
    return 'rgb(var(--text-muted))'
  }
  return `hsl(${h} 78% 72%)`
}

/* ------------------------------ DOM helpers ------------------------------- */

function eligible(el) {
  if (!el || el.nodeType !== 1) return false
  if (SKIP.has(el.tagName)) return false
  if (el.namespaceURI === SVG_NS && el.tagName.toLowerCase() !== 'svg') return false
  if (el.closest && el.closest('[data-no-darkfix]')) return false
  return true
}

function hasOwnText(el) {
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
  if (el.namespaceURI === SVG_NS) return true // svg root: icon colour (currentColor)
  for (const n of el.childNodes) {
    if (n.nodeType === 3 && n.nodeValue.trim()) return true
  }
  return false
}

function clearFix(el) {
  el.removeAttribute(A_BG)
  el.removeAttribute(A_IMG)
  el.removeAttribute(A_FG)
  el.removeAttribute(A_BD)
  el.style.removeProperty('--dk-bd')
  el.style.removeProperty('--dk-bg')
  el.style.removeProperty('--dk-img')
  el.style.removeProperty('--dk-fg')
}

function mapGradient(bi) {
  if (!bi || bi === 'none' || !bi.includes('gradient') || bi.includes('url(')) return null
  const toks = bi.match(COLOR_RE) || []
  let light = 0
  let vivid = 0
  for (const t of toks) {
    const c = parseColor(t)
    if (!c || c.a < 0.3) continue
    const l = lum(c)
    if (l >= 0.8) light += 1
    else if (l >= 0.05 && l < 0.6) vivid += 1 // midab xooggan (blue→indigo) = ujeed ahaan loo dhigay
  }
  if (!light || vivid) return null
  return bi.replace(COLOR_RE, (t) => {
    const c = parseColor(t)
    if (!c || c.a < 0.3 || lum(c) < 0.8) return t // stops-ka madow/dark waa la ilaaliyaa
    return darkBg(c)
  })
}

function nodeBg(n, cache) {
  if (cache.has(n)) return cache.get(n)
  const cs = getComputedStyle(n)
  let c = parseColor(cs.backgroundColor)
  if (!(c && c.a >= 0.5)) {
    c = null
    const bi = cs.backgroundImage
    if (bi && bi !== 'none' && bi.includes('gradient')) {
      for (const t of bi.match(COLOR_RE) || []) {
        const p = parseColor(t)
        if (p && p.a >= 0.3) { c = p; break }
      }
    }
  }
  cache.set(n, c)
  return c
}

function effectiveBg(el, cache) {
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const c = nodeBg(n, cache)
    if (c) return c
  }
  return cache.get('fallback') || { r: 11, g: 18, b: 32, a: 1 }
}

/* -------------------------------- core pass -------------------------------- */

function run(elements) {
  const list = elements.filter(eligible)
  if (!list.length) return

  // Phase 1 (read): background-color + gradients
  const bgFix = []
  const imgFix = []
  const bdFix = []
  for (const el of list) {
    const cs = getComputedStyle(el)
    const bg = parseColor(cs.backgroundColor)
    if (bg && bg.a >= 0.3 && lum(bg) >= 0.8) bgFix.push([el, darkBg(bg)])
    const mapped = mapGradient(cs.backgroundImage)
    if (mapped) imgFix.push([el, mapped])
    if (parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0) {
      const bc = parseColor(cs.borderTopColor) || parseColor(cs.borderBottomColor) || parseColor(cs.borderLeftColor)
      if (bc && bc.a >= 0.3 && lum(bc) >= 0.55) bdFix.push(el)
    }
  }
  // Phase 2 (write)
  for (const [el, v] of bgFix) { el.style.setProperty('--dk-bg', v); el.setAttribute(A_BG, '') }
  for (const [el, v] of imgFix) { el.style.setProperty('--dk-img', v); el.setAttribute(A_IMG, '') }
  for (const el of bdFix) { el.setAttribute(A_BD, '') }

  // Phase 3 (read): qoraal contrast hooseeya
  const cache = new Map()
  const bodyBg = parseColor(getComputedStyle(document.body).backgroundColor)
  if (bodyBg && bodyBg.a > 0.5) cache.set('fallback', bodyBg)
  const fgFix = []
  for (const el of list) {
    if (!hasOwnText(el)) continue
    const fg = parseColor(getComputedStyle(el).color)
    if (!fg || fg.a < 0.5) continue
    const lf = lum(fg)
    const bg = effectiveBg(el, cache)
    const lb = lum(bg)
    const ratio = contrast(lf, lb)
    if (lb < 0.25 && lf < 0.3 && ratio < 4.2) fgFix.push([el, lightFg(fg)]) // qoraal madow oo ku jira background dark
    else if (lb >= 0.6 && lf > lb && ratio < 3) fgFix.push([el, 'rgb(17 24 39)']) // qoraal iftiin ah oo ku jira chip iftiin ah
  }
  // Phase 4 (write)
  for (const [el, v] of fgFix) { el.style.setProperty('--dk-fg', v); el.setAttribute(A_FG, '') }
}

/* ------------------------------ public entry ------------------------------- */

let started = false

/**
 * Wac hal mar (App.jsx → ThemeSync). Wuxuu daawanayaa class-ka `dark` ee <html>:
 * marka dark shidmo → page-ka oo dhan ayuu saxaa, kadibna wax kasta oo cusub oo DOM-ka lagu daro.
 * Wuxuu shaqeeyaa si sync ah (MutationObserver microtask) → ma jiro iftiin ka muuqda kahor paint-ka.
 */
export function initDarkFix() {
  if (started || typeof document === 'undefined') return () => {}
  started = true

  const root = document.documentElement
  const isDark = () => root.classList.contains('dark')
  const treeNodes = new Set() // nodes cusub + descendants
  const selfNodes = new Set() // class-kooda ayaa beddelmay (hal element)
  let full = false
  let bodyObs = null

  const flush = () => {
    if (!isDark() || !document.body) {
      treeNodes.clear()
      selfNodes.clear()
      full = false
      return
    }
    const seen = new Set()
    const nodes = []
    const push = (n) => { if (!seen.has(n)) { seen.add(n); nodes.push(n) } }
    if (full) {
      document.body.querySelectorAll('*').forEach(push)
    } else {
      treeNodes.forEach((n) => {
        if (!n.isConnected) return
        push(n)
        n.querySelectorAll('*').forEach(push)
      })
      selfNodes.forEach((n) => { if (n.isConnected) push(n) })
    }
    full = false
    treeNodes.clear()
    selfNodes.clear()
    try { run(nodes) } catch { /* ma jabin app-ka */ }
  }

  const start = () => {
    full = true
    flush()
    if (bodyObs || !document.body) return
    bodyObs = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === 'childList') {
          m.addedNodes.forEach((n) => { if (n.nodeType === 1) treeNodes.add(n) })
        } else if (m.type === 'attributes' && m.target.nodeType === 1) {
          clearFix(m.target) // class-ka wuu beddelmay → dib u xisaabi
          selfNodes.add(m.target)
        }
      }
      flush()
    })
    bodyObs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
  }

  const stop = () => {
    if (bodyObs) { bodyObs.disconnect(); bodyObs = null }
  }

  const rootObs = new MutationObserver(() => { if (isDark()) start(); else stop() })
  rootObs.observe(root, { attributes: true, attributeFilter: ['class'] })
  if (isDark()) start()

  return () => {
    rootObs.disconnect()
    stop()
    started = false
  }
}