import { useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { content, type Publication } from '../content'
import { Authors } from '../os/components/ui'
import { markSlideDirty } from './slideDirty'

/**
 * Slide 2: the publications as pins on a denim jacket.
 * - conference papers: souvenir pin-back buttons with the venue, a drawing of the host city's
 *   landmark and the city's name around the rim (or the venue's own logo, if `logo` is given);
 * - journal papers: gold-rimmed enamel shields;
 * - preprints: a red arXiv button.
 * Tap a pin to read the paper (tap it again to put it back), drag it to move it on the jacket.
 */

type Shape = 'button' | 'enamel' | 'arxiv'

interface Palette {
  base: string
  dark: string
  ink: string
}

const PALETTES: Palette[] = [
  { base: '#ec5b3f', dark: '#b23a22', ink: '#fff6ea' },
  { base: '#2f6fe4', dark: '#1c4cae', ink: '#ffffff' },
  { base: '#f6c445', dark: '#c4931a', ink: '#3a2a00' },
  { base: '#3cb48a', dark: '#26845f', ink: '#f2fff8' },
  { base: '#f294bb', dark: '#c25c88', ink: '#3b0b20' },
  { base: '#7c5cff', dark: '#5436d0', ink: '#ffffff' },
  { base: '#f4efe4', dark: '#cbbfa6', ink: '#2b2b2b' },
]
const ARXIV: Palette = { base: '#b31b1b', dark: '#7a0f0f', ink: '#ffffff' }

const hash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
/** deterministic 0..1 from a string */
const rand = (s: string) => (hash(s) % 10000) / 10000

function shapeOf(p: Publication): Shape {
  const v = p.venue
  if (/arxiv|preprint|biorxiv|ssrn/i.test(v)) return 'arxiv'
  if (/\(([^)]*\d{4}[^)]*)\)/.test(v) || /proceedings|conference|findings|workshop|track|symposium|\b[A-Z]{2,}[a-zA-Z]*\s+\d{4}\b/i.test(v)) return 'button'
  return 'enamel'
}

/** "Proceedings of the 64th Annual Meeting of the ACL (ACL 2026)" -> "ACL"; "Information Sciences" -> "IS". */
function labelOf(p: Publication, shape: Shape) {
  if (shape === 'arxiv') return 'arXiv'
  const paren = /\(([^)]*\d{4}[^)]*)\)/.exec(p.venue)?.[1]
  const src = (paren ?? p.venue).replace(/^(Proceedings of (the )?|Findings of )/i, '')
  const acronym = src.split(/[\s:,()]+/).find((w) => /^[A-Z][A-Za-z-]*[A-Z][A-Za-z-]*$/.test(w) && w.length <= 8)
  if (acronym) return acronym
  const initials = src
    .split(/\s+/)
    .filter((w) => /^[A-Z]/.test(w))
    .map((w) => w[0])
    .join('')
  return initials.slice(0, 5) || src.slice(0, 5)
}

function subOf(p: Publication, shape: Shape) {
  const v = p.venue
  if (shape === 'arxiv') return 'Preprint'
  if (shape === 'enamel') return 'Journal'
  if (/findings/i.test(v)) return 'Findings'
  if (/workshop/i.test(v)) return 'Workshop'
  if (/resource/i.test(v)) return 'Resource'
  if (/demo/i.test(v)) return 'Demo'
  if (/short/i.test(v)) return 'Short'
  return 'Main'
}

// ---------- landmarks of the host cities (tiny line drawings, ~28 × 22 units around 0,0)

type Landmark = 'palm' | 'pagoda' | 'mountains' | 'bridge' | 'tower' | 'dome' | 'skyline' | 'arch' | 'wave'
const LANDMARKS: Landmark[] = ['palm', 'pagoda', 'mountains', 'bridge', 'tower', 'dome', 'skyline', 'arch', 'wave']

/** A best guess from the city name; `landmark:` in publications.yaml always wins. */
const CITY_LANDMARK: [RegExp, Landmark][] = [
  [/san diego|miami|honolulu|hawaii|new orleans|cancun|punta cana|barcelona|dubai/i, 'palm'],
  [/suzhou|kyoto|bangkok|hangzhou|shanghai|beijing|seoul|taipei|hong kong|tokyo/i, 'pagoda'],
  [/boise|vancouver|denver|salt lake|calgary|innsbruck|zurich|geneva|banff|seattle/i, 'mountains'],
  [/san francisco|lisbon|sydney|brooklyn|budapest|prague/i, 'bridge'],
  [/paris|london|toronto|berlin|dublin|copenhagen|stockholm|madrid/i, 'tower'],
  [/vienna|rome|florence|washington|istanbul|st\.? petersburg|naples|turin|milan|venice/i, 'dome'],
  [/new york|chicago|singapore|abu dhabi|doha|kuala lumpur|montreal|austin|boston/i, 'skyline'],
  [/st\.? louis|marseille|athens|bilbao/i, 'arch'],
]

