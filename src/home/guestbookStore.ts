/**
 * The guestbook's notes: stored in Supabase (table `guestbook_notes`, see supabase/guestbook.sql)
 * through its REST API, so no client library ships to the browser. Without VITE_SUPABASE_URL and
 * VITE_SUPABASE_ANON_KEY the notes live only in this browser (localStorage), which is handy in
 * development.
 */

export interface Note {
  id: string
  body: string
  name: string | null
  created_at: string
}

export const LIMITS = { body: 500, name: 40 }

const URL_ = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const TABLE = 'guestbook_notes'
const LOCAL = 'guestbook-notes'

/** true when notes are shared with every visitor (Supabase configured) */
export const isShared = !!(URL_ && KEY)

const headers = () => ({
  apikey: KEY!,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
})

function readLocal(): Note[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL) ?? '[]') as Note[]
  } catch {
    return []
  }
}

export async function listNotes(): Promise<Note[]> {
  if (!isShared) return readLocal()
  const r = await fetch(`${URL_}/rest/v1/${TABLE}?select=id,body,name,created_at&order=created_at.desc&limit=200`, { headers: headers() })
  if (!r.ok) throw new Error(`Could not load the notes (${r.status})`)
  return (await r.json()) as Note[]
}

export async function addNote(body: string, name: string): Promise<Note> {
  const clean = { body: body.trim().slice(0, LIMITS.body), name: name.trim().slice(0, LIMITS.name) || null }
  if (!clean.body) throw new Error('The note is empty')
  if (!isShared) {
    const note: Note = { id: String(Date.now()), ...clean, created_at: new Date().toISOString() }
    try {
      localStorage.setItem(LOCAL, JSON.stringify([note, ...readLocal()].slice(0, 200)))
    } catch {
      // private mode / storage full: the note still shows until the page is reloaded
    }
    return note
  }
  const r = await fetch(`${URL_}/rest/v1/${TABLE}?select=id,body,name,created_at`, {
    method: 'POST',
    headers: { ...headers(), Prefer: 'return=representation' },
    body: JSON.stringify(clean),
  })
  if (!r.ok) throw new Error(`Could not save the note (${r.status})`)
  const [note] = (await r.json()) as Note[]
  return note!
}
