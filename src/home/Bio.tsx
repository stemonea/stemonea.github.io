import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { content, initials } from '../content'
import { Markdown } from '../os/components/ui'
import { bakeElement } from '../lens'
import { createSiriGlass } from './siriGlass'

// Siri temporarily disabled: set to true to bring it back
const SIRI_ENABLED = false

/**
 * Slide: the biography, with a pixel-art portrait that sharpens into the photo on hover, and a
 * Siri orb: tap it, it thinks, grows over the left half and writes the biography as its answer.
 */

const { profile } = content
const HEADINGS = ['Today', 'Background', 'Lately']

/** Dark → light ramp of the duotone portrait. */
const RAMP: [number, number, number][] = [
  [20, 22, 70],
  [40, 62, 214],
  [110, 142, 255],
  [196, 212, 255],
  [255, 241, 140],
]
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const PX = 44
/** how much of the photo's short side the square portrait shows, centred on the face */
const ZOOM = 0.85

const photoSrc = profile.photo ? (profile.photo.startsWith('http') ? profile.photo : `${import.meta.env.BASE_URL}${profile.photo}`) : null

/** The square of the photo centred on the face (profile.photoFocus), clamped inside the image. */
function faceCrop(w: number, h: number) {
  const f = profile.photoFocus ?? { x: 0.5, y: 0.4 }
  const side = Math.min(w, h) * ZOOM
  const sx = Math.min(w - side, Math.max(0, f.x * w - side / 2))
  const sy = Math.min(h - side, Math.max(0, f.y * h - side / 2))
  return { sx, sy, side }
}

function PixelPortrait() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const photo = useRef<HTMLCanvasElement>(null)
  const [ok, setOk] = useState(false)
  useEffect(() => {
    if (!photoSrc) return
    const img = new Image()
    img.onload = () => {
      const c = canvas.current
      if (!c) return
      const ctx = c.getContext('2d', { willReadFrequently: true })!
      // the same square, centred on the face, for the pixel art and for the real photo
      const { sx, sy, side } = faceCrop(img.naturalWidth, img.naturalHeight)
      const pc = photo.current
      if (pc) {
        const pctx = pc.getContext('2d')!
        pctx.imageSmoothingQuality = 'high'
        pctx.drawImage(img, sx, sy, side, side, 0, 0, pc.width, pc.height)
      }
      ctx.drawImage(img, sx, sy, side, side, 0, 0, PX, PX)
      const d = ctx.getImageData(0, 0, PX, PX)
      // stretch the contrast, then map to the ramp with a 4×4 ordered dither
      let lo = 255
      let hi = 0
      const lum = new Float32Array(PX * PX)
      for (let i = 0; i < lum.length; i++) {
        const l = 0.299 * d.data[i * 4]! + 0.587 * d.data[i * 4 + 1]! + 0.114 * d.data[i * 4 + 2]!
        lum[i] = l
        lo = Math.min(lo, l)
        hi = Math.max(hi, l)
      }
      for (let i = 0; i < lum.length; i++) {
        const x = i % PX
        const y = Math.floor(i / PX)
        const t = (lum[i]! - lo) / Math.max(1, hi - lo)
        const v = t * (RAMP.length - 1) + (BAYER[(y % 4) * 4 + (x % 4)]! / 16 - 0.5) * 0.9
        const c = RAMP[Math.max(0, Math.min(RAMP.length - 1, Math.round(v)))]!
        d.data[i * 4] = c[0]
        d.data[i * 4 + 1] = c[1]
        d.data[i * 4 + 2] = c[2]
        d.data[i * 4 + 3] = 255
      }
      ctx.putImageData(d, 0, 0)
      setOk(true)
    }
    img.src = photoSrc
  }, [])
  return (
    <figure className={`bio-portrait ${ok ? 'ready' : ''}`}>
      {photoSrc ? (
        <>
          <canvas ref={canvas} width={PX} height={PX} />
          <canvas ref={photo} className="bio-photo" width={480} height={480} role="img" aria-label={profile.name} />
        </>
      ) : (
        <span className="bio-mono">{initials(profile.name)}</span>
      )}
    </figure>
  )
}

function CopyEmail({ email }: { email: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className="bio-copy"
      onClick={() => {
        navigator.clipboard?.writeText(email)
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      }}
    >
      <span>{email}</span>
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  )
}

