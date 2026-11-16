import { useMemo, useState } from 'react'
import {
  Aperture,
  BookOpen,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Code,
  Compass,
  Download,
  FileText,
  Globe,
  GraduationCap,
  Info,
  Mail,
  MapPin,
  Mic,
  Network,
  Newspaper,
  Presentation,
  Search,
  Shield,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { content, formatDate, formatMonth } from '../../content'
import { AppIcon, Authors, Avatar, Group, Markdown, Row } from '../components/ui'
import { useWindows } from '../windows'

const { profile, experience, publications, projects, talks, teaching, news } = content

export interface Pane {
  id: string
  label: string
  icon: LucideIcon
  colors: [string, string]
  count?: number
}

export const PANES: (Pane | 'sep')[] = [
  { id: 'about', label: 'About', icon: Info, colors: ['#9b9ba1', '#6e6e75'] },
  { id: 'research', label: 'Research', icon: Sparkles, colors: ['#bf7cff', '#8944e6'] },
  'sep',
  { id: 'education', label: 'Education', icon: GraduationCap, colors: ['#4cd06d', '#28a745'] },
  { id: 'experience', label: 'Experience', icon: Briefcase, colors: ['#c48a54', '#99602c'] },
  'sep',
  { id: 'publications', label: 'Publications', icon: FileText, colors: ['#ff6b5e', '#e0352b'], count: publications.length },
  { id: 'projects', label: 'Projects', icon: Code, colors: ['#4aa8ff', '#1a73e8'], count: projects.length },
  { id: 'talks', label: 'Talks & Service', icon: Mic, colors: ['#ff8fb8', '#e2457f'] },
  { id: 'teaching', label: 'Teaching', icon: Presentation, colors: ['#ffc94a', '#f29b0a'] },
  { id: 'news', label: 'News', icon: Newspaper, colors: ['#ff5f57', '#c93a33'] },
  'sep',
  { id: 'links', label: 'Links & Contact', icon: Globe, colors: ['#5ac8fa', '#1e8bd8'] },
]

const RESEARCH_ICONS: Record<string, LucideIcon> = { aperture: Aperture, network: Network, shield: Shield, compass: Compass, book: BookOpen }

export function Settings() {
  const pane = useWindows((s) => s.settingsPane)
  const setPane = useWindows((s) => s.setSettingsPane)
  const [query, setQuery] = useState('')
  const [history, setHistory] = useState<string[]>([])

  const go = (id: string) => {
    if (id === pane) return
    setHistory((h) => [...h, pane])
    setPane(id)
  }
  const back = () => {
    const prev = history.at(-1)
    if (!prev) return
    setHistory((h) => h.slice(0, -1))
    setPane(prev)
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return PANES
    return PANES.filter((p): p is Pane => p !== 'sep' && p.label.toLowerCase().includes(q))
  }, [query])

  const current = PANES.find((p): p is Pane => p !== 'sep' && p.id === pane)
  const title = pane === 'profile' ? profile.name : current?.label ?? ''

  return (
    <div className="settings">
      <aside className="sidebar glass-inset">
        <label className="search">
          <Search size={12} />
          <input placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <nav>
          <button className={`account ${pane === 'profile' ? 'active' : ''}`} onClick={() => go('profile')}>
            <Avatar size={34} />
            <span>
              <strong>{profile.name}</strong>
              <small>{profile.role.split(' in ')[0]}</small>
            </span>
          </button>
          {filtered.map((p, i) =>
            p === 'sep' ? (
              <hr key={`sep${i}`} />
            ) : (
              <button key={p.id} className={pane === p.id ? 'active' : ''} onClick={() => go(p.id)}>
                <AppIcon icon={p.icon} colors={p.colors} size={20} glyph={0.62} radius={0.26} />
                <span>{p.label}</span>
                {p.count !== undefined && <em>{p.count}</em>}
              </button>
            ),
          )}
        </nav>
      </aside>
      <section className="pane">
        <header className="pane-header" data-drag>
          <button className="nav-btn" onClick={back} disabled={!history.length} aria-label="Back">
            <ChevronLeft size={16} />
          </button>
          <button className="nav-btn" disabled aria-label="Forward">
            <ChevronRight size={16} />
          </button>
          <h2>{title}</h2>
        </header>
        <div className="pane-body" key={pane}>
          <PaneContent pane={pane} go={go} />
        </div>
      </section>
    </div>
  )
}

