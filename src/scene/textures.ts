import * as THREE from 'three'
import type { Profile } from '../content'

/** Hand-drawn apple silhouette (viewBox 0 0 100 112), shared by the 3D logo and the macOS UI. */
export const APPLE_PATH =
  'M50 33C40 25 18 23 10 43C2 63 12 97 28 108C36 114 42 111 50 107C58 111 64 114 72 108C80 102 86 93 90 83C78 77 74 63 80 51C83 45 86 43 88 41C80 29 62 25 50 33Z M51 27C51 15 59 7 69 5C69 17 61 25 51 27Z'

const FONT = 'Inter, -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif'

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!] as const
}

function finish(c: HTMLCanvasElement, anisotropy = 8) {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = anisotropy
  t.needsUpdate = true
  return t
}

/** Six-stripe rainbow apple, as an RGBA texture. */
export function makeAppleTexture() {
  const [c, g] = canvas(256, 288)
  const p = new Path2D(APPLE_PATH)
  g.scale(256 / 100, 288 / 112)
  g.save()
  g.clip(p)
  const stripes = ['#61bb46', '#fdb827', '#f5821f', '#e03a3e', '#963d97', '#009ddc']
  const top = 5
  const step = (112 - top) / stripes.length
  stripes.forEach((col, i) => {
    g.fillStyle = col
    g.fillRect(0, top + i * step - 0.5, 100, step + 1)
  })
  g.restore()
  return finish(c)
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.roundRect(x, y, w, h, r)
}

// ---------------------------------------------------------------------------------------------
// Profile photo (content/profile.yaml -> photo), loaded once and shared by every drawing that uses it
// ---------------------------------------------------------------------------------------------
let photoImg: HTMLImageElement | null = null
let photoPromise: Promise<HTMLImageElement | null> | null = null

/** Loads profile.photo once (resolves to null if there is none or it fails). */
export function loadProfilePhoto(profile: Profile): Promise<HTMLImageElement | null> {
  if (photoPromise) return photoPromise
  const src = profile.photo
  if (!src) return (photoPromise = Promise.resolve(null))
  photoPromise = new Promise((resolve) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve((photoImg = img))
    img.onerror = () => resolve(null)
    img.src = /^(https?:)?\/\//.test(src) ? src : `${import.meta.env.BASE_URL}${src.replace(/^\//, '')}`
  })
  return photoPromise
}
/**
 * Draw the photo to fill a box (like object-fit: cover), centred on the face (profile.photoFocus)
 * and zoomed in by `zoom` (1 = just covering the box).
 */
export function drawCover(g: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, zoom = 1, focus = { x: 0.5, y: 0.35 }) {
  const s = Math.max(w / img.width, h / img.height) * zoom
  const dw = img.width * s
  const dh = img.height * s
  // zoomed out below "cover": fill the margins with the photo's average colour first
  if (dw < w || dh < h) {
    const one = document.createElement('canvas').getContext('2d')!
    one.drawImage(img, 0, 0, 1, 1)
    const [r, gg, b] = one.getImageData(0, 0, 1, 1).data
    g.fillStyle = `rgb(${r},${gg},${b})`
    g.fillRect(x, y, w, h)
  }
  // put the focus point in the middle of the box, without leaving gaps where the image is big enough
  const place = (pos: number, size: number, drawn: number, f: number) =>
    drawn <= size ? pos + (size - drawn) / 2 : Math.min(pos, Math.max(pos + size - drawn, pos + size / 2 - f * drawn))
  g.drawImage(img, place(x, w, dw, focus.x), place(y, h, dh, focus.y), dw, dh)
}
/** Face position of the profile photo. */
export const faceOf = (profile: Profile) => profile.photoFocus ?? { x: 0.5, y: 0.35 }

/** Institution name (short), e.g. for the disk label. */
export function institutionOf(profile: Profile) {
  return profile.badge?.institution ?? profile.affiliation.split(',').pop()!.trim()
}

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean)
  let line = ''
  let n = 0
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (g.measureText(test).width > maxW && line) {
      if (n === maxLines - 1) {
        g.fillText(`${line}…`, x, y + n * lh)
        return n + 1
      }
      g.fillText(line, x, y + n * lh)
      n++
      line = word
    } else line = test
  }
  if (line) g.fillText(line, x, y + n * lh)
  return line ? n + 1 : n
}

/** Shrink the font until `text` fits on one line. */
function fit(g: CanvasRenderingContext2D, text: string, font: (size: number) => string, max: number, min: number, width: number) {
  let size = max
  do g.font = font(size)
  while (g.measureText(text).width > width && (size -= 4) > min)
  return size
}

// ---------------------------------------------------------------------------------------------
// 3.5" floppy disk (90 × 94 mm). Canvas y grows downwards; the top edge (metal shutter) is the end
// that goes into the Mac first.
// ---------------------------------------------------------------------------------------------
export const FLOPPY_PX = { w: 1080, h: 1128 }
/** Shutter rectangle on the front, in canvas px. */
export const SHUTTER = { x: 300, y: 0, w: 520, h: 420 }
const PLASTIC = '#202228'
const MARKER = '#1b2a6b'
const HAND = 'Caveat, "Bradley Hand", "Segoe Print", cursive'

