import { create } from 'zustand'
import type { Machine } from './scene/layout'

export type { Machine }
export type Media = 'floppy' | 'usb'
/** Which media each computer takes. */
export const ACCEPTS: Record<Machine, Media> = { macintosh: 'floppy', imac: 'usb', macbook: 'usb' }

/**
 * view:   home <-> mac            (the classic site, or the 3D device)
 * device: mac | iphone            (iPhone on phones)
 * badge:  neck -> carried -> (resting) -> inserting -> inserted -> neck
 * power:  off -> booting -> on
 * mode:   desk -> diving -> inside -> surfacing -> desk      (full screen within the page)
 *
 * ("badge" is the carried media: a floppy for the Macintosh, a USB stick for the iMac / MacBook.)
 * - The site opens on the minimal home page: three little computers on a desk (a classic Macintosh
 *   plugged into the wall, an iMac, a MacBook), with a floppy and a USB stick.
 * - Drop a medium into a compatible computer and you zoom through it into its big 3D version (iPhone on
 *   phones), which boots with a different interface: System 7 on the Macintosh, macOS on the iMac,
 *   macOS dark on the MacBook. Unplugged, the little Macintosh refuses the disk.
 * - Pulling the floppy out of the big Mac brings you straight back to the home page; on the 3D view a
 *   disk dropped away from the slot rests where you left it.
 */
export type View = 'home' | 'mac'
export type Device = 'mac' | 'iphone'
export type BadgeState = 'neck' | 'carried' | 'resting' | 'inserting' | 'inserted'
export type PowerState = 'off' | 'booting' | 'on'
export type Mode = 'desk' | 'diving' | 'inside' | 'surfacing'

type Size = { width: number; height: number }
type Point = { x: number; y: number }

/** Where the badge "socket" is on screen (Mac slot or iPhone body), published by the 3D scene. */
export interface Target {
  x: number
  y: number
  /** half extents of the drop area in px */
  hw: number
  hh: number
  /** on-screen width of the 3D badge when held at the target's depth */
  cardPx: number
}

interface MachineState {
  view: View
  device: Device
  badge: BadgeState
  power: PowerState
  mode: Mode
  ready: boolean
  focus: boolean
  /** 1 = home page fully visible, 0 = hidden (driven by the drag). */
  homeOpacity: number
  /** Pointer position of the carried / resting badge (client px). */
  carry: Point | null
  /** The carried badge is over the slot / phone. */
  nearTarget: boolean
  /** Where the badge was let go, so the 3D badge can take over exactly there. */
  dropAt: Point | null
  target: Target | null
  /** Which computer is (or will be) shown in 3D, and which medium is being carried. */
  machine: Machine
  media: Media
  /** iMac colour (index into IMAC_COLORS), picked by clicking the little iMac. */
  imacColor: number
  /** The little computers on the home page: where their drop areas are on screen. */
  miniTargets: Partial<Record<Machine, Target>>
  /** The little computer the carried medium is hovering (compatible or not). */
  nearMachine: Machine | null
  /** Which little computers are plugged into the power strip. */
  powered: Record<Machine, boolean>
  /** Bumped by "Reconnect": every little computer glides back home and is plugged in again. */
  reconnectTick: number
  /** Phosphor colour of the little Macintosh's screen (index). */
  macTint: number
  /** A little computer refused the medium: bumps every time, for a shake + message. */
  refused: { machine: Machine; msg: string; n: number } | null
  /** Zooming from the little Mac on the home page into the big 3D one. */
  entering: boolean
  screen3d: Size
  viewport: Size
  screen: Size
  startCarry: (x: number, y: number, media?: Media) => void
  pullBadge: () => void
  setBadge: (b: BadgeState) => void
  enterInside: () => void
  exitInside: () => void
  setReady: () => void
  setFocus: (focus: boolean) => void
  setTarget: (t: Target) => void
  setMiniTarget: (m: Machine, t: Target) => void
  setImacColor: (i: number) => void
  setPowered: (m: Machine, on: boolean) => void
  reconnectAll: () => void
  setMacTint: (i: number) => void
  setScreen3d: (width: number, height: number) => void
  setViewport: (width: number, height: number) => void
}

