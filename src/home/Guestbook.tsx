import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useMachine } from '../store'
import { addNote, isShared, LIMITS, listNotes, type Note } from './guestbookStore'

/**
 * Slide: the guestbook. A Notes app icon (tap it: Notes opens full screen and visitors leave a
 * note, saved in Supabase), a cardboard box (tap it: it comes out full screen and opens; it's
 * empty) and a post-it that can be peeled off its pad.
 */

// ---------- dates, the way Notes prints them

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()
function shortDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  if (sameDay(d, now)) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  if (sameDay(d, y)) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) })
}
const longDate = (d: Date) => d.toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', ' at')
const firstLine = (s: string) => s.trim().split('\n')[0]!.slice(0, 60)
const rest = (s: string) => s.trim().split('\n').slice(1).join(' ').trim()

// ---------- glyphs

const Chevron = () => (
  <svg viewBox="0 0 12 20" width="11" height="18" aria-hidden>
    <path d="M10 2 2 10l8 8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const Compose = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
    <path d="M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M17.6 2.6a2 2 0 0 1 2.8 2.8L12 13.8 8.5 15l1.2-3.5z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
  </svg>
)
const Close = () => (
  <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden>
    <path d="M4 4l12 12M16 4 4 16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
)

// ---------- full-screen overlay that grows out of the element that opened it

type Phase = 'in' | 'open' | 'out'

function Overlay({
  origin,
  label,
  className,
  onClosed,
  children,
}: {
  origin: HTMLElement
  label: string
  className: string
  onClosed: () => void
  children: (phase: Phase, close: () => void) => ReactNode
}) {
  const [phase, setPhase] = useState<Phase>('in')
  const panel = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  /** the transform that puts the panel exactly over the element that opened it */
  const fromOrigin = () => {
    const a = origin.getBoundingClientRect()
    const b = panel.current!.getBoundingClientRect()
    const s = Math.max(0.05, Math.min(a.width / b.width, a.height / b.height))
    return `translate(${a.left + a.width / 2 - (b.left + b.width / 2)}px, ${a.top + a.height / 2 - (b.top + b.height / 2)}px) scale(${s})`
  }

  useLayoutEffect(() => {
    const anim = panel.current!.animate([{ transform: fromOrigin(), opacity: 0.5 }, { transform: 'none', opacity: 1 }], {
      duration: reduced ? 0 : 560,
      easing: 'cubic-bezier(0.2, 0.85, 0.25, 1)',
    })
    anim.finished.then(() => setPhase('open')).catch(() => {})
    // the opening runs once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const closing = useRef(false)
  const close = () => {
    if (closing.current) return
    closing.current = true
    setPhase('out')
    const anim = panel.current!.animate([{ transform: 'none', opacity: 1 }, { transform: fromOrigin(), opacity: 0.4 }], {
      duration: reduced ? 0 : 440,
      delay: reduced ? 0 : 180,
      easing: 'cubic-bezier(0.5, 0, 0.75, 0.2)',
      fill: 'forwards',
    })
    anim.finished.then(onClosed, onClosed)
  }
  const closeRef = useRef(close)
  closeRef.current = close

  // Esc closes; the wheel and the keys stay inside (the slides behind must not move)
  useEffect(() => {
    const el = root.current!
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeRef.current()
      } else if (!(e.target as Element | null)?.closest?.('input, textarea')) e.stopPropagation()
    }
    const stop = (e: Event) => e.stopPropagation()
    window.addEventListener('keydown', onKey, true)
    el.addEventListener('wheel', stop)
    el.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true })
    return () => {
      window.removeEventListener('keydown', onKey, true)
      el.removeEventListener('wheel', stop)
    }
  }, [])

  return (
    <div
      ref={root}
      className={`gb-ov ${className} ${phase}`}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div className="gb-ov-panel" ref={panel}>
        {children(phase, close)}
      </div>
    </div>
  )
}

/** Overlays live in the home page's own layer (so they inherit its colours), above the glass. */
const layerOf = (el: HTMLElement) => (el.closest('.home') as HTMLElement | null) ?? document.body

// ---------- the Notes app

type SetNotes = (f: (n: Note[] | null) => Note[]) => void

