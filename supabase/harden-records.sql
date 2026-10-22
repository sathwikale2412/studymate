-- StudyMate — make saved questions permanent
-- Paste into Supabase -> SQL Editor for the shared project and run. Safe to re-run.
--
-- "own studymate questions" is a `for all` policy, so a user can rewrite or delete their own
-- question history. src/lib/cloud.js only inserts (saveQuestion) and selects (fetchQuestions).
-- asked_at and logged_at are both left out by the client, so the database can set them.

drop policy if exists "own studymate questions" on public.studymate_questions;
drop policy if exists "own studymate questions read" on public.studymate_questions;
drop policy if exists "own studymate questions insert" on public.studymate_questions;

create policy "own studymate questions read" on public.studymate_questions
  for select using (auth.uid() = user_id);

create policy "own studymate questions insert" on public.studymate_questions
  for insert with check (auth.uid() = user_id);

create or replace function public.studymate_force_login_time()
returns trigger
language plpgsql
as $$
begin
  new.logged_at := now();
  return new;
end;
$$;

create or replace function public.studymate_force_ask_time()
returns trigger
language plpgsql
as $$
begin
  new.asked_at := now();
  return new;
end;
$$;

drop trigger if exists studymate_logins_force_time on public.studymate_logins;
create trigger studymate_logins_force_time
  before insert on public.studymate_logins
  for each row execute function public.studymate_force_login_time();

drop trigger if exists studymate_questions_force_time on public.studymate_questions;
create trigger studymate_questions_force_time
  before insert on public.studymate_questions
  for each row execute function public.studymate_force_ask_time();