export const BOOT_MS = 1500
const DIVE_MS = 1050
const SURFACE_MS = 900

/**
 * Pointer position of the carried floppy. It changes on every pointermove, so it lives outside the
 * store: only the floppy element listens to it (no React re-renders, no 3D redraws while dragging).
 */
export const carryBus = {
  pos: { x: 0, y: 0 },
  fns: new Set<(p: Point) => void>(),
  emit(p: Point) {
    this.pos = p
    this.fns.forEach((f) => f(p))
  },
  on(f: (p: Point) => void) {
    this.fns.add(f)
    return () => void this.fns.delete(f)
  },
}

let timer: ReturnType<typeof setTimeout> | undefined
const same = (a: Size, b: Size) => a.width === b.width && a.height === b.height
const detectDevice = (): Device => {
  const w = window.innerWidth
  const h = window.innerHeight
  return Math.min(w, h) < 600 || w / h < 0.75 ? 'iphone' : 'mac'
}

function isNear(t: Target | null, p: Point) {
  if (!t) return false
  return Math.abs(p.x - t.x) < t.hw && Math.abs(p.y - t.y) < t.hh
}

export const useMachine = create<MachineState>((set, get) => ({
  view: 'home',
  device: detectDevice(),
  badge: 'neck',
  power: 'off',
  mode: 'desk',
  ready: false,
  focus: false,
  homeOpacity: 1,
  carry: null,
  nearTarget: false,
  dropAt: null,
  target: null,
  machine: 'macintosh',
  media: 'floppy',
  imacColor: 0,
  miniTargets: {},
  nearMachine: null,
  powered: { macintosh: true, imac: true, macbook: true },
  reconnectTick: 0,
  macTint: 0,
  refused: null,
  entering: false,
  screen3d: { width: 800, height: 600 },
  viewport: { width: window.innerWidth, height: window.innerHeight },
  screen: { width: 800, height: 600 },

  startCarry: (x, y, media) => {
    const s = get()
    if (s.badge !== 'neck' && s.badge !== 'resting') return
    // from the home page you carry a medium to a little computer; on the 3D view, the disk to the big slot
    const fromHome = s.badge === 'neck'
    clearTimeout(timer)
    set({ badge: 'carried', carry: { x, y }, ...(fromHome && media ? { media } : {}) })
    const nearestMini = (p: Point): Machine | null => {
      const t = get().miniTargets
      for (const m of ['macintosh', 'imac', 'macbook'] as Machine[]) if (isNear(t[m] ?? null, p)) return m
      return null
    }

    carryBus.pos = { x, y }
    const move = (e: PointerEvent) => {
      const p = { x: e.clientX, y: e.clientY }
      carryBus.emit(p)
      if (fromHome) {
        const m = nearestMini(p)
        const ok = !!m && ACCEPTS[m] === get().media
        if (m !== get().nearMachine || ok !== get().nearTarget) set({ nearMachine: m, nearTarget: ok })
      } else {
        const near = isNear(get().target, p)
        if (near !== get().nearTarget) set({ nearTarget: near })
      }
    }
    const up = (e: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      const st = get()
      const p = { x: e.clientX, y: e.clientY }
      carryBus.pos = p
      set({ nearTarget: false, nearMachine: null, carry: p })
      if (fromHome) {
        const m = nearestMini(p)
        if (!m) return set({ badge: 'neck', carry: null })
        const refuse = (msg: string) => set({ badge: 'neck', carry: null, refused: { machine: m, msg, n: (st.refused?.n ?? 0) + 1 } })
        if (ACCEPTS[m] !== st.media) return refuse(st.media === 'usb' ? 'USB? It’s 1984 😅' : 'No floppy drive here 💾')
        if (!st.powered[m]) return refuse('Plug me in first ⚡')
        // into the little computer: zoom through it into the big one, which boots with the medium inside
        const t = st.miniTargets[m]!
        set({ badge: 'inserting', machine: m, carry: { x: t.x, y: t.y }, dropAt: null })
        timer = setTimeout(() => {
          set({ view: 'mac', mode: 'desk', focus: false, power: 'off', homeOpacity: 0, entering: true })
          get().setBadge('inserted')
          setTimeout(() => set({ entering: false }), 900)
        }, 380)
        return
      }
      const near = isNear(st.target, p)
      if (near) set({ badge: 'inserting', dropAt: p, carry: p })
      else set({ badge: 'resting', carry: p })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  },
  pullBadge: () => {
    const { badge, view } = get()
    if (view !== 'mac' || (badge !== 'inserted' && badge !== 'inserting')) return
    clearTimeout(timer)
    // immediate: badge out = device off = classic home page
    set((s) => ({
      view: 'home',
      badge: 'neck',
      power: 'off',
      mode: 'desk',
      focus: false,
      homeOpacity: 1,
      carry: null,
      screen: s.screen3d,
      device: detectDevice(),
    }))
  },
  setBadge: (badge) => {
    set({ badge })
    if (badge === 'inserted') {
      set({ carry: null, dropAt: null })
      if (get().power !== 'on') {
        clearTimeout(timer)
        set({ power: 'booting' })
        timer = setTimeout(() => set({ power: 'on' }), BOOT_MS)
      }
    }
  },
  enterInside: () => {
    const s = get()
    if (s.view !== 'mac' || s.power !== 'on' || s.badge !== 'inserted' || s.mode !== 'desk') return
    clearTimeout(timer)
    set({ mode: 'diving', focus: false })
    timer = setTimeout(() => set((st) => ({ mode: 'inside', screen: st.viewport })), DIVE_MS)
  },
  exitInside: () => {
    const { mode } = get()
    if (mode !== 'inside' && mode !== 'diving') return
    clearTimeout(timer)
    set((s) => ({ mode: 'surfacing', screen: s.screen3d }))
    timer = setTimeout(() => set({ mode: 'desk' }), SURFACE_MS)
  },
  setReady: () => {
    if (!get().ready) set({ ready: true })
  },
  setFocus: (focus) => {
    const s = get()
    if (focus && (s.power !== 'on' || s.badge !== 'inserted' || s.mode !== 'desk' || s.view !== 'mac' || s.device !== 'mac')) return
    if (s.focus !== focus) set({ focus })
  },
  setMiniTarget: (m, t) => {
    const o = get().miniTargets[m]
    if (o && o.x === t.x && o.y === t.y && o.hw === t.hw && o.hh === t.hh) return
    set((s) => ({ miniTargets: { ...s.miniTargets, [m]: t } }))
  },
  setImacColor: (imacColor) => set({ imacColor }),
  setPowered: (m, on) => {
    if (get().powered[m] !== on) set((s) => ({ powered: { ...s.powered, [m]: on } }))
  },
  reconnectAll: () => set((s) => ({ powered: { macintosh: true, imac: true, macbook: true }, reconnectTick: s.reconnectTick + 1 })),
  setMacTint: (macTint) => set({ macTint }),
  setTarget: (t) => {
    const o = get().target
    if (o && o.x === t.x && o.y === t.y && o.hw === t.hw && o.hh === t.hh && o.cardPx === t.cardPx) return
    set({ target: t })
  },
  setScreen3d: (width, height) => {
    const size = { width, height }
    if (same(size, get().screen3d)) return
    set((s) => ({ screen3d: size, screen: s.mode === 'inside' ? s.screen : size }))
  },
  setViewport: (width, height) => {
    const size = { width, height }
    if (same(size, get().viewport)) return
    set((s) => ({
      viewport: size,
      screen: s.mode === 'inside' ? size : s.screen,
      // only swap Mac <-> iPhone while the device isn't on screen
      device: s.view === 'home' ? detectDevice() : s.device,
    }))
  },
}))

// handy for debugging in the browser console (dev only)
if (import.meta.env.DEV) (window as unknown as { __machine: typeof useMachine }).__machine = useMachine
