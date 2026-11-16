-- Guestbook for the home page (the Notes app on the iPhone).
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
--
-- Visitors (the public "anon" key) can only READ visible notes and ADD new ones with a body and
-- an optional name. They cannot edit, delete, or choose the id / date / visibility.
-- To hide a note: Table Editor → guestbook_notes → set `hidden` to true (or delete the row).

create table if not exists public.guestbook_notes (
  id          uuid primary key default gen_random_uuid(),
  body        text not null check (char_length(btrim(body)) between 1 and 500),
  name        text check (name is null or char_length(name) <= 40),
  created_at  timestamptz not null default now(),
  hidden      boolean not null default false
);

create index if not exists guestbook_notes_created_at on public.guestbook_notes (created_at desc);

alter table public.guestbook_notes enable row level security;

drop policy if exists "read visible notes" on public.guestbook_notes;
create policy "read visible notes" on public.guestbook_notes
  for select to anon using (not hidden);

drop policy if exists "add a note" on public.guestbook_notes;
create policy "add a note" on public.guestbook_notes
  for insert to anon with check (not hidden);

-- only these columns may be written by visitors
revoke all on public.guestbook_notes from anon;
grant select (id, body, name, created_at) on public.guestbook_notes to anon;
grant insert (body, name) on public.guestbook_notes to anon;
