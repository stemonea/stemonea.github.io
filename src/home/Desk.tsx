import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useMachine, type Machine, type Media } from '../store'
import { IMAC_COLORS } from '../scene/layout'
import { FloppyCard } from './FloppyCard'
import { MAC, MAC_TINTS, MINI_FLOPPY, MiniMacintosh, useEntering, useRefusal } from './MiniMac'
import { deskScale } from './deskScale'
import { Monogram } from '../os/components/ui'
import { content, initials } from '../content'

/** Natural size of the desk; it is scaled down on narrow screens. */
export const DESK = { w: 780, h: 336 }
export const USB = { w: 20, h: 58 }

/** One power strip for everybody, centred at the top of the desk. */
const STRIP = { x: 328, y: 2, w: 124, h: 24 }
const OUTLETS = [32, 66, 100].map((dx) => ({ x: STRIP.x + dx, y: STRIP.y + STRIP.h / 2 }))

interface DeviceSpec {
  home: { x: number; y: number }
  size: { w: number; h: number }
  /** where the power cable leaves the computer (local px) */
  port: { x: number; y: number }
  outlet: number
}
const DEVICES: Record<Machine, DeviceSpec> = {
  // the cable leaves from behind each computer and climbs up to the strip
  macintosh: { home: { x: 58, y: 86 }, size: MAC, port: { x: 70, y: 40 }, outlet: 0 },
  imac: { home: { x: 308, y: 72 }, size: { w: 164, h: 196 }, port: { x: 82, y: 40 }, outlet: 1 },
  macbook: { home: { x: 528, y: 124 }, size: { w: 206, h: 140 }, port: { x: 103, y: 40 }, outlet: 2 },
}
const MACHINES = Object.keys(DEVICES) as Machine[]
/** extra cable length beyond the resting distance before the plug comes out */
const SLACK = 190

/** On phones the desk is only decorative: no dragging, no dropping. */
const useStaticDesk = () => useMachine((s) => s.device === 'iphone')

function useNear(machine: Machine) {
  return useMachine((s) => (s.nearMachine === machine ? (s.nearTarget ? 'near' : 'near-bad') : ''))
}

