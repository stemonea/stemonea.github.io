import { Suspense, useEffect, useState, type ReactNode } from 'react'
import { Scene } from './scene/Scene'
import { useMachine } from './store'
import { content } from './content'
import { CssScreenLayer } from './scene/CssScreen'
import { ScreenUI } from './os/ScreenUI'
import { HomePage } from './home/HomePage'
import { CarriedBadge, DockedBadge } from './home/CarriedBadge'

function Hint() {
  // individual selectors (not the whole store), so this doesn't re-render on every state change
  const s = {
    view: useMachine((st) => st.view),
    mode: useMachine((st) => st.mode),
    badge: useMachine((st) => st.badge),
    focus: useMachine((st) => st.focus),
    power: useMachine((st) => st.power),
    device: useMachine((st) => st.device),
    machine: useMachine((st) => st.machine),
    homeOpacity: useMachine((st) => st.homeOpacity),
  }
  const [zoomedOnce, setZoomedOnce] = useState(false)
  if (s.focus && !zoomedOnce) setZoomedOnce(true)
  const mac = s.device === 'mac'
  const classic = mac && s.machine === 'macintosh'

  let text: ReactNode = null
  if (s.view !== 'mac' || s.mode !== 'desk' || s.homeOpacity > 0.2) text = null
  else if (s.badge === 'carried' || s.badge === 'resting')
    text = mac ? (
      <>
        <kbd>Drop the floppy</kbd> into the slot to boot the Mac
      </>
    ) : (
      <>
        <kbd>Drop the floppy</kbd> on the iPhone to unlock it
      </>
    )
  else if (s.focus)
    text = (
      <>
        <kbd>Esc</kbd> or click outside the screen to zoom out
      </>
    )
  else if (s.power === 'on' && s.badge === 'inserted')
    text = !mac ? null : (
      <>
        {!zoomedOnce && (
          <>
            <kbd>Click the screen</kbd> to zoom ·{' '}
          </>
        )}
        {classic ? (
          <>
            <kbd>pull the floppy out</kbd> for the classic site
          </>
        ) : (
          <>
            <kbd>{s.machine === 'macbook' ? 'Pull the USB stick out' : 'Eject USB'}</kbd> for the classic site
          </>
        )}
      </>
    )
  return (
    <div className={`hint ${s.badge === 'carried' || s.badge === 'resting' ? 'off' : ''} ${text ? '' : 'hidden'}`}>
      <span className="pulse" />
      <span>{text ?? ' '}</span>
    </div>
  )
}

/** Bottom-right controls: zoom out (when zoomed) + full screen within the page. */
function DeskControls() {
  const focus = useMachine((s) => s.focus)
  const canEnter = useMachine((s) => s.view === 'mac' && s.power === 'on' && s.badge === 'inserted' && s.mode === 'desk')
  const { setFocus, enterInside } = useMachine.getState()
  return (
    <div className="desk-controls">
      <button className={`pill ${focus ? '' : 'hidden'}`} onClick={() => setFocus(false)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
        </svg>
        Show the Mac
      </button>
      <button className={`pill primary ${canEnter ? '' : 'hidden'}`} onClick={enterInside}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
        </svg>
        Full screen
      </button>
    </div>
  )
}

export default function App() {
  const ready = useMachine((s) => s.ready)
  const focus = useMachine((s) => s.focus)
  const mode = useMachine((s) => s.mode)
  const view = useMachine((s) => s.view)
  const power = useMachine((s) => s.power)
  const homeOpacity = useMachine((s) => s.homeOpacity)
  // the page starts fading the moment the medium goes in, together with the zoom into the little computer
  const entering = useMachine((s) => s.entering || (s.badge === 'inserting' && s.view === 'home'))
  const phone = useMachine((s) => s.device === 'iphone')
  const setFocus = useMachine((s) => s.setFocus)

  useEffect(() => {
    document.title = content.profile.name
  }, [])

  // keyboard + viewport
  useEffect(() => {
    const st = useMachine.getState
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (st().mode === 'inside' || st().mode === 'diving') st().exitInside()
      else st().setFocus(false)
    }
    const onResize = () => st().setViewport(window.innerWidth, window.innerHeight)
    onResize()
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  const inside = mode === 'inside'
  const homeVisible = view === 'home' || homeOpacity > 0 || entering
  return (
    <div className={`stage ${power === 'off' ? 'room-lit' : ''} ${ready ? 'ready' : ''} ${focus ? 'focused' : ''} mode-${mode} view-${view}`}>
      {/* clicking anywhere on the 3D scene (outside the screen) leaves the close-up */}
      {/* on phones the desk is decorative only, so the 3D scene isn't even loaded */}
      {!phone && (
        <div className="canvas-wrap" onPointerDown={() => focus && setFocus(false)}>
          <Suspense fallback={null}>
            <Scene />
          </Suspense>
        </div>
      )}
      {view === 'mac' && !inside && (
        <CssScreenLayer onPointerDown={() => setFocus(true)}>
          <ScreenUI />
        </CssScreenLayer>
      )}
      {view === 'mac' && inside && (
        <div className="os-fullscreen">
          <ScreenUI fullscreen />
        </div>
      )}
      {view === 'mac' && (
        <>
          <Hint />
          <DeskControls />
          <DockedBadge />
        </>
      )}
      {homeVisible && (
        // dropping the floppy in the little Mac zooms through it into the big one
        <div className={`home-layer ${entering ? 'entering' : ''}`}>
          <HomePage />
        </div>
      )}
      <CarriedBadge />
    </div>
  )
}
