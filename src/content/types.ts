export interface Link {
  label: string
  href: string
  rel?: string
}

export interface ResearchArea {
  title: string
  description: string
  icon?: string
}

export interface Profile {
  name: string
  title?: string
  role: string
  affiliation: string
  location?: string
  flag?: string
  email?: string
  orcid?: string
  cv?: string
  photo?: string
  /** Where the face is in the photo (0..1 from left / top): crops and avatars centre on it. */
  photoFocus?: { x: number; y: number }
  /** Short monogram shown on the computers' wallpapers (defaults to your initials). */
  logo?: string
  scholar?: string
  authorAliases?: string[]
  badge?: {
    id?: string
    validUntil?: string
    program?: string
    /** Short institution name printed on the badge and the lanyard (defaults to the last part of `affiliation`). */
    institution?: string
  }
  bio: string[]
  research: ResearchArea[]
  links: Link[]
}

export type ExperienceType = 'Education' | 'Research' | 'Industry' | 'Visiting' | (string & {})

export interface ExperienceItem {
  type: ExperienceType
  role: string
  organization: string
  location?: string
  start: string
  end?: string
  description?: string
  highlights?: string[]
}

export interface Publication {
  key: string
  tag?: string
  title: string
  authors: string
  venue: string
  year: number | string
  selected?: boolean
  /** Where the conference took place, e.g. "San Diego, USA" (printed on the pin, with a landmark). */
  location?: string
  /** Landmark drawn on the pin: palm, pagoda, mountains, bridge, tower, dome, skyline, arch, wave (guessed from `location` if omitted). */
  landmark?: string
  /** Optional image of the venue's logo (path in public/ or URL), drawn on the pin instead of the acronym. */
  logo?: string
  abstract?: string
  arxiv?: string
  doi?: string
  pdf?: string
  code?: string
  bibtex?: string
}

export interface Project {
  title: string
  description: string
  image?: string
  github?: string
  demo?: string
  link?: string
  tags?: string[]
}

export interface Talk {
  type: string
  title: string
  venue?: string
  location?: string
  year: number | string
  link?: string
}

export interface TeachingItem {
  academicYear: string
  category: string
  title: string
  degree?: string
  department?: string
  institution?: string
  level?: string
  link?: string
}

export interface NewsItem {
  date: string
  category?: string
  content: string
}

export interface Content {
  profile: Profile
  experience: ExperienceItem[]
  publications: Publication[]
  projects: Project[]
  talks: Talk[]
  teaching: TeachingItem[]
  news: NewsItem[]
  /** Raw YAML sources keyed by file name (e.g. "profile.yaml"), used by the Terminal app. */
  raw: Record<string, string>
}
