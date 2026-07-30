-- Phase 5 module 3: "I Attended" harvest.
-- prd-v0.5.md §7.2 ("I Attended" harvest) · dev-plan-v0.3.md §5 Phase 5
--
-- Members self-report which sessions they attended; the harvest page then
-- surfaces every Commons document tied to those sessions for them.

create table public.session_attendees (
  session_id uuid not null references public.sessions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create index session_attendees_user_id_idx on public.session_attendees (user_id);

alter table public.session_attendees enable row level security;

-- Members can see their own attendance rows (needed to render "attended?").
create policy "Users can read their own attendance"
  on public.session_attendees for select
  using (user_id = auth.uid());

-- Members can mark themselves attended, only for sessions in a stream
-- they belong to.
create policy "Members can mark themselves attended"
  on public.session_attendees for insert
  with check (
    user_id = auth.uid()
    and session_id in (
      select s.id
      from public.sessions s
      join public.stream_members sm on sm.stream_id = s.stream_id
      where sm.user_id = auth.uid()
    )
  );

-- Members can unmark their own attendance.
create policy "Users can delete their own attendance"
  on public.session_attendees for delete
  using (user_id = auth.uid());
