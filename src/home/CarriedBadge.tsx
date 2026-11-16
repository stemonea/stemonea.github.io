import { useEffect, useRef } from 'react'
import { carryBus, useMachine } from '../store'
import { FloppyCard } from './FloppyCard'
import { MINI_FLOPPY } from './MiniMac'
import { USB, UsbStick } from './Desk'
import { deskScale } from './deskScale'


/**
 * The floppy in your hand: follows the pointer from the little Mac's desk to its slot. Dropped in
 * the slot it slides inside (and the page zooms into the big Mac); on the 3D view a disk dropped
 * away from the slot rests where you left it.
 *
 * While dragging, its position is written straight to the element's transform (listening to
 * carryBus), so moving it costs no React render and no 3D redraw.
 */
export function CarriedBadge() {
  const badge = useMachine((s) => s.badge)
  const carry = useMachine((s) => s.carry)
  const target = useMachine((s) => s.target)
  const media = useMachine((s) => s.media)
  const miniTarget = useMachine((s) => s.miniTargets[s.machine])
  const near = useMachine((s) => s.nearTarget)
  const device = useMachine((s) => s.device)
  const view = useMachine((s) => s.view)
  const startCarry = useMachine((s) => s.startCarry)
  const setBadge = useMachine((s) => s.setBadge)
  const el = useRef<HTMLButtonElement>(null)

  // on the home page: the medium at the desk's (possibly scaled) size; on the 3D view: the floppy at
  // the size of the 3D disk
  const usb = view === 'home' && media === 'usb'
  const base = usb ? USB : MINI_FLOPPY
  const w = view === 'home' ? base.w * deskScale.k : (target?.cardPx ?? 170)
  const h = w * (base.h / base.w)

  // follow the pointer, tilting with the motion
  useEffect(() => {
    if (badge !== 'carried') return
    let tilt = 0
    let prevX = carryBus.pos.x
    let raf = 0
    const off = carryBus.on((p) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        tilt = Math.max(-18, Math.min(18, tilt * 0.6 + (p.x - prevX) * 0.9))
        prevX = p.x
        if (el.current) el.current.style.transform = `translate3d(${p.x - w / 2}px, ${p.y - h / 2}px, 0) rotate(${tilt}deg)`
      })
    })
    return () => {
      cancelAnimationFrame(raf)
      off()
    }
  }, [badge, w, h])

  const phoneTap = badge === 'inserting' && device === 'iphone'
  useEffect(() => {
    if (!phoneTap) return
    const t = setTimeout(() => setBadge('inserted'), 520)
    return () => clearTimeout(t)
  }, [phoneTap, setBadge])

  // dropped into the little Mac on the home page: slide into its slot
  const intoMini = badge === 'inserting' && view === 'home'
  if (!(badge === 'carried' || badge === 'resting' || phoneTap || intoMini)) return null

  const at = badge === 'carried' ? carryBus.pos : (carry ?? carryBus.pos)
  let transform = `translate3d(${at.x - w / 2}px, ${at.y - h / 2}px, 0) rotate(${badge === 'resting' ? -4 : 0}deg)`
  let opacity = 1
  if (intoMini && miniTarget) {
    transform = usb
      ? `translate3d(${miniTarget.x - w / 2}px, ${miniTarget.y - h / 2}px, 0) rotate(90deg) scale(0.4)`
      : `translate3d(${miniTarget.x - w / 2}px, ${miniTarget.y - h * 0.15}px, 0) perspective(300px) rotateX(70deg) scale(0.75, 0.2)`
    opacity = 0
  } else if (phoneTap && target) {
    transform = `translate3d(${target.x - w / 2}px, ${target.y - h / 2}px, 0) scale(0.35)`
    opacity = 0
  }

  return (
    <button
      ref={el}
      className={`carried-badge ${badge} ${near ? 'near' : ''} ${phoneTap || intoMini ? 'tap' : ''}`}
      style={{ width: w, height: h, transform, opacity }}
      onPointerDown={(e) => {
        if (badge !== 'resting') return
        e.preventDefault()
        startCarry(e.clientX, e.clientY)
      }}
      aria-label={usb ? 'USB stick' : 'Floppy disk'}
    >
      {usb ? <UsbStick /> : <FloppyCard />}
    </button>
  )
}

/**
 * Eject control when the medium isn't visible in 3D: on the iPhone, and on the iMac / MacBook (whose
 * USB port is round the back). The Macintosh's floppy is pulled out of the slot directly.
 */
export function DockedBadge() {
  const kind = useMachine((s) =>
    s.view !== 'mac' || s.badge !== 'inserted' ? null : s.device === 'iphone' ? s.media : s.machine !== 'macintosh' ? 'usb' : null,
  )
  const pull = useMachine((s) => s.pullBadge)
  if (!kind) return null
  return (
    <button className={`docked-badge ${kind}`} onClick={pull} aria-label={kind === 'usb' ? 'Eject the USB stick' : 'Eject the floppy'}>
      {kind === 'usb' ? <UsbStick /> : <FloppyCard />}
      <span>{kind === 'usb' ? 'Eject USB' : 'Eject disk'}</span>
    </button>
  )
}
