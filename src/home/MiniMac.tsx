import { useEffect, useRef, useState } from 'react'
import { content, initials } from '../content'
import { useMachine, type Machine } from '../store'
import { APPLE_PATH, drawCover, faceOf, loadProfilePhoto } from '../scene/textures'
import { FLOPPY_RATIO } from './FloppyCard'

export const MAC = { w: 118, h: 150 }
export const MINI_FLOPPY = { w: 46, h: Math.round(46 * FLOPPY_RATIO) }

/** The message of the last refusal for this computer, for ~1.4 s (drives a shake + a tooltip). */
export function useRefusal(machine: Machine) {
  const refused = useMachine((s) => (s.refused?.machine === machine ? s.refused : null))
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    if (!refused) return
    setMsg(refused.msg)
    const t = setTimeout(() => setMsg(null), 1400)
    return () => clearTimeout(t)
  }, [refused])
  return msg
}

/** True while the page zooms through this little computer into its big 3D version. */
export function useEntering(machine: Machine) {
  return useMachine((s) => s.machine === machine && (s.entering || (s.badge === 'inserting' && s.view === 'home')))
}

/** Screen tints, cycled by clicking the screen. */
const TINTS = [
  { bg: [13, 58, 64], fg: [158, 240, 240] },
  { bg: [10, 38, 16], fg: [126, 255, 140] },
  { bg: [40, 24, 6], fg: [255, 184, 77] },
  { bg: [18, 18, 18], fg: [236, 236, 236] },
]

/**
 * The 1-bit screen picture, dithered like the original Mac: your photo, or your monogram
 * (profile.logo, e.g. "SFM") in a pixel font.
 */
function portrait(w: number, h: number, photo: HTMLImageElement | null = null) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  if (photo) {
    // zoomed in on the face, centred
    drawCover(g, photo, 0, 0, w, h, 0.72, faceOf(content.profile))
    return dither(g, w, h)
  }
  const bg = g.createLinearGradient(0, 0, w, h)
  bg.addColorStop(0, '#f2f2f2')
  bg.addColorStop(1, '#a6a6a6')
  g.fillStyle = bg
  g.fillRect(0, 0, w, h)
  const text = content.profile.logo ?? initials(content.profile.name)
  g.fillStyle = '#1a1a1a'
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  let size = Math.round(h * 0.62)
  do g.font = `700 ${size}px 'Pixelify Sans', Chicago, monospace`
  while (g.measureText(text).width > w * 0.86 && --size > 8)
  g.fillText(text, w / 2, h * 0.52)
  return dither(g, w, h)
}

/** Floyd–Steinberg dithering of whatever is on the canvas, to 1 bit. */
function dither(g: CanvasRenderingContext2D, w: number, h: number) {
  const d = g.getImageData(0, 0, w, h).data
  const lum = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) lum[i] = (0.299 * d[i * 4]! + 0.587 * d[i * 4 + 1]! + 0.114 * d[i * 4 + 2]!) / 255
  // auto-levels: stretch the 3rd..97th percentile to full range, so dark photos still read in 1 bit
  const sorted = Float32Array.from(lum).sort()
  const lo = sorted[Math.floor(sorted.length * 0.03)]!
  const hi = sorted[Math.floor(sorted.length * 0.97)]!
  const span = Math.max(0.05, hi - lo)
  for (let i = 0; i < w * h; i++) {
    const l = (lum[i]! - lo) / span
    lum[i] = Math.min(1, Math.max(0, Math.pow(Math.min(1, Math.max(0, l)), 0.85) * 1.05 - 0.02))
  }
  // Floyd–Steinberg dithering to 1 bit, like the original Mac screen
  const bits = new Uint8Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const old = lum[i]!
      const v = old > 0.5 ? 1 : 0
      bits[i] = v
      const err = old - v
      if (x + 1 < w) lum[i + 1]! += (err * 7) / 16
      if (y + 1 < h) {
        if (x > 0) lum[i + w - 1]! += (err * 3) / 16
        lum[i + w]! += (err * 5) / 16
        if (x + 1 < w) lum[i + w + 1]! += err / 16
      }
    }
  return bits
}

