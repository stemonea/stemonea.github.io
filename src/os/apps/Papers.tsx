import { useMemo, useState } from 'react'
import { Check, Copy, ExternalLink, FileText, Search, Star, Tag } from 'lucide-react'
import { content, type Publication } from '../../content'
import { Authors } from '../components/ui'
import { useWindows } from '../windows'

const { publications } = content

/** Finder-like list of all publications, filterable by tag. */
export function Papers() {
  const open = useWindows((s) => s.open)
  const [filter, setFilter] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string>()
  const tags = useMemo(() => [...new Set(publications.map((p) => p.tag).filter(Boolean))] as string[], [])

  const list = publications.filter((p) => {
    if (filter === 'selected' && !p.selected) return false
    if (filter !== 'all' && filter !== 'selected' && p.tag !== filter) return false
    const q = query.trim().toLowerCase()
    return !q || `${p.title} ${p.authors} ${p.venue} ${p.year}`.toLowerCase().includes(q)
  })

  return (
    <div className="finder">
      <aside className="sidebar glass-inset">
        <h4>Library</h4>
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
          <FileText size={14} /> All papers <em>{publications.length}</em>
        </button>
        <button className={filter === 'selected' ? 'active' : ''} onClick={() => setFilter('selected')}>
          <Star size={14} /> Selected
        </button>
        <h4>Tags</h4>
        {tags.map((t) => (
          <button key={t} className={filter === t ? 'active' : ''} onClick={() => setFilter(t)}>
            <Tag size={14} /> {t}
          </button>
        ))}
      </aside>
      <section className="finder-main">
        <header className="toolbar" data-drag>
          <h2>{filter === 'all' ? 'All papers' : filter === 'selected' ? 'Selected' : filter}</h2>
          <label className="search">
            <Search size={12} />
            <input placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        </header>
        <div className="table">
          <div className="thead">
            <span>Title</span>
            <span>Venue</span>
            <span>Year</span>
          </div>
          {list.map((p) => (
            <div
              key={p.key}
              className={`tr ${selected === p.key ? 'selected' : ''}`}
              onClick={() => setSelected(p.key)}
              onDoubleClick={() => open('paper', p.key)}
            >
              <span className="title-cell">
                <FileText size={14} className="pdf" />
                {p.title}
              </span>
              <span className="muted ellipsis">{p.venue}</span>
              <span className="muted">{p.year}</span>
            </div>
          ))}
          {!list.length && <p className="empty">No papers match “{query}”.</p>}
        </div>
        <footer className="statusbar">
          {selected ? (
            <button className="link" onClick={() => open('paper', selected)}>
              Open “{publications.find((p) => p.key === selected)?.title.slice(0, 40)}…”
            </button>
          ) : (
            <span>{list.length} items · double-click to open</span>
          )}
        </footer>
      </section>
    </div>
  )
}

function bibtex(p: Publication) {
  if (p.bibtex) return p.bibtex.trim()
  const journal = /arxiv|proceedings|conference|findings|acl|emnlp|cikm|icml|neurips/i.test(p.venue) ? 'booktitle' : 'journal'
  return [
    `@${journal === 'booktitle' ? 'inproceedings' : 'article'}{${p.key},`,
    `  title   = {${p.title}},`,
    `  author  = {${p.authors}},`,
    `  ${journal.padEnd(7)} = {${p.venue}},`,
    `  year    = {${p.year}}${p.doi ? ',' : ''}`,
    p.doi ? `  doi     = {${p.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '')}}` : '',
    '}',
  ]
    .filter(Boolean)
    .join('\n')
}

/** Preview-like window for a single paper. */
export function Paper({ id }: { id?: string }) {
  const p = publications.find((x) => x.key === id)
  const [copied, setCopied] = useState(false)
  if (!p) return <p className="empty">Paper not found.</p>
  const links = [
    ['arXiv', p.arxiv],
    ['DOI', p.doi],
    ['PDF', p.pdf],
    ['Code', p.code],
  ].filter(([, href]) => href) as [string, string][]
  const bib = bibtex(p)

  return (
    <div className="preview">
      <article className="page">
        <div className="page-meta">
          {p.tag && <span className="chip">{p.tag}</span>}
          {p.selected && <span className="chip gold">★ Selected</span>}
        </div>
        <h1>{p.title}</h1>
        <p className="authors">
          <Authors authors={p.authors} />
        </p>
        <p className="venue-line">
          <em>{p.venue}</em>, {p.year}
        </p>
        {links.length > 0 && (
          <div className="buttons">
            {links.map(([label, href]) => (
              <a key={label} className="btn" href={href} target="_blank" rel="noreferrer">
                {label} <ExternalLink size={11} />
              </a>
            ))}
          </div>
        )}
        {p.abstract && (
          <>
            <h3>Abstract</h3>
            <p className="abstract selectable">{p.abstract}</p>
          </>
        )}
        <h3>
          BibTeX
          <button
            className="btn small"
            onClick={() => {
              navigator.clipboard?.writeText(bib)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            }}
          >
            {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? 'Copied' : 'Copy'}
          </button>
        </h3>
        <pre className="bibtex selectable">{bib}</pre>
      </article>
    </div>
  )
}
