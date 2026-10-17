create table if not exists public.guardian_agents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);
alter table public.guardian_agents enable row level security;
revoke all on public.guardian_agents from anon;
grant select, insert, delete on public.guardian_agents to authenticated;
drop policy if exists "own_agents_read" on public.guardian_agents;
create policy "own_agents_read" on public.guardian_agents for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "own_agents_insert" on public.guardian_agents;
create policy "own_agents_insert" on public.guardian_agents for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "own_agents_delete" on public.guardian_agents;
create policy "own_agents_delete" on public.guardian_agents for delete to authenticated using ((select auth.uid()) = user_id);