function paint(canvas: HTMLCanvasElement, bits: Uint8Array, tint: (typeof TINTS)[number]) {
  const g = canvas.getContext('2d')!
  const img = g.createImageData(canvas.width, canvas.height)
  for (let i = 0; i < bits.length; i++) {
    const c = bits[i] ? tint.fg : tint.bg
    img.data[i * 4] = c[0]!
    img.data[i * 4 + 1] = c[1]!
    img.data[i * 4 + 2] = c[2]!
    img.data[i * 4 + 3] = 255
  }
  g.putImageData(img, 0, 0)
}

/**
 * The little classic Macintosh on the home-page desk (just the drawing: dragging, the power cable
 * and the socket are handled by the Desk). Its screen shows your photo dithered to 1 bit; clicking it
 * alternates the photo with your monogram and steps through the phosphor colours.
 */
export function MiniMacintosh({ powered, className }: { powered: boolean; className: string }) {
  const screen = useRef<HTMLCanvasElement>(null)
  const pics = useRef<{ photo: Uint8Array | null; logo: Uint8Array | null }>({ photo: null, logo: null })
  const clicks = useMachine((s) => s.macTint)

  // clicks: photo -> monogram -> photo (next colour) -> monogram ... ; without a photo, only the colour changes
  const repaint = (n: number) => {
    const { photo, logo } = pics.current
    const showLogo = !photo || n % 2 === 1
    const tint = TINTS[(photo ? Math.floor(n / 2) : n) % TINTS.length]!
    const bits = showLogo ? logo : photo
    if (screen.current && bits) paint(screen.current, bits, tint)
  }

  useEffect(() => {
    const drawLogo = () => {
      pics.current.logo = portrait(84, 56)
      repaint(useMachine.getState().macTint)
    }
    drawLogo()
    document.fonts?.ready.then(drawLogo) // the pixel font
    loadProfilePhoto(content.profile).then((img) => {
      if (!img) return
      pics.current.photo = portrait(84, 56, img)
      repaint(useMachine.getState().macTint)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => repaint(clicks), [clicks])

  return (
    <div className={`mini-mac ${powered ? 'on' : 'off'} ${className}`} style={{ width: MAC.w, height: MAC.h }}>
      <div className="mm-zoom">
        <span className="mm-shadow" />
        <span className="mm-side" />
        <div className="mm-body">
          <div className="mm-bezel">
            <div className="mm-screen">
              {/* classic Mac OS menu bar over the portrait */}
              <span className="mm-menubar">
                <svg viewBox="0 0 100 112" aria-hidden>
                  <path d={APPLE_PATH} />
                </svg>
                <i />
                <i />
                <i />
              </span>
              <canvas ref={screen} width={84} height={56} />
              <i className="mm-glare" />
            </div>
          </div>
          <svg className="mm-apple" viewBox="0 0 100 112" aria-hidden>
            <defs>
              <linearGradient id="mm-rainbow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#61bb46" />
                <stop offset="0.2" stopColor="#61bb46" />
                <stop offset="0.2" stopColor="#fdb827" />
                <stop offset="0.36" stopColor="#fdb827" />
                <stop offset="0.36" stopColor="#f5821f" />
                <stop offset="0.52" stopColor="#f5821f" />
                <stop offset="0.52" stopColor="#e03a3e" />
                <stop offset="0.68" stopColor="#e03a3e" />
                <stop offset="0.68" stopColor="#963d97" />
                <stop offset="0.84" stopColor="#963d97" />
                <stop offset="0.84" stopColor="#009ddc" />
              </linearGradient>
            </defs>
            <path d={APPLE_PATH} fill="url(#mm-rainbow)" />
          </svg>
          <span className="mm-name">Macintosh</span>
          <span className="mm-slot" />
          <span className="mm-eject" />
          <span className="mm-chin" />
        </div>
      </div>
    </div>
  )
}

/** Length of the click cycle of the screen (photo / monogram × phosphor tints). */
export const MAC_TINTS = TINTS.length * 2
