import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useMachine } from '../store'
import { bakeElement, useLiquidLens, type LensFrame, type LensHost } from '../lens'

/**
 * The home page as a row of slides sliding under a frame of liquid glass (a column on tall
 * screens, scrolled natively, with the glass along the top and bottom).
 *
 * On wide screens the row is moved by the wheel / trackpad, by dragging, by the arrow keys and by
 * the progress line at the top, and settles on the nearest slide. This component is also the
 * lens's host: it tells the glass where every slide is and when a slide has changed (so its
 * picture is baked again; see markSlideDirty in slideDirty.ts).
 */

export interface SlideDef {
  id: string
  label: string
  className?: string
  content: ReactNode
}

interface Metrics {
  tall: boolean
  /** depth of the glass at the left / right edges and at the top / bottom (CSS px) */
  side: number
  band: number
  radius: number
  slideW: number
  gap: number
  vw: number
}

const clamp = (lo: number, v: number, hi: number) => Math.min(hi, Math.max(lo, v))

function metricsFor(vw: number, vh: number): Metrics {
  if (vw / vh < 0.75) {
    const band = clamp(26, vh * 0.055, 48)
    return { tall: true, side: 0, band, radius: band, slideW: vw - 24, gap: 16, vw }
  }
  // the slide in the middle takes about two thirds of the screen; its neighbours show on both
  // sides and slide into the glass
  // how far in from each side the page bends, like the inside of a cylinder
  const side = clamp(90, vw * 0.11, 220)
  const band = clamp(30, vh * 0.075, 72)
  return {
    tall: false,
    side,
    band,
    radius: band * 0.95,
    slideW: Math.round(Math.min(vw * 0.6, vw - 2 * side - 100)),
    gap: Math.round(clamp(24, vw * 0.028, 44)),
    vw,
  }
}

/** '#f7f7f5' | 'rgb(1, 2, 3)' -> [0..1, 0..1, 0..1] */
function parseColor(v: string): [number, number, number] {
  const s = v.trim()
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s)?.[1]
  if (hex) {
    const h = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number]
  }
  const m = s.match(/[\d.]+/g)?.map(Number) ?? [255, 255, 255]
  return [m[0]! / 255, m[1]! / 255, m[2]! / 255]
}

