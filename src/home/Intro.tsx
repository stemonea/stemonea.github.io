import { useEffect, useState, type ReactNode } from 'react'
import { BookOpen, Globe, GraduationCap, Mail } from 'lucide-react'
import { content, type ResearchArea } from '../content'
import { Markdown } from '../os/components/ui'
import { Desk } from './Desk'

const { profile } = content

// --- small brand glyphs (lucide has no brand icons) ---
const GitHub = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
    <path d="M9 18c-4.51 2-5-2-7-2" />
  </svg>
)
const LinkedIn = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z" />
    <rect x="2" y="9" width="4" height="12" />
    <circle cx="4" cy="4" r="2" />
  </svg>
)
const XLogo = () => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
    <path d="M4 4l16 16M20 4L4 20" />
  </svg>
)
const Orcid = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="10" />
    <text x="12" y="16" textAnchor="middle" fontSize="10" fontWeight="700" fill="currentColor" stroke="none">iD</text>
  </svg>
)

function iconFor(label: string): ReactNode {
  const l = label.toLowerCase()
  if (l.includes('scholar')) return <GraduationCap size={17} strokeWidth={1.8} />
  if (l.includes('github')) return <GitHub />
  if (l.includes('linkedin')) return <LinkedIn />
  if (l === 'x' || l.includes('twitter')) return <XLogo />
  if (l.includes('orcid')) return <Orcid />
  if (l.includes('dblp')) return <BookOpen size={17} strokeWidth={1.8} />
  return <Globe size={17} strokeWidth={1.8} />
}

/** "Hey, I'm …" written by hand, letter by letter. */
function Hello() {
  const full = `Hey, I'm ${profile.name.split(' ')[0]}`
  const [n, setN] = useState(0)
  useEffect(() => {
    if (n >= full.length) return
    const t = setTimeout(() => setN(n + 1), n === 0 ? 500 : 75)
    return () => clearTimeout(t)
  }, [n, full.length])
  return (
    <h1 className="m-hello" aria-label={full}>
      {full.slice(0, n)}
      <span className="m-caret" />
    </h1>
  )
}

/** A dotted-underlined term that previews a research area on hover. */
function Term({ area }: { area: ResearchArea }) {
  return (
    <span className="m-term" tabIndex={0}>
      {/^[A-Z][a-z]/.test(area.title) ? area.title[0]!.toLowerCase() + area.title.slice(1) : area.title}
      <span className="m-pop" role="tooltip">
        <strong>{area.title}</strong>
        {area.description}
      </span>
    </span>
  )
}

function Social() {
  const [copied, setCopied] = useState(false)
  return (
    <div className="m-social">
      {profile.links.map((l) => (
        <a key={l.href} href={l.href} target="_blank" rel={l.rel ?? 'noreferrer'} data-tip={l.label} aria-label={l.label}>
          {iconFor(l.label)}
        </a>
      ))}
      {profile.email && (
        <button
          data-tip={copied ? 'Copied' : 'Click to copy'}
          aria-label="Copy email address"
          onClick={() => {
            navigator.clipboard?.writeText(profile.email!)
            setCopied(true)
            setTimeout(() => setCopied(false), 1600)
          }}
        >
          <Mail size={17} strokeWidth={1.8} />
        </button>
      )}
    </div>
  )
}

/** Slide 1: the classic home page, from the desk down to the links. */
export function Intro() {
  const r = profile.research
  return (
    <div className="s-intro">
      <Desk />
      <Hello />
      {profile.bio[0] && (
        <p className="m-lead">
          <Markdown text={profile.bio[0]} />
        </p>
      )}
      {r.length > 0 && (
        <p className="m-lead">
          I'm currently working on{' '}
          {r.map((a, i) => (
            <span key={a.title}>
              <Term area={a} />
              {i < r.length - 2 ? ', ' : i === r.length - 2 ? ' and ' : '.'}
            </span>
          ))}
        </p>
      )}
      <Social />
    </div>
  )
}