function landmarkOf(p: Publication): Landmark | null {
  if (p.landmark && (LANDMARKS as string[]).includes(p.landmark)) return p.landmark as Landmark
  if (!p.location) return null
  return CITY_LANDMARK.find(([re]) => re.test(p.location!))?.[1] ?? 'skyline'
}

function LandmarkArt({ kind, ink }: { kind: Landmark; ink: string }) {
  const line = { fill: 'none', stroke: ink, strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
  const solid = { fill: ink, stroke: 'none' } as const
  const art: Record<Landmark, ReactNode> = {
    palm: (
      <>
        <circle cx="8" cy="-5" r="3.2" {...solid} opacity="0.55" />
        <path d="M1 10 C1 4 0 -1 -2 -5" {...line} />
        <path d="M-2 -5 C-6 -8 -10 -7 -12 -4 M-2 -5 C-5 -10 -2 -12 2 -11 M-2 -5 C2 -8 6 -7 7 -3 M-2 -5 C-6 -4 -8 0 -8 3" {...line} />
        <path d="M-13 10 C-8 8 -4 12 1 10 S9 8 13 10" {...line} />
      </>
    ),
    pagoda: (
      <>
        <path d="M0 -11 V-8" {...line} />
        <path d="M-6 -6 Q0 -9 6 -6 M-9 0 Q0 -4 9 0 M-12 6 Q0 2 12 6" {...line} />
        <path d="M-4 -6 V0 M4 -6 V0 M-6 0 V6 M6 0 V6 M-8 6 V10 M8 6 V10 M-13 10 H13" {...line} />
      </>
    ),
    mountains: (
      <>
        <path d="M-13 10 L-4 -6 L2 3 L6 -2 L13 10 Z" {...line} />
        <path d="M-7 -1 L-4 -6 L-1 -1 L-3 0 Z" {...solid} />
      </>
    ),
    bridge: (
      <>
        <path d="M-8 -10 V8 M8 -10 V8 M-10 -10 H-6 M6 -10 H10" {...line} />
        <path d="M-14 1 Q-8 -9 -8 -9 Q0 2 8 -9 Q8 -9 14 1" {...line} />
        <path d="M-14 3 H14" {...line} />
        <path d="M-14 8 Q-7 6 0 8 T14 8" {...line} />
      </>
    ),
    tower: (
      <>
        <path d="M0 -12 L-3 0 L-8 10 M0 -12 L3 0 L8 10 M-4 -2 H4 M-6 4 H6" {...line} />
        <path d="M-4 10 Q0 5 4 10" {...line} />
      </>
    ),
    dome: (
      <>
        <path d="M0 -12 V-9 M-3 -9 H3" {...line} />
        <path d="M-9 0 Q-9 -9 0 -9 Q9 -9 9 0 Z" {...line} />
        <path d="M-11 0 H11 M-9 0 V8 M-3 0 V8 M3 0 V8 M9 0 V8 M-12 10 H12" {...line} />
      </>
    ),
    skyline: <path d="M-13 10 V0 H-8 V-6 H-3 V10 M-3 -2 H2 V-11 H6 V10 M6 -1 H12 V10 M-14 10 H14" {...line} />,
    arch: (
      <>
        <path d="M-10 10 Q-10 -12 0 -12 Q10 -12 10 10" {...line} />
        <path d="M-6 10 Q-6 -7 0 -7 Q6 -7 6 10" {...line} />
        <path d="M-13 10 H13" {...line} />
      </>
    ),
    wave: (
      <>
        <path d="M-13 6 C-9 -2 -3 -8 3 -6 C-2 -4 -1 2 4 1 C8 0 9 -4 13 -3" {...line} />
        <path d="M-13 10 Q-7 7 0 10 T13 10" {...line} />
      </>
    ),
  }
  return <g>{art[kind]}</g>
}

interface PinData {
  p: Publication
  id: string
  shape: Shape
  label: string
  sub: string
  pal: Palette
  rot: number
  city: string | null
  landmark: Landmark | null
}

/** A scattered but tidy starting layout: rows of pins, alternately offset, with a little jitter. */
function initialLayout(pins: PinData[]): Record<string, { x: number; y: number }> {
  const n = pins.length
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.1)))
  const rows = Math.ceil(n / cols)
  const dy = Math.min(0.36, 0.72 / rows)
  const out: Record<string, { x: number; y: number }> = {}
  pins.forEach((pin, i) => {
    const r = Math.floor(i / cols)
    const inRow = r === rows - 1 ? n - r * cols : cols
    const c = i - r * cols
    const dx = Math.min(0.3, 0.86 / inRow)
    out[pin.id] = {
      x: 0.5 + (c - (inRow - 1) / 2) * dx + (rand(pin.id + 'x') - 0.5) * 0.06,
      y: 0.5 + (r - (rows - 1) / 2) * dy + (rand(pin.id + 'y') - 0.5) * 0.08,
    }
  })
  return out
}