const useDark = () => {
  const mq = useMemo(() => window.matchMedia('(prefers-color-scheme: dark)'), [])
  const [dark, setDark] = useState(mq.matches)
  useEffect(() => {
    const on = () => setDark(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [mq])
  return dark
}

/** Is there something under the pointer that should scroll natively with this wheel delta? */
function scrollsNatively(target: EventTarget | null, stop: Element, dx: number, dy: number) {
  const vertical = Math.abs(dy) >= Math.abs(dx)
  for (let el = target as Element | null; el && el !== stop; el = el.parentElement) {
    const cs = getComputedStyle(el)
    if (vertical && /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) {
      if ((dy < 0 && el.scrollTop > 0) || (dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1)) return true
    }
    if (!vertical && /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) {
      if ((dx < 0 && el.scrollLeft > 0) || (dx > 0 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1)) return true
    }
  }
  return false
}

const NO_DRAG = 'a, button, input, textarea, select, label, [data-no-drag], .desk-wrap'

interface Live {
  /** advances the slider to this frame (idempotent per timestamp), so the glass and the page move together */
  step: (now: number) => void
  metrics: Metrics
  stepAside: boolean
}

function createHost(
  lensRef: RefObject<HTMLElement | null>,
  trackRef: RefObject<HTMLElement | null>,
  live: RefObject<Live>,
  versions: Map<string, number>,
): LensHost {
  let bgKey = ''
  let bg: [number, number, number] = [1, 1, 1]
  let cardKey = ''
  let card: [number, number, number, number] = [1, 1, 1, 1]
  const readVar = (name: string) => (lensRef.current ? getComputedStyle(lensRef.current).getPropertyValue(name) : '')
  const variantOf = (id: string) => `v${versions.get(id) ?? 0}`
  return {
    pad: 32,
    radius: 22,
    get placeholder() {
      const v = readVar('--card')
      if (v !== cardKey) {
        cardKey = v
        card = [...parseColor(v || '#ffffff'), 1]
      }
      return card
    },
    background() {
      const v = readVar('--bg')
      if (v !== bgKey) {
        bgKey = v
        bg = parseColor(v || '#ffffff')
      }
      return bg
    },
    frame(now): LensFrame {
      live.current.step(now)
      const m = live.current.metrics
      const out: LensFrame = {
        active: !live.current.stepAside,
        cards: [],
        queue: [],
        // wide screens: the inside of a cylinder along the sides; tall ones: glass top and bottom
        ...(m.tall ? { frame: { x: 0, y: m.band, radius: m.radius } } : { cylinder: { depth: m.side } }),
      }
      const box = lensRef.current?.getBoundingClientRect()
      if (!box || !trackRef.current) return out
      const ranked: { id: string; variant: string; d: number }[] = []
      // the track only translates, so the slides' untransformed boxes come from their layout offsets
      const tr = trackRef.current.getBoundingClientRect()
      for (const node of trackRef.current.children) {
        const el = node as HTMLElement
        const id = el.dataset.slide
        if (!id) continue
        const rect = { x: tr.left - box.left + el.offsetLeft, y: tr.top - box.top + el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }
        const variant = variantOf(id)
        out.cards.push({ id, variant, rect })
        // how far the slide is from the middle of the screen; anything within a screen is worth loading
        const d = m.tall ? Math.abs(rect.y + rect.h / 2 - box.height / 2) - rect.h / 2 : Math.abs(rect.x + rect.w / 2 - box.width / 2) - rect.w / 2
        if (d < (m.tall ? box.height : box.width)) ranked.push({ id, variant, d })
      }
      ranked.sort((p, q) => p.d - q.d)
      out.queue = ranked
      return out
    },
    async load(id, variant, scale) {
      const el = trackRef.current?.querySelector<HTMLElement>(`[data-slide="${CSS.escape(id)}"]`)
      if (!el || variantOf(id) !== variant) throw new Error('stale')
      // let the slide settle into its resting layout first
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      if (variantOf(id) !== variant) throw new Error('stale')
      return bakeElement(el, { scale, pad: 32 })
    },
  }
}

export function Slides({ slides }: { slides: SlideDef[] }) {
  const vp = useMachine((s) => s.viewport)
  const metrics = useMemo(() => metricsFor(vp.width, vp.height), [vp.width, vp.height])
  const tall = metrics.tall
  const dark = useDark()
  const [active, setActive] = useState(0)
  const [touched, setTouched] = useState(false)

  const homeRef = useRef<HTMLDivElement>(null)
  const lensRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLSpanElement>(null)

  // ---------- the glass
  const stepAside = useMachine((s) => s.entering || (s.badge === 'inserting' && s.view === 'home'))
  const stepRef = useRef<(now: number) => void>(() => {})
  const live = useRef<Live>({ step: (n) => stepRef.current(n), metrics, stepAside })
  useLayoutEffect(() => {
    live.current = { step: (n) => stepRef.current(n), metrics, stepAside }
  })
  const [versions] = useState(() => new Map<string, number>())
  const [host] = useState(() => createHost(lensRef, trackRef, live, versions))
  const lens = useLiquidLens(lensRef, host)
  useEffect(() => {
    lens?.invalidate()
  }, [lens, dark, tall])

  // a slide whose content changes gets a new variant (at most every ~half second), so it is baked again
  useEffect(() => {
    const track = trackRef.current
    if (!track) return
    const timers = new Map<string, number>()
    const bump = (el: HTMLElement | null) => {
      const id = el?.dataset.slide
      if (!id || timers.has(id)) return
      timers.set(
        id,
        window.setTimeout(() => {
          timers.delete(id)
          versions.set(id, (versions.get(id) ?? 0) + 1)
        }, 450),
      )
    }
    const slideOf = (n: Node | EventTarget | null) => ((n instanceof Element ? n : (n as Node | null)?.parentElement) ?? null)?.closest<HTMLElement>('[data-slide]') ?? null
    const mo = new MutationObserver((records) => {
      for (const r of records) bump(slideOf(r.target))
    })
    mo.observe(track, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'src', 'aria-expanded', 'data-state'] })
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) bump(e.target as HTMLElement)
    })
    for (const el of track.children) ro.observe(el)
    const onDirty = (e: Event) => bump(slideOf(e.target))
    // things dragged around inside a slide (the desk, the pins) settle shortly after the pointer is let go
    const onUp = (e: Event) => {
      const s = slideOf(e.target)
      setTimeout(() => bump(s), 500)
    }
    const onLoad = (e: Event) => bump(slideOf(e.target))
    track.addEventListener('slide-dirty', onDirty)
    track.addEventListener('pointerup', onUp)
    track.addEventListener('load', onLoad, true)
    return () => {
      mo.disconnect()
      ro.disconnect()
      track.removeEventListener('slide-dirty', onDirty)
      track.removeEventListener('pointerup', onUp)
      track.removeEventListener('load', onLoad, true)
      for (const t of timers.values()) clearTimeout(t)
    }
  }, [versions, slides.length])

  // ---------- the horizontal engine (wide screens)
  const eng = useRef({ pos: 0, target: 0, snaps: [0] as number[], from: 0, snapTimer: 0, activeIdx: 0 })
  const measure = () => {
    const track = trackRef.current
    if (!track) return
    const vw = window.innerWidth
    eng.current.snaps = [...track.children].map((n) => {
      const el = n as HTMLElement
      return el.offsetLeft + el.offsetWidth / 2 - vw / 2
    })
  }
  const nearest = (x: number) => {
    const s = eng.current.snaps
    let best = 0
    for (let i = 1; i < s.length; i++) if (Math.abs(s[i]! - x) < Math.abs(s[best]! - x)) best = i
    return best
  }
  const goTo = (i: number) => {
    const e = eng.current
    const idx = Math.max(0, Math.min(e.snaps.length - 1, i))
    setTouched(true)
    if (tall) {
      const el = trackRef.current?.children[idx] as HTMLElement | undefined
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    e.target = e.snaps[idx] ?? 0
    e.from = idx
  }
  /** Settle on a slide: the nearest one, or at least the next one in the direction of travel. */
  const settle = () => {
    const e = eng.current
    let idx = nearest(e.target)
    const moved = e.target - (e.snaps[e.from] ?? 0)
    if (idx === e.from && Math.abs(moved) > 48) idx = e.from + Math.sign(moved)
    goTo(idx)
  }

  useLayoutEffect(() => {
    measure()
    const e = eng.current
    if (tall) {
      e.pos = e.target = 0
      if (trackRef.current) trackRef.current.style.transform = ''
      return
    }
    // keep the same slide in the middle across resizes
    e.pos = e.target = e.snaps[e.activeIdx] ?? 0
    e.from = e.activeIdx
    if (trackRef.current) trackRef.current.style.transform = `translate3d(${-e.pos}px, 0, 0)`
  }, [tall, metrics, slides.length])

  // the frame loop: ease toward the target, move the track and the progress thumb. The glass calls
  // the same step from its own frame, so whichever runs first moves the track for both.
  useEffect(() => {
    if (tall) {
      stepRef.current = () => {}
      return
    }
    let raf = 0
    let last = performance.now()
    let stepped = -1
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const step = (now: number) => {
      if (now === stepped) return
      stepped = now
      const dt = Math.min(0.05, Math.max(0, now - last) / 1000)
      last = now
      const e = eng.current
      const k = reduced ? 1 : 1 - Math.exp(-dt * 9)
      const prev = e.pos
      e.pos += (e.target - e.pos) * k
      if (Math.abs(e.target - e.pos) < 0.05) e.pos = e.target
      if (e.pos !== prev && trackRef.current) trackRef.current.style.transform = `translate3d(${-e.pos}px, 0, 0)`
      const max = e.snaps[e.snaps.length - 1] || 1
      if (thumbRef.current) thumbRef.current.style.setProperty('--p', String(Math.max(0, Math.min(1, e.pos / max))))
      const idx = nearest(e.pos)
      if (idx !== e.activeIdx) {
        e.activeIdx = idx
        setActive(idx)
      }
    }
    stepRef.current = step
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      step(now)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      stepRef.current = () => {}
    }
    // nearest only reads refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tall])

  // wheel / trackpad
  useEffect(() => {
    const home = homeRef.current
    if (!home || tall) return
    const onWheel = (ev: WheelEvent) => {
      if (ev.ctrlKey || scrollsNatively(ev.target, home, ev.deltaX, ev.deltaY)) return
      ev.preventDefault()
      const e = eng.current
      const unit = ev.deltaMode === 1 ? 32 : ev.deltaMode === 2 ? window.innerWidth : 1
      const d = (Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY) * unit
      const max = e.snaps[e.snaps.length - 1] ?? 0
      e.target = Math.max(-40, Math.min(max + 40, e.target + d))
      setTouched(true)
      clearTimeout(e.snapTimer)
      e.snapTimer = window.setTimeout(settle, 200)
    }
    home.addEventListener('wheel', onWheel, { passive: false })
    return () => home.removeEventListener('wheel', onWheel)
    // settle / goTo only read refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tall])

  // keys
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (useMachine.getState().view !== 'home' || ev.metaKey || ev.ctrlKey || ev.altKey) return
      const t = ev.target as HTMLElement | null
      if (t?.closest('input, textarea, select, [contenteditable="true"]')) return
      const i = eng.current.activeIdx
      if (tall) return
      if (ev.key === 'ArrowRight' || ev.key === 'PageDown') goTo(i + 1)
      else if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') goTo(i - 1)
      else if (ev.key === 'Home') goTo(0)
      else if (ev.key === 'End') goTo(slides.length - 1)
      else return
      ev.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tall, slides.length])

  // drag to slide (mouse, pen and touch; vertical touch moves still scroll natively)
  const drag = useRef<{ id: number; x: number; y: number; t0: number; moved: boolean; vx: number; lx: number; lt: number } | null>(null)
  const onPointerDown = (ev: React.PointerEvent) => {
    if (tall || ev.button !== 0 || (ev.target as Element).closest(NO_DRAG)) return
    const e = eng.current
    drag.current = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, t0: e.target, moved: false, vx: 0, lx: ev.clientX, lt: performance.now() }
    clearTimeout(e.snapTimer)
  }
  const onPointerMove = (ev: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== ev.pointerId) return
    const dx = ev.clientX - d.x
    const dy = ev.clientY - d.y
    if (!d.moved) {
      if (Math.hypot(dx, dy) < 6) return
      if (Math.abs(dy) > Math.abs(dx)) {
        drag.current = null // a vertical gesture: leave it to the page
        return
      }
      d.moved = true
      homeRef.current?.setPointerCapture(ev.pointerId)
      homeRef.current?.classList.add('dragging')
      window.getSelection()?.removeAllRanges()
      setTouched(true)
    }
    const now = performance.now()
    const dt = Math.max(1, now - d.lt)
    d.vx = d.vx * 0.6 + ((ev.clientX - d.lx) / dt) * 0.4
    d.lx = ev.clientX
    d.lt = now
    const e = eng.current
    const max = e.snaps[e.snaps.length - 1] ?? 0
    const raw = d.t0 - dx
    // a little resistance past the ends
    e.target = raw < 0 ? raw * 0.3 : raw > max ? max + (raw - max) * 0.3 : raw
  }
  const endDrag = () => {
    const d = drag.current
    drag.current = null
    if (!d?.moved) return
    homeRef.current?.classList.remove('dragging')
    const e = eng.current
    e.target -= d.vx * 180 // fling
    settle()
    // swallow the click that ends a drag
    const stop = (ev: Event) => ev.stopPropagation()
    window.addEventListener('click', stop, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 0)
  }

  // ---------- tall screens: progress and active slide from the native scroll
  useEffect(() => {
    const home = homeRef.current
    if (!home || !tall) return
    const on = () => {
      const max = home.scrollHeight - home.clientHeight
      thumbRef.current?.style.setProperty('--p', String(max > 0 ? home.scrollTop / max : 0))
      const mid = home.clientHeight / 2
      let best = 0
      let bestD = Infinity
      ;[...(trackRef.current?.children ?? [])].forEach((n, i) => {
        const r = n.getBoundingClientRect()
        const d = r.top <= mid && r.bottom >= mid ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid))
        if (d < bestD) {
          bestD = d
          best = i
        }
      })
      eng.current.activeIdx = best
      setActive(best)
      if (home.scrollTop > 24) setTouched(true)
    }
    on()
    home.addEventListener('scroll', on, { passive: true })
    return () => home.removeEventListener('scroll', on)
  }, [tall])

  const style = {
    '--side': `${metrics.side}px`,
    '--band': `${metrics.band}px`,
    '--slide-w': `${metrics.slideW}px`,
    '--gap': `${metrics.gap}px`,
    '--n': slides.length,
  } as React.CSSProperties

  return (
    <div
      ref={homeRef}
      className={`home slides ${tall ? 'slides-y' : 'slides-x'} ${lens ? 'has-lens' : ''}`}
      style={style}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div className="sl-track" ref={trackRef}>
        {slides.map((s, i) => (
          <section
            key={s.id}
            data-slide={s.id}
            className={`slide ${s.className ?? ''} ${i === active ? 'is-active' : ''}`}
            aria-label={s.label}
            onFocusCapture={() => !tall && i !== eng.current.activeIdx && goTo(i)}
            onClickCapture={(ev) => {
              // a click on a slide peeking from the side brings it in (and does nothing else)
              if (tall || i === eng.current.activeIdx) return
              ev.preventDefault()
              ev.stopPropagation()
              goTo(i)
            }}
          >
            <div className="slide-bg" aria-hidden />
            {s.content}
          </section>
        ))}
      </div>

      <div className="lens-layer" ref={lensRef} aria-hidden />

      <nav className="sl-nav" aria-label="Sections">
        <div className="sl-line">
          <span className="sl-thumb" ref={thumbRef} />
          {slides.map((s, i) => (
            <button key={s.id} aria-label={s.label} aria-current={i === active ? 'true' : undefined} onClick={() => goTo(i)} />
          ))}
        </div>
        <span className="sl-label" key={active}>
          <b>{String(active + 1).padStart(2, '0')}</b> {slides[active]?.label}
        </span>
      </nav>
      <p className={`sl-hint ${touched ? 'off' : ''}`}>{tall ? 'Scroll ↓' : 'Scroll or drag →'}</p>
    </div>
  )
}
