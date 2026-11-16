import { useState } from 'react'
import { content, formatMonth } from '../content'

/** Slide 4: education and experience as a timeline; one entry open at a time. */

const { experience, profile } = content

const TYPE_COLORS: Record<string, string> = {
  Education: '#2f6fe4',
  Industry: '#f08c1a',
  Visiting: '#2fb67c',
  Research: '#7c5cff',
  Teaching: '#e0a100',
}
const colorOf = (type: string) => TYPE_COLORS[type] ?? '#8a8a86'

const year = (v?: string) => (v ? formatMonth(v).replace(/^\w+ /, '') : '')
const isNow = (v?: string) => !v || /present|now|oggi/i.test(v)

export function Experience() {
  const [open, setOpen] = useState(0)
  const types = [...new Set(experience.map((e) => e.type))]
  return (
    <div className="s-exp">
      <header className="exp-head">
        <p className="s-kicker">Experience</p>
        <h2 className="s-title">Where I&rsquo;ve been.</h2>
        <p className="s-sub">Studies, labs and the places in between. Open an entry for the details.</p>
        <ul className="exp-legend">
          {types.map((t) => (
            <li key={t}>
              <i style={{ background: colorOf(t) }} />
              {t}
            </li>
          ))}
        </ul>
        <div className="exp-foot">
          {profile.cv && (
            <a href={profile.cv} target="_blank" rel="noreferrer">
              Curriculum vitae ↗
            </a>
          )}
          <span>
            © {new Date().getFullYear()} {profile.name}
          </span>
        </div>
      </header>

      <ol className="exp-list">
        <span className="exp-rail" aria-hidden />
        {experience.map((e, i) => {
          const on = open === i
          return (
            <li key={i} className={`exp-item ${on ? 'open' : ''} ${isNow(e.end) ? 'now' : ''}`} style={{ '--c': colorOf(e.type) } as React.CSSProperties}>
              <button className="exp-row" aria-expanded={on} onClick={() => setOpen(on ? -1 : i)}>
                <span className="exp-when">
                  {year(e.start)}
                  {' – '}
                  {isNow(e.end) ? 'now' : year(e.end)}
                </span>
                <span className="exp-dot" />
                <span className="exp-what">
                  <b>{e.role}</b>
                  <span>
                    {e.organization}
                    {e.location && <> · {e.location}</>}
                  </span>
                </span>
                <span className="exp-type">{e.type}</span>
              </button>
              {on && (e.description || e.highlights?.length) && (
                <div className="exp-more">
                  {e.description && <p>{e.description}</p>}
                  {e.highlights && e.highlights.length > 0 && (
                    <ul>
                      {e.highlights.map((h) => (
                        <li key={h}>{h}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
