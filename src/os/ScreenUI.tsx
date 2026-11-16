import { useMachine } from '../store'
import { AppleLogo } from './components/ui'
import { Desktop } from './Desktop'
import { IOSUI } from './ios/IOSUI'
import './os.css'
import './themes.css'

function BootScreen() {
  return (
    <div className="boot">
      <AppleLogo size={64} color="#f5f5f7" />
      <div className="progress">
        <i />
      </div>
    </div>
  )
}

/** A smiling compact Mac, drawn from scratch in the spirit of the 1984 start-up icon. */
function HappyMac() {
  return (
    <svg width="64" height="80" viewBox="0 0 32 40" shapeRendering="crispEdges" aria-hidden>
      <path d="M3 1h26v30H3z" fill="#fff" stroke="#000" strokeWidth="2" />
      <path d="M7 5h18v16H7z" fill="#fff" stroke="#000" strokeWidth="2" />
      <path d="M12 10v3M20 10v3" stroke="#000" strokeWidth="2" />
      <path d="M16 11v4h-2" fill="none" stroke="#000" strokeWidth="1.5" />
      <path d="M12 17c2 2 6 2 8 0" fill="none" stroke="#000" strokeWidth="1.5" />
      <path d="M7 26h6M19 26h7" stroke="#000" strokeWidth="1.5" />
      <path d="M5 31h22v6H5z" fill="#fff" stroke="#000" strokeWidth="2" />
    </svg>
  )
}

/** System 7-style start-up: a happy Mac, then "Welcome to Macintosh." */
function RetroBoot() {
  return (
    <div className="boot retro-boot">
      <div className="retro-happy">
        <HappyMac />
      </div>
      <div className="retro-welcome">Welcome to Macintosh.</div>
    </div>
  )
}

/**
 * Everything rendered on the device's screen: macOS (light on the Macintosh and the iMac, dark on the
 * MacBook; the Macintosh starts up with the 1984-style "Welcome to Macintosh"), iOS on the iPhone. The same UI is used on the 3D screen and, in "Full screen" mode, across the whole page.
 */
export function ScreenUI({ fullscreen = false }: { fullscreen?: boolean }) {
  const power = useMachine((s) => s.power)
  const device = useMachine((s) => s.device)
  const machine = useMachine((s) => s.machine)
  const { width, height } = useMachine((s) => s.screen)
  if (power === 'off') return null
  const ios = device === 'iphone'
  // same macOS on the Macintosh and the iMac (only the Macintosh boots the 1984 way); dark on the MacBook
  const theme = ios ? '' : machine === 'macbook' ? ' dark macbook' : machine === 'imac' ? ' imac' : ''
  const cls = `screen ${ios ? 'ios' : 'macos'}${theme} power-${power}${!ios && width < 640 ? ' compact' : ''}${fullscreen ? ' fullscreen' : ''}`
  return (
    <div className={cls} style={{ width, height }}>
      {power === 'booting' ? !ios && machine === 'macintosh' ? <RetroBoot /> : <BootScreen /> : ios ? <IOSUI /> : <Desktop />}
    </div>
  )
}