function Star({ x, y, r, fill }: { x: number; y: number; r: number; fill: string }) {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (i * Math.PI) / 5 - Math.PI / 2
    const rr = i % 2 ? r * 0.45 : r
    return `${(x + Math.cos(a) * rr).toFixed(2)},${(y + Math.sin(a) * rr).toFixed(2)}`
  }).join(' ')
  return <polygon points={pts} fill={fill} />
}

const asset = (src: string) => (/^(https?:|data:)/.test(src) ? src : `${import.meta.env.BASE_URL}${src.replace(/^\//, '')}`)

/** The round body every button-style pin shares: rim, face, stitched ring, text along both arcs, gloss. */
function Button({ gid, pal, top, bottom, children }: { gid: string; pal: Palette; top?: string; bottom: string; children: ReactNode }) {
  return (
    <>
      <circle r="48" fill={pal.dark} />
      <circle r="46" cy="-1" fill={pal.base} />
      <circle r="40" cy="-1" fill="none" stroke={pal.ink} strokeOpacity="0.4" strokeWidth="1.2" strokeDasharray="2.4 2.6" />
      {top && (
        <text fontSize="6.6" fontWeight="700" letterSpacing="1.4" fill={pal.ink} fillOpacity="0.9">
          <textPath href={`#${gid}-top`} startOffset="50%" textAnchor="middle">
            {top.toUpperCase()}
          </textPath>
        </text>
      )}
      {children}
      <text fontSize="7.2" fontWeight="700" letterSpacing="1.5" fill={pal.ink}>
        <textPath href={`#${gid}-bottom`} startOffset="50%" textAnchor="middle">
          {bottom.toUpperCase()}
        </textPath>
      </text>
      <circle r="46" cy="-1" fill={`url(#${gid}-gloss)`} />
    </>
  )
}

function PinArt({ pin }: { pin: PinData }) {
  const { shape, label, sub, pal, rot, p, id, city, landmark } = pin
  const year = String(p.year)
  const fs = label.length <= 3 ? 26 : label.length <= 4 ? 22 : label.length <= 5 ? 18 : 15
  const gid = `pin-${id}`
  const star = p.selected ? '★ ' : ''
  return (
    <svg viewBox="-50 -50 100 100" className="pin-art" aria-hidden>
      <defs>
        <radialGradient id={`${gid}-gloss`} cx="34%" cy="26%" r="70%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.75" />
          <stop offset="0.38" stopColor="#fff" stopOpacity="0.12" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${gid}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbe7a1" />
          <stop offset="0.45" stopColor="#d4a640" />
          <stop offset="0.7" stopColor="#f3d27a" />
          <stop offset="1" stopColor="#9c7224" />
        </linearGradient>
        <path id={`${gid}-top`} d="M -31 0 A 31 31 0 0 1 31 0" />
        <path id={`${gid}-bottom`} d="M -38 0 A 38 38 0 0 0 38 0" />
      </defs>
      <g transform={`rotate(${rot})`}>
        {shape === 'button' && (
          <Button gid={gid} pal={pal} top={city ?? p.tag} bottom={`${star}${sub} · ${year}`}>
            {landmark && (
              <g transform={`translate(0 ${p.logo ? -19 : -14}) scale(0.78)`}>
                <LandmarkArt kind={landmark} ink={pal.ink} />
              </g>
            )}
            {p.logo ? (
              <image href={asset(p.logo)} x="-24" y={landmark ? -6 : -14} width="48" height={landmark ? 24 : 28} preserveAspectRatio="xMidYMid meet" />
            ) : (
              <text y={landmark ? 13 : fs * 0.34} textAnchor="middle" fontSize={landmark ? fs * 0.82 : fs} fontWeight="800" letterSpacing="-0.6" fill={pal.ink}>
                {label}
              </text>
            )}
          </Button>
        )}
        {shape === 'arxiv' && (
          <Button gid={gid} pal={pal} top={p.tag ?? sub} bottom={`${star}${sub} · ${year}`}>
            <text y="8" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontSize="21" fontWeight="700" letterSpacing="-0.5" fill={pal.ink}>
              ar
              <tspan fontSize="28" fontStyle="italic" dy="1">
                X
              </tspan>
              <tspan dy="-1">iv</tspan>
            </text>
          </Button>
        )}
        {shape === 'enamel' && (
          <>
            <path d="M0 -47 L41 -35 C42 6 27 31 0 47 C-27 31 -42 6 -41 -35 Z" fill={`url(#${gid}-gold)`} />
            <path d="M0 -40 L34 -30 C34 4 22 25 0 39 C-22 25 -34 4 -34 -30 Z" fill={pal.base} />
            <path d="M-34 -14 L34 -14" stroke={`url(#${gid}-gold)`} strokeWidth="2.4" />
            <text y="-20" textAnchor="middle" fontSize="6.6" fontWeight="800" letterSpacing="1.5" fill={pal.ink}>
              {sub.toUpperCase()}
            </text>
            {p.logo ? (
              <image href={asset(p.logo)} x="-22" y="-10" width="44" height="24" preserveAspectRatio="xMidYMid meet" />
            ) : (
              <text y={4 + fs * 0.3} textAnchor="middle" fontSize={fs * 0.92} fontWeight="800" letterSpacing="-0.4" fill={pal.ink}>
                {label}
              </text>
            )}
            <rect x="-17" y="17" width="34" height="11" rx="2" fill={`url(#${gid}-gold)`} />
            <text y="25.4" textAnchor="middle" fontSize="7.6" fontWeight="800" letterSpacing="1" fill="#5a3f10">
              {year}
            </text>
            {p.selected && <Star x={0} y={-31} r={4.2} fill={`url(#${gid}-gold)`} />}
            <path d="M0 -40 L34 -30 C34 4 22 25 0 39 C-22 25 -34 4 -34 -30 Z" fill={`url(#${gid}-gloss)`} />
          </>
        )}
      </g>
    </svg>
  )
}

