import { Fragment, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { APPLE_PATH } from '../../scene/textures'
import { content, initials } from '../../content'

export function AppleLogo({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={(size * 112) / 100} viewBox="0 0 100 112" aria-hidden>
      <path d={APPLE_PATH} fill={color} fillRule="evenodd" />
    </svg>
  )
}

/** macOS-style squircle icon: gradient background + glyph. */
export function AppIcon({
  icon: Icon,
  colors,
  size = 44,
  glyph = 0.55,
  radius = 0.23,
  glyphColor = '#fff',
}: {
  icon: LucideIcon
  colors: [string, string]
  size?: number
  glyph?: number
  radius?: number
  glyphColor?: string
}) {
  return (
    <span
      className="app-icon"
      style={{
        width: size,
        height: size,
        borderRadius: size * radius,
        background: `linear-gradient(180deg, ${colors[0]}, ${colors[1]})`,
      }}
    >
      <Icon size={size * glyph} color={glyphColor} strokeWidth={2} />
    </span>
  )
}

export function Avatar({ size = 64 }: { size?: number }) {
  const { photo, name } = content.profile
  if (photo) {
    const src = photo.startsWith('http') ? photo : `${import.meta.env.BASE_URL}${photo}`
    const f = content.profile.photoFocus
    return (
      <img
        className="avatar"
        src={src}
        alt={name}
        // centre the round crop on the face
        style={{ width: size, height: size, objectPosition: f ? `${f.x * 100}% ${f.y * 100}%` : undefined }}
      />
    )
  }
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {initials(name)}
    </span>
  )
}

/**
 * Tiny, safe inline-markdown renderer for YAML strings:
 * [text](url), **bold**, *italic*, `code`. No raw HTML is ever injected.
 */
export function Markdown({ text }: { text: string }) {
  const out: ReactNode[] = []
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1] !== undefined) {
      const safe = /^(https?:|mailto:|\/)/.test(m[2]!) ? m[2] : '#'
      out.push(
        <a key={i++} href={safe} target="_blank" rel="noreferrer">
          {m[1]}
        </a>,
      )
    } else if (m[3] !== undefined) out.push(<strong key={i++}>{m[3]}</strong>)
    else if (m[4] !== undefined) out.push(<em key={i++}>{m[4]}</em>)
    else if (m[5] !== undefined) out.push(<code key={i++}>{m[5]}</code>)
    last = re.lastIndex
  }
  if (last < text.length) out.push(text.slice(last))
  return <>{out.map((n, k) => (typeof n === 'string' ? <Fragment key={`t${k}`}>{n}</Fragment> : n))}</>
}

/** "Rivera, Alex and Chen, Wei" -> ["Alex Rivera", "Wei Chen"], with the owner highlighted. */
export function Authors({ authors }: { authors: string }) {
  const aliases = new Set([content.profile.name, ...(content.profile.authorAliases ?? [])].map((s) => s.toLowerCase()))
  const list = authors.split(/\s+and\s+/)
  return (
    <>
      {list.map((raw, i) => {
        const pretty = raw.includes(',') ? raw.split(',').map((s) => s.trim()).reverse().join(' ') : raw.trim()
        const me = aliases.has(raw.trim().toLowerCase()) || aliases.has(pretty.toLowerCase())
        return (
          <Fragment key={i}>
            {me ? <strong className="me">{pretty}</strong> : pretty}
            {i < list.length - 2 ? ', ' : i === list.length - 2 ? ' and ' : ''}
          </Fragment>
        )
      })}
    </>
  )
}

/** macOS grouped "inset list" used by System Settings. */
export function Group({ title, children, footer }: { title?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section className="group">
      {title && <h3 className="group-title">{title}</h3>}
      <div className="group-box">{children}</div>
      {footer && <p className="group-footer">{footer}</p>}
    </section>
  )
}

export function Row({
  label,
  value,
  icon,
  onClick,
  href,
  chevron,
  children,
}: {
  label?: ReactNode
  value?: ReactNode
  icon?: ReactNode
  onClick?: () => void
  href?: string
  chevron?: boolean
  children?: ReactNode
}) {
  const inner = (
    <>
      {icon && <span className="row-icon">{icon}</span>}
      <span className="row-main">
        {label && <span className="row-label">{label}</span>}
        {children}
      </span>
      {value !== undefined && <span className="row-value">{value}</span>}
      {(chevron || href) && <span className="row-chevron">›</span>}
    </>
  )
  if (href)
    return (
      <a className="row clickable" href={href} target="_blank" rel="noreferrer">
        {inner}
      </a>
    )
  return (
    <div className={`row${onClick ? ' clickable' : ''}`} onClick={onClick}>
      {inner}
    </div>
  )
}

/** Your monogram (profile.logo, e.g. "SFM"), as crisp vector text for wallpapers. */
export function Monogram({ className = '' }: { className?: string }) {
  const text = content.profile.logo ?? initials(content.profile.name)
  return (
    <svg className={`monogram ${className}`} viewBox="0 0 300 120" aria-label={text} role="img">
      <defs>
        <linearGradient id="mono-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <text x="150" y="88" textAnchor="middle" fontFamily="Inter, -apple-system, sans-serif" fontWeight="800" fontSize="96" letterSpacing="-4" fill="url(#mono-fill)">
        {text}
      </text>
    </svg>
  )
}