function plastic(g: CanvasRenderingContext2D, W: number, H: number) {
  const bg = g.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#2a2d35')
  bg.addColorStop(1, '#17181d')
  g.fillStyle = bg
  g.fillRect(0, 0, W, H)
  // fine moulded texture
  g.fillStyle = 'rgba(255,255,255,0.025)'
  for (let y = 0; y < H; y += 6) g.fillRect(0, y, W, 2)
}

function shutter(g: CanvasRenderingContext2D, window: boolean) {
  const { x, y, w, h } = SHUTTER
  // recess the shutter slides in
  g.fillStyle = 'rgba(0,0,0,0.35)'
  rr(g, x - 22, y - 10, w + 44, h + 34, 10)
  g.fill()
  // brushed aluminium
  const m = g.createLinearGradient(x, 0, x + w, 0)
  m.addColorStop(0, '#c9ced6')
  m.addColorStop(0.35, '#f3f5f8')
  m.addColorStop(0.6, '#b7bdc7')
  m.addColorStop(1, '#e4e7ec')
  g.fillStyle = m
  rr(g, x, y - 10, w, h + 10, 8)
  g.fill()
  g.fillStyle = 'rgba(0,0,0,0.05)'
  for (let i = 0; i < 60; i++) g.fillRect(x, y + (i * h) / 60, w, 1.5)
  if (window) {
    // the read window, offset like on a real disk
    g.fillStyle = '#0d0e12'
    rr(g, x + 290, y + 60, 110, 290, 10)
    g.fill()
    g.fillStyle = 'rgba(120,90,60,0.55)' // a glimpse of the brown magnetic disk
    rr(g, x + 300, y + 220, 90, 120, 6)
    g.fill()
  }
}

function writeProtect(g: CanvasRenderingContext2D, H: number, W: number) {
  g.fillStyle = '#08090b'
  rr(g, 46, H - 120, 60, 60, 6)
  g.fill()
  rr(g, W - 106, H - 120, 60, 60, 6)
  g.fill()
}

let lastFloppyCanvas: HTMLCanvasElement | undefined
let lastHadPhoto = false
/** The last front artwork drawn for the 3D disk, reused by the DOM disk (redrawn once the photo is in). */
export const getFloppyCanvas = (profile: Profile) =>
  lastFloppyCanvas && (lastHadPhoto || !photoImg) ? lastFloppyCanvas : (makeFloppyTexture(profile).image as HTMLCanvasElement)

/** Front of the disk: shutter, embossed arrow, and a hand-written paper label. */
export function makeFloppyTexture(profile: Profile) {
  const { w: W, h: H } = FLOPPY_PX
  const [c, g] = canvas(W, H)
  lastFloppyCanvas = c
  lastHadPhoto = !!photoImg
  plastic(g, W, H)
  shutter(g, true)

  // embossed "insert this way" arrow
  g.fillStyle = 'rgba(255,255,255,0.12)'
  g.beginPath()
  g.moveTo(140, 70)
  g.lineTo(190, 150)
  g.lineTo(90, 150)
  g.closePath()
  g.fill()
  g.fillStyle = 'rgba(255,255,255,0.18)'
  g.font = `800 40px ${FONT}`
  g.textAlign = 'center'
  g.fillText('HD', 950, 140)

  // paper label
  const L = { x: 96, y: 500, w: W - 192, h: 600 }
  g.save()
  g.shadowColor = 'rgba(0,0,0,0.35)'
  g.shadowBlur = 14
  g.shadowOffsetY = 4
  g.fillStyle = '#f6f1e4'
  rr(g, L.x, L.y, L.w, L.h, 16)
  g.fill()
  g.restore()
  // coloured top band
  const band = g.createLinearGradient(L.x, 0, L.x + L.w, 0)
  ;['#3d7bff', '#7c5cff', '#ff5fa2', '#ffb03a'].forEach((col, i, a) => band.addColorStop(i / (a.length - 1), col))
  g.save()
  rr(g, L.x, L.y, L.w, L.h, 16)
  g.clip()
  g.fillStyle = band
  g.fillRect(L.x, L.y, L.w, 46)
  // ruled lines
  g.strokeStyle = 'rgba(80,120,200,0.28)'
  g.lineWidth = 3
  for (let y = L.y + 150; y < L.y + L.h - 20; y += 92) {
    g.beginPath()
    g.moveTo(L.x + 30, y)
    g.lineTo(L.x + L.w - 30, y)
    g.stroke()
  }
  g.restore()
  g.fillStyle = 'rgba(255,255,255,0.95)'
  g.font = `800 26px ${FONT}`
  g.textAlign = 'left'
  g.fillText('3.5" · 1.44 MB', L.x + 26, L.y + 33)
  g.textAlign = 'right'
  g.fillText('DISK 1 OF 1', L.x + L.w - 26, L.y + 33)

  // hand-written text in marker
  g.textAlign = 'left'
  g.fillStyle = MARKER
  const textW = photoImg ? L.w - 330 : L.w - 80
  fit(g, profile.name, (s) => `700 ${s}px ${HAND}`, 128, 56, textW)
  g.save()
  g.translate(L.x + 40, L.y + 140)
  g.rotate(-0.025)
  g.fillText(profile.name, 0, 0)
  g.restore()
  g.font = `600 70px ${HAND}`
  g.fillText('PhD Portfolio', L.x + 44, L.y + 232)
  g.fillStyle = '#4a5a8a'
  g.font = `600 52px ${HAND}`
  wrap(g, `${profile.role.replace(/^PhD Student in /i, '')} · ${institutionOf(profile)}`, L.x + 44, L.y + 324, textW - 10, 92, 2)
  // a little doodle + a warning, like a real disk
  g.fillStyle = '#e0383e'
  g.font = `700 50px ${HAND}`
  g.save()
  g.translate(L.x + L.w - 300, L.y + L.h - 40)
  g.rotate(-0.06)
  g.fillText('do not erase!', 0, 0)
  g.restore()
  g.strokeStyle = '#e0383e'
  g.lineWidth = 5
  g.beginPath()
  const sx = L.x + 70
  const sy = L.y + L.h - 62
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5
    g[i ? 'lineTo' : 'moveTo'](sx + Math.cos(a) * 26, sy + Math.sin(a) * 26)
  }
  g.closePath()
  g.stroke()

  if (photoImg) polaroid(g, photoImg, L.x + L.w - 268, L.y + 78, faceOf(profile))

  writeProtect(g, H, W)
  return finish(c, 16)
}