const venueLine = (p: Publication) => p.venue.replace(/^Proceedings of (the )?/i, '')

function PaperLinks({ p }: { p: Publication }) {
  const links = (
    [
      ['arXiv', p.arxiv],
      ['PDF', p.pdf],
      ['DOI', p.doi],
      ['Code', p.code],
    ] as [string, string | undefined][]
  ).filter((l): l is [string, string] => !!l[1])
  if (!links.length) return null
  return (
    <p className="m-links">
      {links.map(([l, h]) => (
        <a key={l} href={h} target="_blank" rel="noreferrer">
          {l} ↗
        </a>
      ))}
    </p>
  )
}

export function Pins() {
  const pins = useMemo<PinData[]>(() => {
    const used = new Map<string, number>()
    return content.publications.map((p, i) => {
      const shape = shapeOf(p)
      const label = labelOf(p, shape)
      // same venue, same colour; otherwise spread the palette
      const key = label.toLowerCase()
      if (!used.has(key)) used.set(key, (hash(key) + used.size * 3) % PALETTES.length)
      return {
        p,
        id: p.key.replace(/[^\w-]/g, '') || `p${i}`,
        shape,
        label,
        sub: subOf(p, shape),
        pal: shape === 'arxiv' ? ARXIV : PALETTES[used.get(key)!]!,
        rot: Math.round((rand(p.key) - 0.5) * 30),
        city: shape === 'button' && p.location ? p.location.split(',')[0]!.trim() : null,
        landmark: shape === 'button' ? landmarkOf(p) : null,
      }
    })
  }, [])
  const [pos, setPos] = useState(() => initialLayout(pins))
  /** the pin being read, or null when they are all on the jacket */
  const [sel, setSel] = useState<number | null>(0)
  const boardRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; moved: number; el: HTMLElement } | null>(null)
  const toggle = (i: number) => setSel((s) => (s === i ? null : i))

  const onDown = (e: RPointerEvent<HTMLButtonElement>, id: string) => {
    if (e.button !== 0) return
    const p = pos[id]!
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { id, sx: e.clientX, sy: e.clientY, ox: p.x, oy: p.y, moved: 0, el: e.currentTarget }
  }
  const onMove = (e: RPointerEvent) => {
    const d = drag.current
    const board = boardRef.current?.getBoundingClientRect()
    if (!d || !board) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    d.moved = Math.max(d.moved, Math.hypot(dx, dy))
    if (d.moved < 4) return
    d.el.classList.add('lifted')
    const x = Math.min(0.94, Math.max(0.06, d.ox + dx / board.width))
    const y = Math.min(0.94, Math.max(0.06, d.oy + dy / board.height))
    d.el.style.left = `${x * 100}%`
    d.el.style.top = `${y * 100}%`
  }
  const onUp = (e: RPointerEvent, i: number) => {
    const d = drag.current
    drag.current = null
    if (!d) return
    d.el.classList.remove('lifted')
    if (d.moved < 4) {
      toggle(i)
      return
    }
    const board = boardRef.current!.getBoundingClientRect()
    const x = Math.min(0.94, Math.max(0.06, d.ox + (e.clientX - d.sx) / board.width))
    const y = Math.min(0.94, Math.max(0.06, d.oy + (e.clientY - d.sy) / board.height))
    setPos((s) => ({ ...s, [d.id]: { x, y } }))
    markSlideDirty(d.el)
  }

  if (pins.length === 0) return null
  const cur = sel === null ? null : pins[sel]
  const step = (d: number) => setSel((s) => (s === null ? (d > 0 ? 0 : pins.length - 1) : (s + d + pins.length) % pins.length))
  const count = (sh: Shape) => pins.filter((x) => x.shape === sh).length
  const summary = (
    [
      [count('button'), 'conference'],
      [count('enamel'), 'journal'],
      [count('arxiv'), 'preprint'],
    ] as [number, string][]
  )
    .filter(([n]) => n > 0)
    .map(([n, w]) => `${n} ${w}${n === 1 ? '' : 's'}`)
    .join(' · ')

  return (
    <div className="s-pins">
      <div className="pins-info">
        <p className="s-kicker">Publications</p>
        <h2 className="s-title">A jacket full of papers.</h2>
        <p className="s-sub">Every paper is a pin. Tap one to read it, tap it again to put it back, or drag it somewhere else on the denim.</p>

        {cur ? (
          <article className="pin-detail" key={cur.id} style={{ '--pin-c': cur.pal.base } as React.CSSProperties}>
            <p className="pd-venue">
              <i />
              {venueLine(cur.p)} · {cur.p.year}
            </p>
            {(cur.p.location || cur.p.tag) && <p className="pd-where">{[cur.p.location, cur.p.tag].filter(Boolean).join(' · ')}</p>}
            <h3>{cur.p.title}</h3>
            <p className="pd-authors">
              <Authors authors={cur.p.authors} />
            </p>
            {cur.p.abstract && <p className="pd-abstract">{cur.p.abstract}</p>}
            <PaperLinks p={cur.p} />
          </article>
        ) : (
          <article className="pin-detail pin-empty" key="none">
            <p className="pd-venue">On the jacket</p>
            <h3>
              {pins.length} {pins.length === 1 ? 'paper' : 'papers'}
            </h3>
            <p className="pd-authors">{summary}</p>
            <p className="pd-abstract">Pick a pin to read its paper.</p>
          </article>
        )}

        <div className="pd-nav">
          <button aria-label="Previous paper" onClick={() => step(-1)}>
            ←
          </button>
          <span>
            {sel === null ? '–' : sel + 1} / {pins.length}
          </span>
          <button aria-label="Next paper" onClick={() => step(1)}>
            →
          </button>
        </div>
      </div>

      <div className="pins-board" ref={boardRef}>
        <div className="pins-stitch" />
        <div className="pins-patch">
          <b>{content.profile.logo ?? 'PAPERS'}</b>
          <span>Est. {Math.min(...content.publications.map((x) => Number(x.year) || 9999))}</span>
        </div>
        {pins.map((pin, i) => (
          <button
            key={pin.id}
            className={`pin pin-${pin.shape} ${i === sel ? 'on' : ''}`}
            style={{ left: `${pos[pin.id]!.x * 100}%`, top: `${pos[pin.id]!.y * 100}%`, zIndex: i === sel ? 3 : 1 }}
            aria-label={`${pin.label} ${pin.p.year}: ${pin.p.title}`}
            aria-pressed={i === sel}
            data-no-drag
            onPointerDown={(e) => onDown(e, pin.id)}
            onPointerMove={onMove}
            onPointerUp={(e) => onUp(e, i)}
            onPointerCancel={() => {
              drag.current?.el.classList.remove('lifted')
              drag.current = null
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                toggle(i)
              }
            }}
          >
            <PinArt pin={pin} />
          </button>
        ))}
        <ul className="pins-legend" aria-hidden>
          <li>
            <i className="lg-button" /> conference
          </li>
          <li>
            <i className="lg-enamel" /> journal
          </li>
          <li>
            <i className="lg-arxiv" /> arXiv
          </li>
          <li>★ selected</li>
        </ul>
      </div>
    </div>
  )
}
