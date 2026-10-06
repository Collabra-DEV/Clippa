-- Run once in your Supabase project's SQL Editor.
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  clip_length text not null check (clip_length in ('15–30 seconds','30–60 seconds','60–90 seconds')),
  caption_style text not null check (caption_style in ('Bold','Clean','Word by word')),
  created_at timestamptz not null default now()
);
alter table public.projects enable row level security;
grant select, insert, delete on public.projects to authenticated;
revoke all on public.projects from anon;
create policy "Read own projects" on public.projects for select to authenticated using ((select auth.uid()) = user_id);
create policy "Save own projects" on public.projects for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Delete own projects" on public.projects for delete to authenticated using ((select auth.uid()) = user_id);
