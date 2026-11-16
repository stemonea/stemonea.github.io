import { data, raw } from 'virtual:content'
import type {
  Content,
  ExperienceItem,
  NewsItem,
  Profile,
  Project,
  Publication,
  Talk,
  TeachingItem,
} from './types'

/**
 * All the portfolio data lives in /content/*.yaml (one file per section, same layout as
 * luciolcv.github.io). The files are parsed at build time by the `portfolio-content` Vite
 * plugin (see vite.config.ts) and hot-reloaded in dev: editing a YAML file is all it takes.
 */
function load<T>(name: string, fallback: T): T {
  return (data[name] as T | undefined | null) ?? fallback
}

const profile = load<Profile>('profile', {
  name: 'Your Name',
  role: 'PhD Student',
  affiliation: '',
  bio: [],
  research: [],
  links: [],
})
profile.bio ??= []
profile.research ??= []
profile.links ??= []

const byDateDesc = (a: NewsItem, b: NewsItem) => String(b.date).localeCompare(String(a.date))
const byYearDesc = (a: { year: number | string }, b: { year: number | string }) =>
  String(b.year).localeCompare(String(a.year))

export const content: Content = {
  profile,
  experience: load<ExperienceItem[]>('experience', []),
  publications: load<Publication[]>('publications', []).sort(byYearDesc),
  projects: load<Project[]>('projects', []),
  talks: load<Talk[]>('talks', []),
  teaching: load<TeachingItem[]>('teaching', []),
  news: load<NewsItem[]>('news', []).sort(byDateDesc),
  raw,
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('')

/** "2024-11" -> "Nov 2024", "present" -> "Present" */
export function formatMonth(value?: string) {
  if (!value) return ''
  if (/present|now|oggi/i.test(value)) return 'Present'
  const m = /^(\d{4})-(\d{1,2})/.exec(String(value))
  if (!m) return String(value)
  const d = new Date(Number(m[1]), Number(m[2]) - 1, 1)
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

export function formatDate(value: string) {
  const d = new Date(String(value))
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

export type { Content } from './types'
export * from './types'
