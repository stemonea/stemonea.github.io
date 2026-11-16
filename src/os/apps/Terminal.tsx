import { useEffect, useRef, useState, type ReactNode } from 'react'
import { content } from '../../content'
import { useMachine } from '../../store'
import { useWindows, type AppId } from '../windows'

const user = content.profile.name.split(' ')[0]!.toLowerCase()
const PROMPT = `${user}@macintosh ~ %`

const OPENABLE: Record<string, AppId> = {
  settings: 'settings',
  papers: 'papers',
  publications: 'papers',
  experience: 'experience',
  projects: 'projects',
  news: 'news',
  finder: 'finder',
}

export function Terminal() {
  const [lines, setLines] = useState<ReactNode[]>([
    `Last login: ${new Date().toDateString()} on ttys000`,
    'Type `help` to see what you can do.',
  ])
  const [input, setInput] = useState('')
  const [hist, setHist] = useState<string[]>([])
  const [hIdx, setHIdx] = useState(-1)
  const bottom = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const open = useWindows((s) => s.open)

  // keep the prompt in view (scroll only the window body: scrollIntoView would also scroll the 3D layer)
  useEffect(() => {
    const body = bottom.current?.closest('.window-body')
    if (body) body.scrollTop = body.scrollHeight
  }, [lines])

  const run = (cmdline: string) => {
    const [cmd = '', ...args] = cmdline.trim().split(/\s+/)
    const out: ReactNode[] = []
    switch (cmd) {
      case '':
        break
      case 'help':
        out.push(
          'Available commands:',
          '  whoami              who is this?',
          '  ls                  list content files',
          '  cat <file>          print a YAML file',
          '  open <app>          settings | papers | experience | projects | news | finder',
          '  neofetch            system info',
          '  fullscreen | exit   enter / leave full screen',
          '  shutdown            eject the floppy (back to the classic site)',
          '  clear               clear the screen',
        )
        break
      case 'whoami':
        out.push(`${content.profile.name} — ${content.profile.role}`, content.profile.affiliation)
        break
      case 'ls':
        out.push(Object.keys(content.raw).sort().join('   '))
        break
      case 'cat': {
        const f = args[0]
        const file = f && (content.raw[f] !== undefined ? f : content.raw[`${f}.yaml`] !== undefined ? `${f}.yaml` : undefined)
        if (!file) out.push(`cat: ${f ?? ''}: No such file or directory`)
        else out.push(<pre key="cat">{content.raw[file]}</pre>)
        break
      }
      case 'open': {
        const app = OPENABLE[args[0] ?? '']
        if (app) open(app)
        else out.push(`open: unknown application "${args[0] ?? ''}"`)
        break
      }
      case 'neofetch':
        out.push(
          <pre key="nf" className="neofetch">
            {`        .:'        ${user}@macintosh
    __ :'__        ------------------
 .'\`  \`-'  \`\`.    OS: macOS Tahoe 26 (three.js)
:          .-'     Host: Macintosh 128K (2026 remaster)
:         :        Shell: zsh
 :         \`-;     Papers: ${content.publications.length}
  \`.__.-.__.'      Projects: ${content.projects.length}
                   Uptime: since ${new Date().getFullYear() - 2}`}
          </pre>,
        )
        break
      case 'shutdown':
      case 'halt':
        useMachine.getState().pullBadge()
        break
      case 'exit':
        useMachine.getState().exitInside()
        break
      case 'fullscreen':
        useMachine.getState().enterInside()
        break
      case 'sudo':
        out.push(`${user} is not in the sudoers file. This incident will be reported.`)
        break
      case 'clear':
        setLines([])
        return
      case 'echo':
        out.push(args.join(' '))
        break
      default:
        out.push(`zsh: command not found: ${cmd}`)
    }
    setLines((l) => [...l, `${PROMPT} ${cmdline}`, ...out])
  }

  return (
    <div className="terminal selectable" onClick={() => inputRef.current?.focus()}>
      {lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
      <div className="input-line" ref={bottom}>
        <span>{PROMPT}&nbsp;</span>
        <input
          ref={inputRef}
          autoFocus
          spellCheck={false}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              run(input)
              if (input.trim()) setHist((h) => [input, ...h])
              setInput('')
              setHIdx(-1)
            } else if (e.key === 'ArrowUp') {
              const n = Math.min(hIdx + 1, hist.length - 1)
              if (hist[n] !== undefined) {
                setHIdx(n)
                setInput(hist[n])
              }
              e.preventDefault()
            } else if (e.key === 'ArrowDown') {
              const n = hIdx - 1
              setHIdx(Math.max(n, -1))
              setInput(n >= 0 ? hist[n]! : '')
              e.preventDefault()
            }
          }}
        />
      </div>
    </div>
  )
}