export function PaneContent({ pane, go }: { pane: string; go: (id: string) => void }) {
  const open = useWindows((s) => s.open)
  switch (pane) {
    case 'profile':
      return (
        <>
          <div className="hero">
            <Avatar size={84} />
            <h1>
              {profile.name}
              {profile.title && <span className="muted">, {profile.title}</span>}
            </h1>
            <p>{profile.role}</p>
            <p className="muted">{profile.affiliation}</p>
          </div>
          <Group>
            {profile.location && <Row icon={<MapPin size={14} />} label="Location" value={`${profile.location} ${profile.flag ?? ''}`} />}
            {profile.email && <Row icon={<Mail size={14} />} label="Email" value={profile.email} href={`mailto:${profile.email}`} />}
            {profile.orcid && <Row icon={<Globe size={14} />} label="ORCID" value={profile.orcid} href={`https://orcid.org/${profile.orcid}`} />}
            {profile.cv && <Row icon={<Download size={14} />} label="Curriculum Vitae" value="PDF" href={profile.cv} />}
          </Group>
          <Group>
            <Row label="About" chevron onClick={() => go('about')} icon={<AppIcon icon={Info} colors={['#9b9ba1', '#6e6e75']} size={20} />} />
            <Row label="Publications" value={publications.length} chevron onClick={() => go('publications')} icon={<AppIcon icon={FileText} colors={['#ff6b5e', '#e0352b']} size={20} />} />
            <Row label="Experience" chevron onClick={() => go('experience')} icon={<AppIcon icon={Briefcase} colors={['#c48a54', '#99602c']} size={20} />} />
          </Group>
          {news[0] && (
            <Group title="Latest">
              <Row onClick={() => open('news')}>
                <span className="news-line">
                  <span>
                    <Markdown text={news[0].content} />
                  </span>
                  <small className="muted">{formatDate(news[0].date)}</small>
                </span>
              </Row>
            </Group>
          )}
        </>
      )
    case 'about':
      return (
        <>
          <Group title="Biography">
            <div className="prose">
              {profile.bio.map((p, i) => (
                <p key={i}>
                  <Markdown text={p} />
                </p>
              ))}
            </div>
          </Group>
          <Group>
            <Row label="Role" value={profile.role} />
            <Row label="Affiliation" value={profile.affiliation} />
          </Group>
        </>
      )
    case 'research':
      return (
        <Group title="Research interests">
          {profile.research.map((r) => {
            const Icon = RESEARCH_ICONS[r.icon ?? ''] ?? Sparkles
            return (
              <Row key={r.title} icon={<AppIcon icon={Icon} colors={['#bf7cff', '#8944e6']} size={28} />}>
                <span className="stack">
                  <strong>{r.title}</strong>
                  <small className="muted">{r.description}</small>
                </span>
              </Row>
            )
          })}
        </Group>
      )
    case 'education':
    case 'experience': {
      const items = experience.filter((e) => (pane === 'education') === (e.type === 'Education'))
      return (
        <Group title={pane === 'education' ? 'Degrees' : 'Positions'} footer={<button className="link" onClick={() => open('experience')}>Open timeline…</button>}>
          {items.map((e, i) => (
            <Row key={i} value={<span className="period">{formatMonth(e.start)} – {formatMonth(e.end) || 'Present'}</span>}>
              <span className="stack">
                <strong>{e.role}</strong>
                <small>
                  {e.organization}
                  {e.location && <span className="muted"> · {e.location}</span>}
                </small>
                {e.description && <small className="muted">{e.description}</small>}
              </span>
            </Row>
          ))}
        </Group>
      )
    }
    case 'publications':
      return (
        <>
          <Group title="Selected" footer="Click a paper to open it in Preview.">
            {publications.filter((p) => p.selected).map((p) => (
              <PubRow key={p.key} p={p} />
            ))}
          </Group>
          <Group title="All publications" footer={<button className="link" onClick={() => open('papers')}>Open in Papers…</button>}>
            {publications.filter((p) => !p.selected).map((p) => (
              <PubRow key={p.key} p={p} />
            ))}
          </Group>
        </>
      )
    case 'projects':
      return (
        <Group title="Software & tools">
          {projects.map((p) => (
            <Row key={p.title} href={p.github ?? p.demo ?? p.link} icon={<AppIcon icon={Code} colors={['#4aa8ff', '#1a73e8']} size={28} />}>
              <span className="stack">
                <strong>{p.title}</strong>
                <small className="muted">{p.description}</small>
              </span>
            </Row>
          ))}
        </Group>
      )
    case 'talks': {
      const types = [...new Set(talks.map((t) => t.type))]
      return (
        <>
          {types.map((type) => (
            <Group key={type} title={type}>
              {talks.filter((t) => t.type === type).map((t, i) => (
                <Row key={i} href={t.link} value={String(t.year)}>
                  <span className="stack">
                    <strong>{t.title}</strong>
                    {(t.venue || t.location) && <small className="muted">{[t.venue, t.location].filter(Boolean).join(' · ')}</small>}
                  </span>
                </Row>
              ))}
            </Group>
          ))}
        </>
      )
    }
    case 'teaching': {
      const years = [...new Set(teaching.map((t) => t.academicYear))]
      return (
        <>
          {years.map((y) => (
            <Group key={y} title={`A.Y. ${y}`}>
              {teaching.filter((t) => t.academicYear === y).map((t, i) => (
                <Row key={i} href={t.link} value={<span className="chip">{t.category}</span>}>
                  <span className="stack">
                    <strong>{t.title}</strong>
                    <small className="muted">{[t.degree, t.institution].filter(Boolean).join(' · ')}</small>
                  </span>
                </Row>
              ))}
            </Group>
          ))}
        </>
      )
    }
    case 'news':
      return (
        <Group title="Recent updates">
          {news.map((n, i) => (
            <Row key={i}>
              <span className="news-line">
                <span>
                  <Markdown text={n.content} />
                </span>
                <small className="muted">{formatDate(n.date)}{n.category ? ` · ${n.category}` : ''}</small>
              </span>
            </Row>
          ))}
        </Group>
      )
    case 'links':
      return (
        <>
          <Group title="Profiles">
            {profile.links.map((l) => (
              <Row key={l.href} label={l.label} value={new URL(l.href).hostname.replace(/^www\./, '')} href={l.href} icon={<Globe size={14} />} />
            ))}
          </Group>
          {profile.email && (
            <Group title="Contact">
              <Row label="Send an email" value={profile.email} href={`mailto:${profile.email}`} icon={<Mail size={14} />} />
            </Group>
          )}
        </>
      )
    default:
      return null
  }
}

function PubRow({ p }: { p: (typeof publications)[number] }) {
  const open = useWindows((s) => s.open)
  return (
    <Row onClick={() => open('paper', p.key)} chevron>
      <span className="stack">
        <strong>{p.title}</strong>
        <small className="muted">
          <Authors authors={p.authors} />
        </small>
        <small>
          <span className="venue">{p.venue}</span> · {p.year} {p.tag && <span className="chip">{p.tag}</span>}
        </small>
      </span>
    </Row>
  )
}
