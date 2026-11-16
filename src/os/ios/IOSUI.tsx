import { useEffect, useState, type ReactNode } from 'react'
import { BatteryFull, ChevronLeft, ChevronRight, Signal, Wifi } from 'lucide-react'
import { content } from '../../content'
import { DOCK, DOCK_EXTRA, type DockItem } from '../apps'
import { AppIcon, Avatar, Monogram } from '../components/ui'
import { PANES, PaneContent, type Pane } from '../apps/Settings'
import { Paper } from '../apps/Papers'
import { Experience, News, Projects } from '../apps/Misc'
import { useWindows, type Win } from '../windows'
import './ios.css'

const { profile } = content

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(t)
  }, [])
  return now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

function StatusBar({ dark }: { dark?: boolean }) {
  const time = useClock()
  return (
    <div className={`ios-status ${dark ? 'dark' : ''}`}>
      <span className="ios-time">{time}</span>
      <span className="ios-island" />
      <span className="ios-status-right">
        <Signal size={14} strokeWidth={2.6} />
        <Wifi size={14} strokeWidth={2.6} />
        <BatteryFull size={20} strokeWidth={1.8} />
      </span>
    </div>
  )
}

/** Opens a System Settings pane directly (Talks, Teaching… have no app of their own). */
const openPane = (pane: string) => {
  const s = useWindows.getState()
  s.setSettingsPane(pane)
  s.open('settings')
}

const HOME_APPS: DockItem[] = DOCK.filter((d) => d.id !== 'terminal' && d.id !== 'finder')

function Icon({ item, label = true }: { item: DockItem; label?: boolean }) {
  const open = useWindows((s) => s.open)
  return (
    <button className="ios-app" onClick={() => (item.app ? open(item.app) : item.action?.())}>
      <AppIcon icon={item.icon} colors={item.colors} size={56} radius={0.26} glyph={0.5} />
      {label && <span>{item.label.replace('System ', '').replace(' & Service', '')}</span>}
    </button>
  )
}

function HomeScreen() {
  const dock: DockItem[] = [HOME_APPS.find((d) => d.id === 'settings')!, HOME_APPS.find((d) => d.id === 'papers')!, HOME_APPS.find((d) => d.id === 'experience')!, ...DOCK_EXTRA]
  const grid = HOME_APPS.filter((d) => !dock.includes(d))
  return (
    <div className="ios-home">
      <button className="ios-widget" onClick={() => openPane('profile')}>
        <Avatar size={58} />
        <span>
          <strong>{profile.name}</strong>
          <small>{profile.role}</small>
          <small className="dim">{profile.affiliation.split(',').pop()?.trim()}</small>
        </span>
      </button>
      <div className="ios-grid">
        {grid.map((item) => (
          <Icon key={item.id} item={item} />
        ))}
        <button className="ios-app" onClick={() => openPane('links')}>
          <AppIcon icon={PANE_LINKS.icon} colors={PANE_LINKS.colors} size={56} radius={0.26} glyph={0.5} />
          <span>Links</span>
        </button>
      </div>
      <div className="ios-dots">
        <i className="on" />
        <i />
      </div>
      <div className="ios-dock">
        {dock.map((item) => (
          <Icon key={item.id} item={item} label={false} />
        ))}
      </div>
    </div>
  )
}

const PANE_LINKS = PANES.find((p): p is Pane => p !== 'sep' && p.id === 'links')!

/** iOS Settings: a root list, each row pushing a pane. */
function IOSSettings() {
  const pane = useWindows((s) => s.settingsPane)
  const setPane = useWindows((s) => s.setSettingsPane)
  if (pane !== 'root')
    return (
      <div className="ios-pane">
        <PaneContent pane={pane} go={setPane} />
      </div>
    )
  return (
    <div className="ios-pane">
      <div className="group">
        <div className="group-box">
          <button className="row clickable ios-account" onClick={() => setPane('profile')}>
            <Avatar size={52} />
            <span className="row-main stack">
              <strong>{profile.name}</strong>
              <small className="muted">{profile.role}</small>
            </span>
            <ChevronRight size={16} className="ios-chev" />
          </button>
        </div>
      </div>
      {splitGroups(PANES).map((group, i) => (
        <div className="group" key={i}>
          <div className="group-box">
            {group.map((p) => (
              <button key={p.id} className="row clickable" onClick={() => setPane(p.id)}>
                <span className="row-icon">
                  <AppIcon icon={p.icon} colors={p.colors} size={29} radius={0.24} glyph={0.6} />
                </span>
                <span className="row-main">{p.label}</span>
                {p.count !== undefined && <span className="row-value">{p.count}</span>}
                <ChevronRight size={16} className="ios-chev" />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function splitGroups(panes: (Pane | 'sep')[]) {
  const out: Pane[][] = [[]]
  for (const p of panes) {
    if (p === 'sep') out.push([])
    else out[out.length - 1]!.push(p)
  }
  return out.filter((g) => g.length)
}

const TITLES: Partial<Record<Win['app'], string>> = {
  papers: 'Publications',
  experience: 'Experience',
  projects: 'Projects',
  news: 'News',
}

function AppScreen({ win }: { win: Win }) {
  const close = useWindows((s) => s.close)
  const pane = useWindows((s) => s.settingsPane)
  const setPane = useWindows((s) => s.setSettingsPane)
  let title = TITLES[win.app] ?? ''
  let body: ReactNode = null
  let back = () => close(win.id)
  let backLabel = 'Home'
  switch (win.app) {
    case 'settings':
      if (pane === 'root') title = 'Settings'
      else {
        const p = PANES.find((x): x is Pane => x !== 'sep' && x.id === pane)
        title = pane === 'profile' ? profile.name : (p?.label ?? '')
        back = () => setPane('root')
        backLabel = 'Settings'
      }
      body = <IOSSettings />
      break
    case 'papers':
      body = (
        <div className="ios-pane">
          <PaneContent pane="publications" go={() => {}} />
        </div>
      )
      break
    case 'paper':
      title = 'Paper'
      backLabel = 'Back'
      body = <Paper id={win.arg} />
      break
    case 'experience':
      body = <Experience />
      break
    case 'projects':
      body = <Projects />
      break
    case 'news':
      body = <News />
      break
    default:
      body = <p className="empty">Not available on iPhone.</p>
  }
  return (
    <div className="ios-appscreen" key={win.id + pane}>
      <StatusBar dark />
      <header className="ios-nav">
        <button onClick={back}>
          <ChevronLeft size={22} strokeWidth={2.4} /> {backLabel}
        </button>
      </header>
      <h1 className="ios-title">{title}</h1>
      <div className="ios-body">{body}</div>
    </div>
  )
}

/** iOS on the iPhone screen. The "window" stack of the macOS UI becomes a navigation stack. */
export function IOSUI() {
  const windows = useWindows((s) => s.windows)
  const top = windows.filter((w) => !w.minimized).sort((a, b) => b.z - a.z)[0]
  const goHome = () => useWindows.setState({ windows: [], settingsPane: 'root' })
  return (
    <div className="ios">
      <div className="ios-wallpaper">
        <Monogram className="wall-logo" />
      </div>
      {!top && <StatusBar />}
      <HomeScreen />
      {top && <AppScreen win={top} />}
      <button className={`ios-home-indicator ${top ? 'dark' : ''}`} onClick={goHome} aria-label="Home" />
    </div>
  )
}
