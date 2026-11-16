import { create } from 'zustand'
import { useMachine } from '../store'

export type AppId =
  | 'settings'
  | 'papers'
  | 'paper'
  | 'experience'
  | 'projects'
  | 'news'
  | 'terminal'
  | 'finder'
  | 'textedit'
  | 'about'

export interface Win {
  id: string
  app: AppId
  /** e.g. the publication key for 'paper', the file name for 'textedit' */
  arg?: string
  x: number
  y: number
  w: number
  h: number
  z: number
  minimized: boolean
  maximized: boolean
}

export const MENUBAR_H = 26
export const DOCK_H = 66

interface WindowState {
  windows: Win[]
  topZ: number
  settingsPane: string
  open: (app: AppId, arg?: string) => void
  close: (id: string) => void
  focus: (id: string) => void
  move: (id: string, x: number, y: number) => void
  resize: (id: string, w: number, h: number) => void
  minimize: (id: string) => void
  toggleMaximize: (id: string) => void
  setSettingsPane: (pane: string) => void
  reset: () => void
}

/** Preferred size of each app window, as [width, height] in virtual px (clamped to the screen). */
const SIZES: Record<AppId, [number, number]> = {
  settings: [760, 520],
  papers: [700, 440],
  paper: [560, 560],
  experience: [560, 500],
  projects: [620, 440],
  news: [440, 480],
  terminal: [580, 360],
  finder: [600, 380],
  textedit: [560, 460],
  about: [300, 420],
}

let cascade = 0

function place(app: AppId): Pick<Win, 'x' | 'y' | 'w' | 'h' | 'maximized'> {
  const { width, height } = useMachine.getState().screen
  const availH = height - MENUBAR_H - DOCK_H - 12
  const [pw, ph] = SIZES[app]
  const w = Math.min(pw, width - 24)
  const h = Math.min(ph, availH)
  const compact = width < 620
  const off = (cascade++ % 6) * 22
  const x = Math.max(8, Math.round((width - w) / 2) + off - 44)
  const y = Math.max(MENUBAR_H + 6, Math.round(MENUBAR_H + (availH - h) / 2) + off - 30)
  return { x: Math.min(x, width - w - 8), y: Math.min(y, MENUBAR_H + availH - h + 6), w, h, maximized: compact }
}

const initial = (): Pick<WindowState, 'windows' | 'topZ' | 'settingsPane'> => {
  cascade = 0
  // iPhone: start on the Home Screen. Mac: System Settings open on the profile.
  if (useMachine.getState().device === 'iphone') return { windows: [], topZ: 1, settingsPane: 'root' }
  return { windows: [{ id: 'settings', app: 'settings', z: 1, minimized: false, ...place('settings') }], topZ: 1, settingsPane: 'profile' }
}

export const useWindows = create<WindowState>((set, get) => ({
  ...initial(),
  open: (app, arg) => {
    const id = arg ? `${app}:${arg}` : app
    const { windows, topZ } = get()
    const existing = windows.find((w) => w.id === id)
    if (existing) {
      set({
        topZ: topZ + 1,
        windows: windows.map((w) => (w.id === id ? { ...w, z: topZ + 1, minimized: false } : w)),
      })
      return
    }
    set({ topZ: topZ + 1, windows: [...windows, { id, app, arg, z: topZ + 1, minimized: false, ...place(app) }] })
  },
  close: (id) => set({ windows: get().windows.filter((w) => w.id !== id) }),
  focus: (id) => {
    const { windows, topZ } = get()
    const win = windows.find((w) => w.id === id)
    if (!win || win.z === topZ) return
    set({ topZ: topZ + 1, windows: windows.map((w) => (w.id === id ? { ...w, z: topZ + 1 } : w)) })
  },
  move: (id, x, y) => set({ windows: get().windows.map((w) => (w.id === id ? { ...w, x, y } : w)) }),
  resize: (id, w, h) => set({ windows: get().windows.map((win) => (win.id === id ? { ...win, w, h } : win)) }),
  minimize: (id) => set({ windows: get().windows.map((w) => (w.id === id ? { ...w, minimized: true } : w)) }),
  toggleMaximize: (id) => set({ windows: get().windows.map((w) => (w.id === id ? { ...w, maximized: !w.maximized } : w)) }),
  setSettingsPane: (settingsPane) => set({ settingsPane }),
  reset: () => set(initial()),
}))

/** The focused (top-most, visible) window. */
export const useActiveWindow = () =>
  useWindows((s) => {
    let top: Win | undefined
    for (const w of s.windows) if (!w.minimized && (!top || w.z > top.z)) top = w
    return top
  })

/**
 * Keep the session across the desk <-> full-screen switch: when the virtual resolution changes,
 * windows are moved proportionally and grow (up to a comfortable size) to use the new space.
 */
function relayout(prev: { width: number; height: number }, next: { width: number; height: number }) {
  const rx = next.width / prev.width
  const ry = next.height / prev.height
  const availH = next.height - MENUBAR_H - DOCK_H - 12
  useWindows.setState((st) => ({
    windows: st.windows.map((w) => {
      const [pw, ph] = SIZES[w.app]
      // scale with the screen, but never below the app's preferred size (if it fits) nor above 1.35×
      const nw = Math.round(Math.min(Math.max(w.w * rx, Math.min(pw, next.width - 24)), pw * 1.35, next.width - 24))
      const nh = Math.round(Math.min(Math.max(w.h * ry, Math.min(ph, availH)), ph * 1.35, availH))
      const cx = (w.x + w.w / 2) * rx
      const cy = (w.y - MENUBAR_H + w.h / 2) * ry + MENUBAR_H
      return {
        ...w,
        w: nw,
        h: nh,
        x: Math.round(Math.max(8, Math.min(cx - nw / 2, next.width - nw - 8))),
        y: Math.round(Math.max(MENUBAR_H + 6, Math.min(cy - nh / 2, MENUBAR_H + availH - nh + 6))),
        maximized: next.width < 620 ? true : w.maximized && prev.width >= 620,
      }
    }),
  }))
}

useMachine.subscribe((s, prev) => {
  // a fresh session on every boot
  if (s.power === 'booting' && prev.power !== 'booting') useWindows.getState().reset()
  else if (s.screen !== prev.screen && prev.screen.width > 0) relayout(prev.screen, s.screen)
})