function NotesApp({ notes, setNotes, close, split }: { notes: Note[] | null; setNotes: SetNotes; close: () => void; split: boolean }) {
  const [error, setError] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(split ? 'new' : null)
  const [body, setBody] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [now] = useState(() => new Date())

  const save = async () => {
    if (!body.trim() || saving) return
    setSaving(true)
    setError(null)
    try {
      const note = await addNote(body, name)
      setNotes((n) => [note, ...(n ?? [])])
      setBody('')
      setSel(note.id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const shown = (notes ?? []).filter((n) => !query || `${n.body} ${n.name ?? ''}`.toLowerCase().includes(query.toLowerCase()))
  const current = sel && sel !== 'new' ? (notes ?? []).find((n) => n.id === sel) : undefined

  const list = (
    <div className="nt-pane nt-listpane">
      <nav className="nt-nav">
        <button className="nt-close" aria-label="Close Notes" onClick={close}>
          <Close />
        </button>
        <button className="nt-icon" aria-label="New note" onClick={() => setSel('new')}>
          <Compose />
        </button>
      </nav>
      <h3 className="nt-title">Guestbook</h3>
      <label className="nt-search">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
          <circle cx="6.8" cy="6.8" r="4.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="m10.5 10.5 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input value={query} placeholder="Search" aria-label="Search notes" onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="nt-list">
        {notes === null ? (
          <p className="nt-empty">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="nt-empty">{query ? 'No results.' : 'No notes yet. Be the first!'}</p>
        ) : (
          <ul className="nt-group">
            {shown.map((n) => (
              <li key={n.id} className={n.id === sel ? 'on' : ''}>
                <button onClick={() => setSel(n.id)}>
                  <b>{firstLine(n.body)}</b>
                  <span>
                    <time>{shortDate(n.created_at)}</time> {rest(n.body) || (n.name ? `— ${n.name}` : 'No additional text')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!isShared && <p className="nt-local">Saved in this browser only: the guestbook isn&rsquo;t connected to Supabase yet.</p>}
      </div>
      <footer className="nt-bar">{notes ? `${notes.length} ${notes.length === 1 ? 'Note' : 'Notes'}` : ''}</footer>
    </div>
  )

  const back = !split ? (
    <button className="nt-back" onClick={() => setSel(null)}>
      <Chevron /> Guestbook
    </button>
  ) : (
    <span />
  )

  const detail =
    sel === 'new' ? (
      <div className="nt-pane nt-editor">
        <nav className="nt-nav">
          {back}
          <button className="nt-done" disabled={!body.trim() || saving} onClick={save}>
            {saving ? 'Saving…' : 'Done'}
          </button>
        </nav>
        <p className="nt-date">{longDate(now)}</p>
        <textarea
          className="nt-text"
          data-autofocus
          value={body}
          maxLength={LIMITS.body}
          placeholder={'Leave a note for Stefano…\n\nThe first line becomes its title.'}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save()
          }}
        />
        <label className="nt-sign">
          <span>Signed,</span>
          <input value={name} maxLength={LIMITS.name} placeholder="your name (optional)" onChange={(e) => setName(e.target.value)} />
        </label>
        {error && <p className="nt-error">{error}</p>}
      </div>
    ) : current ? (
      <div className="nt-pane nt-editor">
        <nav className="nt-nav">
          {back}
          <button className="nt-icon" aria-label="New note" onClick={() => setSel('new')}>
            <Compose />
          </button>
        </nav>
        <p className="nt-date">{longDate(new Date(current.created_at))}</p>
        <div className="nt-read">
          <p>{current.body}</p>
          {current.name && <p className="nt-by">— {current.name}</p>}
        </div>
      </div>
    ) : (
      <div className="nt-pane nt-editor nt-none">
        <p className="nt-empty">Select a note, or write a new one.</p>
      </div>
    )

  if (split)
    return (
      <div className="nt-app split">
        {list}
        {detail}
      </div>
    )
  return <div className="nt-app">{sel === null ? list : detail}</div>
}

function NotesIcon({ count }: { count: number }) {
  return (
    <span className="nt-appicon" aria-hidden>
      <span className="nt-appicon-top" />
      <span className="nt-appicon-perf" />
      {count > 0 && <span className="nt-badge">{count > 99 ? '99+' : count}</span>}
    </span>
  )
}

// ---------- the box (it comes out, opens, and it's empty)

function BoxArt({ open }: { open: boolean }) {
  // each flap has two faces: the printed outside and the plain inside you see once it's folded out
  const flap = (side: 'n' | 's' | 'w' | 'e', outside?: ReactNode) => (
    <span className={`bx-flap bx-${side}`}>
      <span className="bx-face bx-out">{outside}</span>
      <span className="bx-face bx-in" />
    </span>
  )
  return (
    <span className={`bx ${open ? 'open' : ''}`}>
      <span className="bx-inside">
        <span className="bx-floor">
          <i className="bx-seam bx-seam-h" />
          <i className="bx-seam bx-seam-v1" />
          <i className="bx-seam bx-seam-v2" />
        </span>
        <span className="bx-wall bx-wall-n" />
        <span className="bx-wall bx-wall-s" />
        <span className="bx-wall bx-wall-w" />
        <span className="bx-wall bx-wall-e" />
        <span className="bx-rim" />
        <span className="bx-card">
          <span className="bx-tag">
            <i className="bx-eyelet" />
            <span>collecting memories from my experience of life.</span>
          </span>
          {/* the twine goes through the eyelet (at 55, 61 in these units: tenths of an em) */}
          <svg className="bx-twine" viewBox="0 0 80 70" aria-hidden>
            <path d="M55 61 C 34 56, 10 44, 14 24 C 18 6, 46 4, 54 20 C 60 32, 58 48, 55 61" />
            <path d="M55 61 C 48 68, 30 72, 6 66" />
          </svg>
        </span>
      </span>
      {flap('n')}
      {flap('s')}
      {flap(
        'w',
        <>
          <span className="bx-tape" />
          <span className="bx-label">
            <b>Rende, IT</b>
            <span>to: whoever opens it</span>
            <i className="bx-barcode" />
          </span>
        </>,
      )}
      {flap(
        'e',
        <>
          <span className="bx-tape" />
          <span className="bx-stamp">FRAGILE</span>
          <span className="bx-arrows">↑↑</span>
        </>,
      )}
    </span>
  )
}

// ---------- the post-it: peel it off (drag it, or tap it) and the pad below says what's next

/** where a tapped post-it lands: aside on wide screens, below the pad on narrow ones */
const peelTo = () => (window.innerWidth < 600 ? { x: 30, y: 170, r: 9 } : { x: 190, y: 120, r: 13 })

function PostIt() {
  const [off, setOff] = useState({ x: 0, y: 0, r: 0 })
  const [peeled, setPeeled] = useState(false)
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: number } | null>(null)
  const sheet = useRef<HTMLElement>(null)

  const onDown = (e: RPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { sx: e.clientX, sy: e.clientY, ox: off.x, oy: off.y, moved: 0 }
  }
  const onMove = (e: RPointerEvent) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.sx
    const dy = e.clientY - d.sy
    d.moved = Math.max(d.moved, Math.hypot(dx, dy))
    if (d.moved < 5) return
    sheet.current?.classList.add('held')
    setPeeled(true)
    setOff({ x: d.ox + dx, y: d.oy + dy, r: Math.max(-14, Math.min(14, dx * 0.04)) + 6 })
  }
  const onUp = () => {
    const d = drag.current
    drag.current = null
    sheet.current?.classList.remove('held')
    if (!d) return
    if (d.moved < 5) {
      // a tap peels it off (or sticks it back)
      if (peeled) {
        setPeeled(false)
        setOff({ x: 0, y: 0, r: 0 })
      } else {
        setPeeled(true)
        setOff(peelTo())
      }
      return
    }
    // dropped back on the pad: it sticks again
    if (Math.hypot(off.x, off.y) < 36) {
      setPeeled(false)
      setOff({ x: 0, y: 0, r: 0 })
    }
  }

  return (
    <div className={`gb-pad ${peeled ? 'peeled' : ''}`}>
      <div className="pad-sheet" aria-hidden={!peeled}>
        <p>still to collect…</p>
      </div>
      <figure
        ref={sheet}
        className="gb-postit"
        data-no-drag
        role="button"
        tabIndex={0}
        aria-label={peeled ? 'Stick the post-it back' : 'Peel the post-it off'}
        style={{ transform: `translate(${off.x}px, ${off.y}px) rotate(${off.r}deg)` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          setPeeled(!peeled)
          setOff(peeled ? { x: 0, y: 0, r: 0 } : peelTo())
        }}
      >
        <blockquote>PhD is a marathon, not a sprint!</blockquote>
        <figcaption>— Lucio</figcaption>
      </figure>
    </div>
  )
}

export function Guestbook() {
  const [notes, setNotes] = useState<Note[] | null>(null)
  /** what is open full screen, and the element it grew out of */
  const [open, setOpen] = useState<{ kind: 'notes' | 'box'; from: HTMLElement } | null>(null)
  const split = useMachine((s) => s.viewport.width >= 760)

  useEffect(() => {
    let live = true
    listNotes()
      .then((n) => live && setNotes(n))
      .catch(() => live && setNotes([]))
    return () => {
      live = false
    }
  }, [])

  return (
    <div className="s-guest">
      <div className="gb-text">
        <PostIt />
      </div>

      <div className="gb-desk">
        <button className={`gb-box ${open?.kind === 'box' ? 'away' : ''}`} aria-label="Open the box" onClick={(e) => setOpen({ kind: 'box', from: e.currentTarget })}>
          <BoxArt open={false} />
        </button>
        <button className={`gb-notes ${open?.kind === 'notes' ? 'away' : ''}`} aria-label="Open Notes" onClick={(e) => setOpen({ kind: 'notes', from: e.currentTarget })}>
          <NotesIcon count={notes?.length ?? 0} />
          <span className="gb-notes-name">Notes</span>
        </button>
      </div>

      {open?.kind === 'box' &&
        createPortal(
          <Overlay origin={open.from} label="The box" className="gb-ov-box" onClosed={() => setOpen(null)}>
            {(phase, close) => (
              <>
                <button className="gb-ov-x" aria-label="Close" data-autofocus onClick={close}>
                  <Close />
                </button>
                <button className="gb-bigbox" aria-label="Close the box" onClick={close}>
                  <BoxArt open={phase === 'open'} />
                </button>
              </>
            )}
          </Overlay>,
          layerOf(open.from),
        )}

      {open?.kind === 'notes' &&
        createPortal(
          <Overlay origin={open.from} label="Notes" className="gb-ov-notes" onClosed={() => setOpen(null)}>
            {(_, close) => <NotesApp notes={notes} setNotes={setNotes} close={close} split={split} />}
          </Overlay>,
          layerOf(open.from),
        )}
    </div>
  )
}