/** A little polaroid of you, taped onto the disk label. */
function polaroid(g: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, face: { x: number; y: number }) {
  const w = 230
  const h = 270
  const pad = 16
  g.save()
  g.translate(x + w / 2, y + h / 2)
  g.rotate(0.07)
  g.translate(-w / 2, -h / 2)
  g.shadowColor = 'rgba(0,0,0,0.3)'
  g.shadowBlur = 16
  g.shadowOffsetY = 6
  g.fillStyle = '#fbfaf6'
  g.fillRect(0, 0, w, h)
  g.shadowColor = 'transparent'
  drawCover(g, img, pad, pad, w - pad * 2, w - pad * 2, 1.35, face)
  // a touch of instant-film warmth
  g.fillStyle = 'rgba(255, 210, 150, 0.08)'
  g.fillRect(pad, pad, w - pad * 2, w - pad * 2)
  g.restore()
  // sticky tape across the top
  g.save()
  g.translate(x + w / 2 + 6, y + 6)
  g.rotate(-0.12)
  g.fillStyle = 'rgba(236, 228, 200, 0.75)'
  g.fillRect(-60, -18, 120, 36)
  g.strokeStyle = 'rgba(180, 170, 140, 0.35)'
  g.lineWidth = 2
  g.strokeRect(-60, -18, 120, 36)
  g.restore()
}

/** Metalness map for the front: only the shutter is metal. */
export function makeFloppyMetalness() {
  const { w: W, h: H } = FLOPPY_PX
  const [c, g] = canvas(W / 4, H / 4)
  g.scale(0.25, 0.25)
  g.fillStyle = '#000'
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#fff'
  rr(g, SHUTTER.x, SHUTTER.y - 10, SHUTTER.w, SHUTTER.h + 10, 8)
  g.fill()
  g.fillStyle = '#000'
  rr(g, SHUTTER.x + 290, SHUTTER.y + 60, 110, 290, 10)
  g.fill()
  const t = new THREE.CanvasTexture(c)
  return t
}

/** Back of the disk: shutter and the metal hub in the middle. */
export function makeFloppyBackTexture() {
  const { w: W, h: H } = FLOPPY_PX
  const [c, g] = canvas(W / 2, H / 2)
  g.scale(0.5, 0.5)
  plastic(g, W, H)
  shutter(g, true)
  const cx = W / 2
  const cy = 640
  g.fillStyle = '#0b0c0f'
  g.beginPath()
  g.arc(cx, cy, 170, 0, Math.PI * 2)
  g.fill()
  const hub = g.createRadialGradient(cx - 30, cy - 30, 10, cx, cy, 130)
  hub.addColorStop(0, '#f2f4f7')
  hub.addColorStop(1, '#9aa1ac')
  g.fillStyle = hub
  g.beginPath()
  g.arc(cx, cy, 130, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#0b0c0f'
  rr(g, cx - 22, cy - 22, 44, 44, 6)
  g.fill()
  rr(g, cx + 50, cy - 40, 30, 60, 6)
  g.fill()
  writeProtect(g, H, W)
  return finish(c)
}

export { PLASTIC }
