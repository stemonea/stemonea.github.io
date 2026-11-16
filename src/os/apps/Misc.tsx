import { useState } from 'react'
import { Code, ExternalLink, FileCode2, Folder, HardDrive, Monitor } from 'lucide-react'
import { content, formatDate, formatMonth } from '../../content'
import { AppIcon, AppleLogo, Avatar, Markdown } from '../components/ui'
import { useWindows } from '../windows'

const { profile, experience, projects, news } = content

const TYPE_COLORS: Record<string, string> = {
  Education: '#34c759',
  Industry: '#ff9f0a',
  Research: '#5e5ce6',
  Visiting: '#0a84ff',
}

/** Timeline of experiences & education. */
export function Experience() {
  const types = ['All', ...new Set(experience.map((e) => e.type))]
  const [type, setType] = useState('All')
  const items = experience.filter((e) => type === 'All' || e.type === type)
  return (
    <div className="experience">
      <header className="toolbar center" data-drag>
        <div className="segmented">
          {types.map((t) => (
            <button key={t} className={t === type ? 'active' : ''} onClick={() => setType(t)}>
              {t}
            </button>
          ))}
        </div>
      </header>
      <ol className="timeline">
        {items.map((e, i) => (
          <li key={i} style={{ ['--dot' as string]: TYPE_COLORS[e.type] ?? '#8e8e93' }}>
            <span className="when">
              {formatMonth(e.start)} — {formatMonth(e.end) || 'Present'}
            </span>
            <div className="card">
              <div className="card-head">
                <strong>{e.role}</strong>
                <span className="chip" style={{ color: TYPE_COLORS[e.type] }}>
                  {e.type}
                </span>
              </div>
              <div className="muted">
                {e.organization}
                {e.location ? ` · ${e.location}` : ''}
              </div>
              {e.description && (
                <p>
                  <Markdown text={e.description} />
                </p>
              )}
              {e.highlights && (
                <ul>
                  {e.highlights.map((h, k) => (
                    <li key={k}>
                      <Markdown text={h} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

export function Projects() {
  return (
    <div className="projects">
      {projects.map((p) => (
        <article key={p.title} className="project">
          {p.image ? (
            <img src={`${import.meta.env.BASE_URL}${p.image}`} alt="" />
          ) : (
            <AppIcon icon={Code} colors={['#4aa8ff', '#1a73e8']} size={46} />
          )}
          <div>
            <h3>{p.title}</h3>
            <p className="muted">{p.description}</p>
            {p.tags && (
              <div className="tags">
                {p.tags.map((t) => (
                  <span className="chip" key={t}>
                    {t}
                  </span>
                ))}
              </div>
            )}
            <div className="buttons">
              {p.github && (
                <a className="btn" href={p.github} target="_blank" rel="noreferrer">
                  Source <ExternalLink size={11} />
                </a>
              )}
              {p.demo && (
                <a className="btn" href={p.demo} target="_blank" rel="noreferrer">
                  Demo <ExternalLink size={11} />
                </a>
              )}
              {p.link && (
                <a className="btn" href={p.link} target="_blank" rel="noreferrer">
                  Website <ExternalLink size={11} />
                </a>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}

export function News() {
  return (
    <div className="news">
      {news.map((n, i) => (
        <div key={i} className="notification">
          <div className="n-head">
            <span>{n.category ?? 'Update'}</span>
            <time>{formatDate(n.date)}</time>
          </div>
          <p>
            <Markdown text={n.content} />
          </p>
        </div>
      ))}
    </div>
  )
}

/** Finder showing the YAML files the whole site is built from. */
export function Finder() {
  const open = useWindows((s) => s.open)
  const [sel, setSel] = useState<string>()
  const files = Object.keys(content.raw).sort()
  return (
    <div className="finder">
      <aside className="sidebar glass-inset">
        <h4>Favourites</h4>
        <button className="active">
          <Folder size={14} /> content
        </button>
        <button onClick={() => open('papers')}>
          <Folder size={14} /> Papers
        </button>
        <h4>Locations</h4>
        <button onClick={() => open('about')}>
          <HardDrive size={14} /> Macintosh HD
        </button>
      </aside>
      <section className="finder-main">
        <header className="toolbar" data-drag>
          <h2>content</h2>
        </header>
        <div className="icon-grid" onClick={() => setSel(undefined)}>
          {files.map((f) => (
            <button
              key={f}
              className={`file ${sel === f ? 'selected' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setSel(f)
              }}
              onDoubleClick={() => open('textedit', f)}
            >
              <span className="doc-icon">
                <FileCode2 size={26} />
                <i>YAML</i>
              </span>
              <span className="name">{f}</span>
            </button>
          ))}
        </div>
        <footer className="statusbar">
          {sel ? (
            <button className="link" onClick={() => open('textedit', sel)}>
              Open {sel}
            </button>
          ) : (
            <span>{files.length} items · the portfolio is generated from these files</span>
          )}
        </footer>
      </section>
    </div>
  )
}

export function TextEdit({ file }: { file?: string }) {
  const text = (file && content.raw[file]) || ''
  return (
    <pre className="textedit selectable">
      {text.split('\n').map((line, i) => (
        <span key={i} className={/^\s*#/.test(line) ? 'c' : undefined}>
          {line.replace(/^(\s*-?\s*)([\w]+)(:)/, '$1\u0000$2\u0000$3')
            .split('\u0000')
            .map((part, k) => (k === 1 ? <b key={k}>{part}</b> : part))}
          {'\n'}
        </span>
      ))}
    </pre>
  )
}

export function About() {
  return (
    <div className="about">
      {/* your photo, with a little Mac badge in the corner */}
      <div className="about-photo">
        <Avatar size={110} />
        <span className="about-badge">
          <Monitor size={16} strokeWidth={1.8} />
        </span>
      </div>
      <h1>{profile.name}</h1>
      <p className="muted">{profile.role}</p>
      <dl>
        <dt>Owner</dt>
        <dd>{profile.name}</dd>
        <dt>Chip</dt>
        <dd>React + three.js</dd>
        <dt>Memory</dt>
        <dd>{content.publications.length} papers</dd>
        <dt>Serial</dt>
        <dd>{profile.badge?.id ?? '—'}</dd>
        <dt>macOS</dt>
        <dd>Tahoe 26</dd>
      </dl>
      <p className="muted tiny">
        <AppleLogo size={9} /> Eject the floppy to go back to the classic site.
      </p>
    </div>
  )
}