/** markdown -> the plain text that is typed out (links keep their label) */
const plain = (t: string) => t.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\*\*|[*`]/g, '')

// ---------- Siri: a dark glass orb that grows into the answer

const first = profile.name.split(' ')[0]!
interface Ask {
  q: string
  a: () => string
}
const ASKS: Ask[] = [
  { q: `Who is ${first}?`, a: () => profile.bio.map(plain).join('\n\n') },
  {
    q: 'What does he work on?',
    a: () =>
      profile.research.length
        ? `${first} works on ${profile.research.map((r) => r.title.toLowerCase()).join(', ').replace(/, ([^,]*)$/, ' and $1')}.\n\n` +
          profile.research.map((r) => `${r.title}: ${r.description}`).join('\n\n')
        : plain(profile.bio[0] ?? ''),
  },
  {
    q: 'Where is he now?',
    a: () =>
      [`${profile.role} at ${profile.affiliation}${profile.location ? `, ${profile.location}` : ''} ${profile.flag ?? ''}.`.trim(), plain(profile.bio[2] ?? '')]
        .filter(Boolean)
        .join('\n\n'),
  },
]

type SiriState = 'idle' | 'thinking' | 'open'

const parseRgb = (v: string): [number, number, number] => {
  const hex = /^#([0-9a-f]{6})$/i.exec(v.trim())?.[1]
  if (hex) return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]
  const m = v.match(/[\d.]+/g)?.map(Number) ?? [255, 255, 255]
  return [m[0]! / 255, m[1]! / 255, m[2]! / 255]
}

/**
 * Draws the glass in WebGL over a picture of the biography column, following the .siri element
 * as it animates. Returns false when WebGL isn't available (the CSS look is used instead).
 */
function useSiriGlass(canvas: React.RefObject<HTMLCanvasElement | null>, glassEl: React.RefObject<HTMLDivElement | null>, column: React.RefObject<HTMLElement | null>, state: SiriState) {
  const [ok, setOk] = useState(true)
  const live = useRef(state)
  live.current = state
  useEffect(() => {
    const cv = canvas.current
    const col = column.current
    if (!cv || !col) return
    const glass = createSiriGlass(cv)
    if (!glass) {
      setOk(false)
      return
    }
    let disposed = false
    // a picture of the column behind the glass, taken again when its layout or the theme changes
    let baking = false
    let again = false
    const bake = async () => {
      if (baking) return void (again = true)
      baking = true
      try {
        const pic = await bakeElement(col, { scale: Math.min(window.devicePixelRatio || 1, 2), pad: 0 })
        if (!disposed) glass.setSnapshot(pic)
      } catch {
        // keep the previous picture
      }
      baking = false
      if (again) {
        again = false
        bake()
      }
    }
    bake()
    const ro = new ResizeObserver(() => bake())
    ro.observe(col)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', bake)

    let raf = 0
    let wave = 1
    let last = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const el = glassEl.current
      if (!el) return
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const cr = cv.getBoundingClientRect()
      // nothing to do while the slide is off screen
      if (cr.right < 0 || cr.left > window.innerWidth) return
      const sr = el.getBoundingClientRect()
      const br = col.getBoundingClientRect()
      const full = (cv.parentElement?.clientWidth ?? sr.width) + 24
      const open = Math.max(0, Math.min(1, (sr.width - 104) / Math.max(1, full - 104)))
      wave += ((live.current === 'idle' ? 1 : 0) - wave) * (1 - Math.exp(-dt * 10))
      glass.draw(
        {
          rect: { x: sr.left - cr.left, y: sr.top - cr.top, w: sr.width, h: sr.height },
          radius: sr.height * 0.48 * (1 - open) + 30 * open,
          open,
          wave,
          snap: { x: br.left - cr.left, y: br.top - cr.top, w: br.width, h: br.height },
          bg: parseRgb(getComputedStyle(col).getPropertyValue('--card') || '#ffffff'),
        },
        now,
      )
    }
    raf = requestAnimationFrame(loop)
    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      mq.removeEventListener('change', bake)
      glass.dispose()
    }
    // mounted once; the state is read through a ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return ok
}

function Siri({ column }: { column: React.RefObject<HTMLElement | null> }) {
  const [state, setState] = useState<SiriState>('idle')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glassRef = useRef<HTMLDivElement>(null)
  const gl = useSiriGlass(canvasRef, glassRef, column, state)
  const [ask, setAsk] = useState(0)
  const [typed, setTyped] = useState(0)
  const [done, setDone] = useState(false)
  const timers = useRef<number[]>([])
  const answerRef = useRef<HTMLParagraphElement>(null)
  // keep the end of the answer in view while it is written
  useEffect(() => {
    const el = answerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [typed])
  const clear = () => {
    timers.current.forEach((t) => clearTimeout(t))
    timers.current = []
  }
  useEffect(() => clear, [])
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms))
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

  /** write an answer, a few characters at a time, like a streamed reply */
  const write = (i: number) => {
    clear()
    setAsk(i)
    setTyped(0)
    setDone(false)
    const text = ASKS[i]!.a()
    if (reduced()) {
      setTyped(text.length)
      setDone(true)
      return
    }
    let n = 0
    const step = () => {
      n = Math.min(text.length, n + 2 + Math.floor(Math.random() * 4))
      setTyped(n)
      if (n < text.length) later(step, 22)
      else setDone(true)
    }
    later(step, 420)
  }

  const open = () => {
    if (state !== 'idle') return
    setState('thinking')
    later(() => {
      setState('open')
      write(0)
    }, reduced() ? 0 : 900)
  }
  const close = () => {
    clear()
    setState('idle')
    setTyped(0)
  }
  useEffect(() => {
    if (state !== 'open') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      clear()
      setState('idle')
      setTyped(0)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state])

  const cur = ASKS[ask]!
  const text = state === 'open' ? cur.a().slice(0, typed) : ''
  return (
    <>
    <canvas ref={canvasRef} className="siri-canvas" aria-hidden />
    <div ref={glassRef} className={`siri ${state} ${gl ? 'gl' : 'no-gl'}`} data-no-drag>
      {state === 'open' ? (
        <div className="siri-card" role="dialog" aria-label={`Siri: ${cur.q}`}>
          <p className="siri-answer" ref={answerRef} aria-live="polite">
            {text}
            {!done && <i className="siri-dot" />}
          </p>
          <div className={`siri-chips ${done ? 'on' : ''}`}>
            {ASKS.map((a, i) =>
              i === ask ? null : (
                <button key={a.q} onClick={() => write(i)}>
                  {a.q.charAt(0).toLowerCase() + a.q.slice(1)}
                </button>
              ),
            )}
          </div>
          {/* the orb, shrunk, waits at the bottom: tap it to put Siri away */}
          <button className="siri-mini" aria-label="Close Siri" onClick={close}>
            <i className="siri-wave" aria-hidden />
          </button>
        </div>
      ) : (
        <button className="siri-orb" onClick={open} aria-label={`Ask Siri: who is ${first}?`} disabled={state !== 'idle'}>
          <i className="siri-wave" aria-hidden />
          <span className="siri-dots" aria-hidden>
            {Array.from({ length: 6 }, (_, i) => (
              <i key={i} style={{ '--i': i } as React.CSSProperties} />
            ))}
          </span>
        </button>
      )}
    </div>
    </>
  )
}

export function Bio() {
  const columnRef = useRef<HTMLDivElement>(null)
  return (
    <div className="s-bio">
      <div className="bio-main" ref={columnRef}>
        <p className="s-kicker">Biography</p>
        <h2 className="bio-name">{profile.name}</h2>
        <p className="bio-role">
          {profile.role}
          {profile.affiliation && <> · {profile.affiliation}</>}
        </p>
        {profile.bio.map((t, i) => (
          <section key={i} className="bio-par">
            {HEADINGS[i] && <h3>{HEADINGS[i]}</h3>}
            <p>
              <Markdown text={t} />
            </p>
          </section>
        ))}
      </div>

      {/* Siri lives in the left half: it rests bottom-left and grows over the whole half */}
      <div className="bio-siri-layer">
        {SIRI_ENABLED && <Siri column={columnRef} />}
      </div>

      <aside className="bio-side">
        <div className="bio-photo-wrap">
          <PixelPortrait />
        </div>
        <dl className="bio-facts">
          {profile.location && (
            <div>
              <dt>Based in</dt>
              <dd>
                {profile.location} {profile.flag}
              </dd>
            </div>
          )}
          {profile.affiliation && (
            <div>
              <dt>Affiliation</dt>
              <dd>{profile.affiliation}</dd>
            </div>
          )}
          {profile.research.length > 0 && (
            <div>
              <dt>Interests</dt>
              <dd className="bio-chips">
                {profile.research.map((r) => (
                  <span key={r.title} title={r.description}>
                    {r.title}
                  </span>
                ))}
              </dd>
            </div>
          )}
          {profile.email && (
            <div>
              <dt>Email</dt>
              <dd>
                <CopyEmail email={profile.email} />
              </dd>
            </div>
          )}
          {profile.cv && (
            <div>
              <dt>CV</dt>
              <dd>
                <a href={profile.cv} target="_blank" rel="noreferrer">
                  Curriculum vitae ↗
                </a>
              </dd>
            </div>
          )}
        </dl>
      </aside>
    </div>
  )
}
