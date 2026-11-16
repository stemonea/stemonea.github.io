import { useEffect, useState } from 'react'
import { BatteryFull, FileText, FolderOpen, IdCard, Search, SlidersHorizontal, Wifi } from 'lucide-react'
import { content } from '../content'
import { BOOT_MS, useMachine } from '../store'
import { APPS, DOCK, DOCK_EXTRA, type DockItem } from './apps'
import { AppIcon, AppleLogo, Markdown, Monogram } from './components/ui'
import { Window } from './Window'
import { useActiveWindow, useWindows } from './windows'

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(t)
  }, [])
  return (
    <span>
      {now.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}&nbsp;&nbsp;
      {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
    </span>
  )
}

function MenuBar() {
  const active = useActiveWindow()
  const open = useWindows((s) => s.open)
  const [menu, setMenu] = useState(false)
  const inside = useMachine((s) => s.mode === 'inside')
  const appName = active ? APPS[active.app].name : 'Finder'

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [menu])

  return (
    <div className="menubar">
      <div className="left">
        <button className={`apple ${menu ? 'open' : ''}`} onPointerDown={(e) => e.stopPropagation()} onClick={() => setMenu((m) => !m)}>
          <AppleLogo size={13} />
        </button>
        <strong>{appName}</strong>
        <span>File</span>
        <span>Edit</span>
        <span>View</span>
        <span className="hide-sm">Window</span>
        <span className="hide-sm">Help</span>
      </div>
      <div className="right">
        {inside && (
          <button className="exit-pill" onClick={() => useMachine.getState().exitInside()} title="Leave full screen (Esc)">
            <IdCard size={13} /> Exit
          </button>
        )}
        <BatteryFull size={16} />
        <Wifi size={13} />
        <Search size={12} />
        <SlidersHorizontal size={12} />
        <Clock />
      </div>
      {menu && (
        <div className="dropdown" onPointerDown={(e) => e.stopPropagation()}>
          <button onClick={() => (open('about'), setMenu(false))}>About This Mac</button>
          <hr />
          <button onClick={() => (open('settings'), setMenu(false))}>System Settings…</button>
          <button onClick={() => (open('finder'), setMenu(false))}>Open content folder…</button>
          <hr />
          <button
            onClick={() => {
              setMenu(false)
              useMachine.setState({ power: 'booting' })
              setTimeout(() => useMachine.setState({ power: 'on' }), BOOT_MS)
            }}
          >
            Restart…
          </button>
          {inside ? (
            <button onClick={() => (setMenu(false), useMachine.getState().exitInside())}>Leave Full Screen</button>
          ) : (
            <button onClick={() => (setMenu(false), useMachine.getState().enterInside())}>Enter Full Screen</button>
          )}
          <button onClick={() => (setMenu(false), useMachine.getState().pullBadge())}>Eject Disk &amp; Shut Down…</button>
        </div>
      )}
    </div>
  )
}

function Dock() {
  const windows = useWindows((s) => s.windows)
  const open = useWindows((s) => s.open)
  const running = new Set<string>(windows.map((w) => (w.app === 'paper' ? 'papers' : w.app === 'textedit' ? 'finder' : w.app)))
  const [bounce, setBounce] = useState<string>()

  const click = (item: DockItem) => {
    setBounce(item.id)
    setTimeout(() => setBounce(undefined), 600)
    if (item.app) open(item.app)
    else item.action?.()
  }
  const render = (item: DockItem) => (
    <button key={item.id} className={`dock-item ${bounce === item.id ? 'bounce' : ''}`} onClick={() => click(item)} aria-label={item.label}>
      <span className="tooltip">{item.label}</span>
      <AppIcon icon={item.icon} colors={item.colors} size={42} />
      {item.app && running.has(item.app) && <i className="dot" />}
    </button>
  )

  return (
    <div className="dock-wrap">
      <nav className="dock">
        {DOCK.map(render)}
        {DOCK_EXTRA.length > 0 && <span className="dock-sep" />}
        {DOCK_EXTRA.map(render)}
      </nav>
    </div>
  )
}

// the news banner appears once per boot (not again when switching to full screen)
let bannerShown = false
useMachine.subscribe((s, p) => {
  if (s.power === 'booting' && p.power !== 'booting') bannerShown = false
})

/** Banner with the latest news, shown shortly after login. */
function NotificationBanner() {
  const latest = content.news[0]
  const [show, setShow] = useState(false)
  const open = useWindows((s) => s.open)
  useEffect(() => {
    if (bannerShown) return
    const a = setTimeout(() => {
      bannerShown = true // set here, not above, so StrictMode's double effect doesn't skip it
      setShow(true)
    }, 1400)
    const b = setTimeout(() => setShow(false), 6500)
    return () => (clearTimeout(a), clearTimeout(b))
  }, [])
  if (!latest) return null
  return (
    <div className={`banner ${show ? 'show' : ''}`} onClick={() => (open('news'), setShow(false))}>
      <AppIcon icon={APPS_ICON} colors={['#ff6a64', '#c42d2a']} size={30} />
      <div>
        <strong>News</strong>
        <p>
          <Markdown text={latest.content} />
        </p>
      </div>
    </div>
  )
}
const APPS_ICON = DOCK.find((d) => d.id === 'news')!.icon

function DesktopIcons() {
  const open = useWindows((s) => s.open)
  const cv = content.profile.cv
  return (
    <div className="desktop-icons">
      {cv && (
        <a className="desk-icon" href={cv} target="_blank" rel="noreferrer">
          <span className="doc-icon pdf">
            <FileText size={26} />
            <i>PDF</i>
          </span>
          <span className="name">CV.pdf</span>
        </a>
      )}
      <button className="desk-icon" onClick={() => open('finder')}>
        <span className="folder-icon">
          <FolderOpen size={34} strokeWidth={1.5} />
        </span>
        <span className="name">content</span>
      </button>
    </div>
  )
}

export function Desktop() {
  const windows = useWindows((s) => s.windows)
  const active = useActiveWindow()

  return (
    <div className="desktop">
      <div className="wallpaper">
        <Monogram className="wall-logo" />
      </div>
      <MenuBar />
      <DesktopIcons />
      {windows.map((w) => (
        <Window key={w.id} win={w} active={active?.id === w.id} />
      ))}
      <NotificationBanner />
      <Dock />
    </div>
  )
}
