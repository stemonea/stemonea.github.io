import { memo, useRef, type PointerEvent as RPointerEvent } from 'react'
import { useMachine } from '../store'
import { APPS } from './apps'
import { DOCK_H, MENUBAR_H, useWindows, type Win } from './windows'

/** Ratio between real screen pixels and virtual (CSS) pixels of the 3D screen. */
function screenScale(el: HTMLElement) {
  const root = el.closest<HTMLElement>('.screen')
  if (!root) return 1
  return root.getBoundingClientRect().width / root.offsetWidth || 1
}

export const Window = memo(function Window({ win, active }: { win: Win; active: boolean }) {
  const { focus, close, minimize, toggleMaximize, move, resize } = useWindows.getState()
  const screen = useMachine((s) => s.screen)
  const app = APPS[win.app]
  const ref = useRef<HTMLDivElement>(null)

  // clamp to the current virtual screen (it changes with the browser size)
  const w = Math.min(win.w, screen.width - 16)
  const h = Math.min(win.h, screen.height - MENUBAR_H - DOCK_H - 8)
  const x = Math.max(0, Math.min(win.x, screen.width - w))
  const y = Math.max(MENUBAR_H, Math.min(win.y, screen.height - 40))
  const style = win.maximized
    ? { left: 0, top: MENUBAR_H, width: screen.width, height: screen.height - MENUBAR_H - DOCK_H, zIndex: win.z }
    : { left: x, top: y, width: w, height: h, zIndex: win.z }

  const startDrag = (e: RPointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (win.maximized || e.button !== 0) return
    if (!target.closest('[data-drag]') || target.closest('button, input, a, label')) return
    const s = screenScale(target)
    const sx = e.clientX
    const sy = e.clientY
    const el = target
    el.setPointerCapture(e.pointerId)
    const onMove = (ev: PointerEvent) => move(win.id, x + (ev.clientX - sx) / s, Math.max(MENUBAR_H, y + (ev.clientY - sy) / s))
    const onUp = () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
  }

  const startResize = (e: RPointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    const s = screenScale(e.currentTarget)
    const sx = e.clientX
    const sy = e.clientY
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const onMove = (ev: PointerEvent) =>
      resize(win.id, Math.max(300, w + (ev.clientX - sx) / s), Math.max(200, h + (ev.clientY - sy) / s))
    const onUp = () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
  }

  return (
    <div
      ref={ref}
      className={`window ${active ? 'active' : ''} ${app.dark ? 'dark' : ''} ${app.chromeless ? 'chromeless' : ''} ${win.minimized ? 'minimized' : ''}`}
      style={style}
      onPointerDownCapture={() => focus(win.id)}
      onPointerDown={startDrag}
    >
      <div className="traffic">
        <button className="close" aria-label="Close" onClick={() => close(win.id)} />
        <button className="min" aria-label="Minimise" onClick={() => minimize(win.id)} />
        <button className="max" aria-label="Zoom" onClick={() => toggleMaximize(win.id)} />
      </div>
      {!app.chromeless && (
        <div className="titlebar" data-drag onDoubleClick={() => toggleMaximize(win.id)}>
          {app.title(win.arg)}
        </div>
      )}
      <div className="window-body">
        <app.Component arg={win.arg} />
      </div>
      {!win.maximized && <div className="resize-handle" onPointerDown={startResize} />}
    </div>
  )
})
