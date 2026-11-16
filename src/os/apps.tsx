import type { ComponentType } from 'react'
import {
  Briefcase,
  Code,
  FileText,
  Folder,
  Mail,
  Newspaper,
  Settings as SettingsIcon,
  SquareTerminal,
  Mic,
  Presentation,
  type LucideIcon,
} from 'lucide-react'
import { content } from '../content'
import { Settings } from './apps/Settings'
import { Paper, Papers } from './apps/Papers'
import { About, Experience, Finder, News, Projects, TextEdit } from './apps/Misc'
import { Terminal } from './apps/Terminal'
import { useWindows, type AppId } from './windows'

export interface AppDef {
  name: string
  title: (arg?: string) => string
  Component: ComponentType<{ arg?: string }>
  /** windows whose content provides its own title bar area (sidebar apps) */
  chromeless?: boolean
  dark?: boolean
}

export const APPS: Record<AppId, AppDef> = {
  settings: { name: 'System Settings', title: () => 'System Settings', Component: Settings, chromeless: true },
  papers: { name: 'Papers', title: () => 'Papers', Component: Papers, chromeless: true },
  paper: {
    name: 'Preview',
    title: (key) => `${key ?? 'paper'}.pdf`,
    Component: ({ arg }) => <Paper id={arg} />,
  },
  experience: { name: 'Experience', title: () => 'Experience', Component: Experience },
  projects: { name: 'Projects', title: () => 'Projects', Component: Projects },
  news: { name: 'News', title: () => 'News', Component: News },
  terminal: { name: 'Terminal', title: () => `${content.profile.name.split(' ')[0]!.toLowerCase()} — zsh — 80×24`, Component: Terminal, dark: true },
  finder: { name: 'Finder', title: () => 'content', Component: Finder, chromeless: true },
  textedit: { name: 'TextEdit', title: (f) => f ?? 'Untitled', Component: ({ arg }) => <TextEdit file={arg} /> },
  about: { name: 'About This Mac', title: () => '', Component: About },
}

export interface DockItem {
  id: string
  label: string
  icon: LucideIcon
  colors: [string, string]
  app?: AppId
  action?: () => void
}

const openPane = (pane: string) => {
  const s = useWindows.getState()
  s.setSettingsPane(pane)
  s.open('settings')
}

export const DOCK: DockItem[] = [
  { id: 'finder', label: 'Finder', icon: Folder, colors: ['#6fc3ff', '#1f7cf0'], app: 'finder' },
  { id: 'settings', label: 'System Settings', icon: SettingsIcon, colors: ['#a7a7ad', '#5f5f66'], app: 'settings' },
  { id: 'papers', label: 'Papers', icon: FileText, colors: ['#ff7a6b', '#d9342b'], app: 'papers' },
  { id: 'experience', label: 'Experience', icon: Briefcase, colors: ['#d39a62', '#8e5626'], app: 'experience' },
  { id: 'projects', label: 'Projects', icon: Code, colors: ['#5ab4ff', '#1667d9'], app: 'projects' },
  { id: 'talks', label: 'Talks & Service', icon: Mic, colors: ['#ff9cc2', '#d93a77'], action: () => openPane('talks') },
  { id: 'teaching', label: 'Teaching', icon: Presentation, colors: ['#ffd36a', '#ef9400'], action: () => openPane('teaching') },
  { id: 'news', label: 'News', icon: Newspaper, colors: ['#ff6a64', '#c42d2a'], app: 'news' },
  { id: 'terminal', label: 'Terminal', icon: SquareTerminal, colors: ['#4a4a4f', '#121214'], app: 'terminal' },
]

export const DOCK_EXTRA: DockItem[] = content.profile.email
  ? [
      {
        id: 'mail',
        label: 'Mail',
        icon: Mail,
        colors: ['#6ac4ff', '#1a7cf5'],
        action: () => window.open(`mailto:${content.profile.email}`),
      },
    ]
  : []
