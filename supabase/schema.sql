-- StudyMate — Supabase schema
-- Run in the Supabase SQL editor before adding the env vars.

create table if not exists public.studymate_logins (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  email text not null default '',
  logged_at timestamptz not null default now()
);

create table if not exists public.studymate_questions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  question text not null,
  answer text not null default '',
  mode text not null default 'extractive',
  sources jsonb not null default '[]'::jsonb,
  asked_at timestamptz not null default now()
);

create index if not exists studymate_logins_user_idx on public.studymate_logins (user_id, logged_at desc);
create index if not exists studymate_questions_user_idx on public.studymate_questions (user_id, asked_at desc);

alter table public.studymate_logins enable row level security;
alter table public.studymate_questions enable row level security;

create policy "own studymate logins read" on public.studymate_logins
  for select using (auth.uid() = user_id);

create policy "own studymate logins insert" on public.studymate_logins
  for insert with check (auth.uid() = user_id);

create policy "own studymate questions" on public.studymate_questions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