/** Register a little computer's drop area (computed from its element every frame while visible). */
function useDropArea(machine: Machine, el: React.RefObject<HTMLElement | null>, pad = 26) {
  const setMiniTarget = useMachine((s) => s.setMiniTarget)
  useEffect(() => {
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const r = el.current?.getBoundingClientRect()
      if (!r) return
      setMiniTarget(machine, {
        x: Math.round(r.left + r.width / 2),
        y: Math.round(r.top + r.height / 2),
        hw: Math.round(r.width / 2 + pad),
        hh: Math.round(r.height / 2 + pad),
        cardPx: 0,
      })
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [machine, el, pad, setMiniTarget])
}

const Dock = () => (
  <i className="mi-dock">
    <u />
    <u />
    <u />
    <u />
    <u />
    <u />
  </i>
)

/** A 24" iMac in miniature: thin white bezels, coloured chin, bent stand, "hello" on screen. */
function MiniIMac({ powered }: { powered: boolean }) {
  const color = IMAC_COLORS[useMachine((s) => s.imacColor)]!
  const near = useNear('imac')
  const refused = useRefusal('imac')
  const entering = useEntering('imac')
  return (
    <div
      className={`mini-imac ${powered ? 'on' : 'off'} ${near} ${refused ? 'shake' : ''} ${entering ? 'entering' : ''}`}
      style={{ ['--front' as string]: color.front, ['--back' as string]: color.back, ['--w1' as string]: color.wall[0], ['--w2' as string]: color.wall[1] }}
      title={`iMac · ${color.name} — drag me, or click the screen to change colour`}
    >
      <div className="md-zoom">
        <span className="md-shadow" />
        <span className="mi-stand" />
        <span className="mi-foot" />
        <div className="mi-body">
          <span className="mi-screen">
            <i className="mi-wave a" />
            <i className="mi-wave b" />
            <i className="mi-menubar" />
            {/* your monogram, hand-written like the iMac's "hello" */}
            <b className="mi-hello">{content.profile.logo ?? initials(content.profile.name)}</b>
            <Dock />
          </span>
          <span className="mi-chin" />
        </div>
      </div>
      {refused && <span className="mm-tip">{refused}</span>}
    </div>
  )
}

/** A MacBook Air in miniature, front view: silver lid, black bezel with notch, thin base with the scoop. */
function MiniMacBook({ powered }: { powered: boolean }) {
  const near = useNear('macbook')
  const refused = useRefusal('macbook')
  const entering = useEntering('macbook')
  return (
    <div className={`mini-macbook ${powered ? 'on' : 'off'} ${near} ${refused ? 'shake' : ''} ${entering ? 'entering' : ''}`} title="MacBook — drag me">
      <div className="md-zoom">
        <span className="md-shadow" />
        <div className="mb-lid">
          <div className="mb-bezel">
            <div className="mb-screen">
              <i className="mb-notch" />
              <i className="mi-menubar" />
              <Monogram className="mini-logo" />
              <Dock />
            </div>
          </div>
        </div>
        <div className="mb-base" />
      </div>
      {refused && <span className="mm-tip">{refused}</span>}
    </div>
  )
}

/** A USB-C stick with a little label. */
export function UsbStick() {
  return (
    <span className="usb-stick">
      <i className="usb-plug" />
      <i className="usb-body">
        <b>PhD</b>
      </i>
    </span>
  )
}

function MediaItem(props: { media: Media; x: number; y: number; rotate: number; note: string; noteX: number; noteY: number; flip?: boolean }) {
  const { media, x, y, rotate, note, noteX, noteY, flip = false } = props
  const here = useMachine((s) => !(s.badge !== 'neck' && s.media === media))
  const startCarry = useMachine((s) => s.startCarry)
  const isStatic = useStaticDesk()
  if (!here) return null
  const size = media === 'floppy' ? MINI_FLOPPY : USB
  return (
    <>
      <button
        className={`desk-media ${media}`}
        style={{ left: x, top: y, width: size.w, height: size.h, ['--r' as string]: `${rotate}deg` }}
        onPointerDown={(e) => {
          if (isStatic) return
          e.preventDefault()
          startCarry(e.clientX, e.clientY, media)
        }}
        tabIndex={isStatic ? -1 : 0}
        aria-label={media === 'floppy' ? 'Floppy disk: drag it into the Macintosh' : 'USB stick: drag it into the iMac or the MacBook'}
      >
        {media === 'floppy' ? <FloppyCard /> : <UsbStick />}
      </button>
      {!isStatic && (
        <span className={`desk-note ${flip ? 'flip' : ''}`} style={{ left: noteX, top: noteY }} aria-hidden>
          {flip && note}
          <svg width="30" height="24" viewBox="0 0 34 26">
            <path d="M30 22C22 22 10 18 5 5M5 5l-1 8M5 5l7 4" />
          </svg>
          {!flip && note}
        </span>
      )}
    </>
  )
}

type Sim = {
  x: number
  y: number
  vx: number
  vy: number
  returning: boolean
  drag: null | { sx: number; sy: number; ox: number; oy: number; moved: number; target: HTMLElement }
}
const newSim = (): Sim => ({ x: 0, y: 0, vx: 0, vy: 0, returning: false, drag: null })

/**
 * The home page desk: a classic Macintosh, a colourful iMac and a MacBook, all plugged into the same
 * power strip, with a floppy and a USB stick. Drag the computers anywhere on the page (pull one too
 * far and its plug comes out); "Reconnect" brings everybody home and plugs them back in.
 * Drop a medium into a computer to boot its big 3D version. On phones it's just an illustration.
 */
export function Desk() {
  const wrap = useRef<HTMLDivElement>(null)
  const [k, setK] = useState(1)
  const isStatic = useStaticDesk()
  const powered = useMachine((s) => s.powered)
  const reconnectTick = useMachine((s) => s.reconnectTick)
  const anyOff = MACHINES.some((m) => !powered[m])
  const [top, setTop] = useState<Machine>('macbook')

  const devEls = useRef<Partial<Record<Machine, HTMLDivElement | null>>>({})
  const cables = useRef<Partial<Record<Machine, SVGPathElement | null>>>({})
  const plugs = useRef<Partial<Record<Machine, SVGGElement | null>>>({})
  const sims = useRef<Record<Machine, Sim>>({ macintosh: newSim(), imac: newSim(), macbook: newSim() })

  useLayoutEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const next = Math.min(1, el.clientWidth / DESK.w)
      deskScale.k = next
      setK(next)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // "Reconnect": everybody glides home
  useEffect(() => {
    if (!reconnectTick) return
    for (const m of MACHINES) sims.current[m].returning = true
  }, [reconnectTick])

  // one loop for all three: positions, cables, plugs
  useEffect(() => {
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.033, (now - last) / 1000)
      last = now
      const st = useMachine.getState()
      for (const m of MACHINES) {
        const spec = DEVICES[m]
        const s = sims.current[m]
        if (s.returning && !s.drag) {
          s.vx += (-s.x * 90 - s.vx * 13) * dt
          s.vy += (-s.y * 90 - s.vy * 13) * dt
          s.x += s.vx * dt
          s.y += s.vy * dt
          if (Math.hypot(s.x, s.y) < 0.1 && Math.hypot(s.vx, s.vy) < 0.5) {
            s.x = s.y = s.vx = s.vy = 0
            s.returning = false
          }
        } else if (!s.drag) {
          s.vx *= 0.8 // settle the tilt after a drop
        }
        const el = devEls.current[m]
        if (el) el.style.transform = `translate3d(${s.x}px, ${s.y}px, 0) rotate(${Math.max(-7, Math.min(7, s.vx * 0.008))}deg)`

        const px = spec.home.x + s.x + spec.port.x
        const py = spec.home.y + s.y + spec.port.y
        const o = OUTLETS[spec.outlet]!
        const path = cables.current[m]
        const plug = plugs.current[m]
        if (st.powered[m]) {
          const rest = Math.hypot(o.x - spec.home.x - spec.port.x, o.y - spec.home.y - spec.port.y)
          const dist = Math.hypot(o.x - px, o.y - py)
          if (s.drag && dist > rest + SLACK) st.setPowered(m, false)
          const slack = Math.max(0, rest + 40 - dist) * 0.35
          path?.setAttribute('d', `M${px} ${py} C${px} ${py - 50 + slack} ${o.x} ${o.y + 60 + slack} ${o.x} ${o.y + 6}`)
          plug?.setAttribute('transform', `translate(${o.x} ${o.y + 14})`)
        } else {
          const sway = Math.sin(now / 520 + spec.outlet) * 5
          // unplugged: the cable slips out from behind the computer and dangles at its side
          const ex = px + spec.size.w / 2 + 18 + sway
          const ey = py + 46
          path?.setAttribute('d', `M${px} ${py} C${px + 40} ${py - 10} ${ex} ${ey - 40} ${ex} ${ey}`)
          // hanging plug, prongs pointing down
          plug?.setAttribute('transform', `translate(${ex} ${ey + 10}) rotate(${180 + sway * 2})`)
        }
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const handlers = (m: Machine, onClick: (t: HTMLElement) => void) =>
    isStatic
      ? {}
      : {
          onPointerDown: (e: React.PointerEvent) => {
            e.preventDefault()
            e.currentTarget.setPointerCapture(e.pointerId)
            const s = sims.current[m]
            s.returning = false
            s.drag = { sx: e.clientX, sy: e.clientY, ox: s.x, oy: s.y, moved: 0, target: e.target as HTMLElement }
            setTop(m)
          },
          onPointerMove: (e: React.PointerEvent) => {
            const s = sims.current[m]
            const d = s.drag
            if (!d) return
            const dx = (e.clientX - d.sx) / deskScale.k
            const dy = (e.clientY - d.sy) / deskScale.k
            d.moved = Math.max(d.moved, Math.hypot(dx, dy))
            s.vx = (d.ox + dx - s.x) * 60
            s.x = d.ox + dx
            s.y = d.oy + dy
          },
          onPointerUp: () => {
            const s = sims.current[m]
            const d = s.drag
            s.drag = null
            if (d && d.moved < 5) onClick(d.target)
          },
          onPointerCancel: () => void (sims.current[m].drag = null),
        }

  const device = (m: Machine, child: ReactNode, onClick: (t: HTMLElement) => void) => (
    <DeskDevice m={m} top={top === m} refCb={(el) => void (devEls.current[m] = el)} handlers={handlers(m, onClick)}>
      {child}
    </DeskDevice>
  )

  return (
    <div ref={wrap} className={`desk-wrap ${isStatic ? 'static' : ''}`} style={{ height: DESK.h * k }} aria-hidden={isStatic || undefined}>
      <div className="desk" style={{ width: DESK.w, height: DESK.h, transform: `scale(${k})` }}>
        <svg className="desk-cables" aria-hidden>
          {MACHINES.map((m) => (
            <g key={m}>
              <path ref={(el) => void (cables.current[m] = el)} className="desk-wire" d="M0 0" />
              {/* a real plug: body + two metal prongs (prongs point up, into the strip) */}
              <g ref={(el) => void (plugs.current[m] = el)} className={powered[m] ? 'plugged' : 'loose'}>
                <rect x="-3.6" y="-15" width="2.2" height="7" rx="0.6" className="desk-prong" />
                <rect x="1.4" y="-15" width="2.2" height="7" rx="0.6" className="desk-prong" />
                <rect x="-7" y="-9" width="14" height="17" rx="3" className="desk-plug" />
                <rect x="-3" y="8" width="6" height="4" rx="1" className="desk-plug" />
              </g>
            </g>
          ))}
        </svg>
        <div className="power-strip" style={{ left: STRIP.x, top: STRIP.y, width: STRIP.w, height: STRIP.h }}>
          {OUTLETS.map((o, i) => (
            <i key={i} className={powered[MACHINES.find((m) => DEVICES[m].outlet === i)!] ? '' : 'vacant'} style={{ left: o.x - STRIP.x - 7 }} />
          ))}
          <b className={anyOff ? 'off' : 'on'} />
        </div>
        {anyOff && !isStatic && (
          <button className="mm-reconnect" style={{ left: STRIP.x + STRIP.w + 12, top: STRIP.y }} onClick={() => useMachine.getState().reconnectAll()}>
            Reconnect
          </button>
        )}

        {device('macintosh', <MacintoshOnDesk powered={powered.macintosh} />, (t) => {
          const st = useMachine.getState()
          if (t.closest('.mm-screen') && st.powered.macintosh) st.setMacTint((st.macTint + 1) % MAC_TINTS)
        })}
        {device('imac', <MiniIMac powered={powered.imac} />, (t) => {
          const st = useMachine.getState()
          if (t.closest('.mi-screen') && st.powered.imac) st.setImacColor((st.imacColor + 1) % IMAC_COLORS.length)
        })}
        {device('macbook', <MiniMacBook powered={powered.macbook} />, () => {})}

        <MediaItem media="floppy" x={200} y={262} rotate={-14} note="insert me" noteX={254} noteY={276} />
      </div>
    </div>
  )
}

function MacintoshOnDesk({ powered }: { powered: boolean }) {
  const near = useNear('macintosh')
  const refused = useRefusal('macintosh')
  const entering = useEntering('macintosh')
  return (
    <div className={`mini-wrap ${entering ? 'entering' : ''}`}>
      <MiniMacintosh powered={powered} className={`${near} ${refused ? 'shake' : ''}`} />
      {refused && <span className="mm-tip">{refused}</span>}
    </div>
  )
}

/** Absolutely positioned at its home spot; the desk loop moves it with a transform. */
function DeskDevice(props: { m: Machine; top: boolean; refCb: (el: HTMLDivElement | null) => void; handlers: object; children: ReactNode }) {
  const { m, top, refCb, handlers, children } = props
  const inner = useRef<HTMLDivElement>(null)
  useDropArea(m, inner)
  const spec = DEVICES[m]
  return (
    <div ref={refCb} className={`desk-dev ${m} ${top ? 'top' : ''}`} style={{ left: spec.home.x, top: spec.home.y, width: spec.size.w, height: spec.size.h }} {...handlers}>
      <div ref={inner} className="desk-dev-inner">
        {children}
      </div>
    </div>
  )
}
