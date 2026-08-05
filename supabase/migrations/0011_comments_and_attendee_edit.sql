-- Phase 6 Modules D + E: attendee document edit + comments + edit audit log.
-- prd-v0.5.md §5.2 / §7.3 · dev-plan-v0.3.md Phase 6
--
-- 1) Session attendees may update documents tied to a session they attended
--    (product: author, attendees, admins).
-- 2) Comments on documents and sessions, with author edit/delete.
-- 3) comment_edit_log for admin-visible "who edited / when" history.
-- 4) get_user_public_profiles — stream-scoped display name + avatar from
--    auth.users (no profiles table yet; same SECURITY DEFINER pattern as 0007).

-- ---------------------------------------------------------------------------
-- Attendee edit on documents
-- ---------------------------------------------------------------------------
create policy "Session attendees can update linked documents"
  on public.documents for update
  using (
    session_id is not null
    and exists (
      select 1
      from public.session_attendees sa
      where sa.session_id = documents.session_id
        and sa.user_id = auth.uid()
    )
    and stream_id in (
      select sm.stream_id from public.stream_members sm where sm.user_id = auth.uid()
    )
  )
  with check (
    session_id is not null
    and exists (
      select 1
      from public.session_attendees sa
      where sa.session_id = documents.session_id
        and sa.user_id = auth.uid()
    )
    and stream_id in (
      select sm.stream_id from public.stream_members sm where sm.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.streams (id) on delete cascade,
  target_type text not null check (target_type in ('document', 'session')),
  target_id uuid not null,
  author_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz
);

create index comments_stream_target_idx
  on public.comments (stream_id, target_type, target_id, created_at asc);

create index comments_author_idx on public.comments (author_id);

create or replace function public.set_comments_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger comments_set_updated_at
  before update on public.comments
  for each row
  execute function public.set_comments_updated_at();

alter table public.comments enable row level security;

-- Stream members can read comments in their streams.
create policy "Members can read stream comments"
  on public.comments for select
  using (
    stream_id in (
      select sm.stream_id from public.stream_members sm where sm.user_id = auth.uid()
    )
  );

-- Stream members can insert their own comments.
create policy "Members can insert own comments"
  on public.comments for insert
  with check (
    author_id = auth.uid()
    and stream_id in (
      select sm.stream_id from public.stream_members sm where sm.user_id = auth.uid()
    )
  );

-- Authors can update their own comments.
create policy "Authors can update own comments"
  on public.comments for update
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- Authors can delete their own comments.
create policy "Authors can delete own comments"
  on public.comments for delete
  using (author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Comment edit audit log (admin-readable)
-- ---------------------------------------------------------------------------
create table public.comment_edit_log (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments (id) on delete cascade,
  stream_id uuid not null references public.streams (id) on delete cascade,
  editor_id uuid not null references auth.users (id) on delete cascade,
  previous_body text not null,
  edited_at timestamptz not null default now()
);

create index comment_edit_log_comment_idx
  on public.comment_edit_log (comment_id, edited_at desc);

create index comment_edit_log_stream_idx
  on public.comment_edit_log (stream_id, edited_at desc);

alter table public.comment_edit_log enable row level security;

-- Only stream admins can read the audit log.
create policy "Stream admins can read comment edit log"
  on public.comment_edit_log for select
  using (
    stream_id in (
      select sm.stream_id
      from public.stream_members sm
      where sm.user_id = auth.uid() and sm.role = 'admin'
    )
  );

-- Authors writing an edit log row for their own comment (via app insert).
-- Admins don't need insert; the app inserts when the author edits.
create policy "Authors can insert edit log for own comments"
  on public.comment_edit_log for insert
  with check (
    editor_id = auth.uid()
    and exists (
      select 1 from public.comments c
      where c.id = comment_id
        and c.author_id = auth.uid()
        and c.stream_id = stream_id
    )
  );

-- ---------------------------------------------------------------------------
-- Display profiles for comment avatars/names (shared-stream users only)
-- ---------------------------------------------------------------------------
create or replace function public.get_user_public_profiles(p_user_ids uuid[])
returns table (
  user_id uuid,
  email text,
  display_name text,
  avatar_url text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authorized.';
  end if;

  return query
    select
      au.id as user_id,
      au.email::text,
      coalesce(
        nullif(au.raw_user_meta_data->>'full_name', ''),
        nullif(au.raw_user_meta_data->>'name', ''),
        split_part(au.email::text, '@', 1)
      ) as display_name,
      coalesce(
        nullif(au.raw_user_meta_data->>'avatar_url', ''),
        nullif(au.raw_user_meta_data->>'picture', '')
      ) as avatar_url
    from auth.users au
    where au.id = any (p_user_ids)
      and exists (
        -- Caller and target share at least one stream.
        select 1
        from public.stream_members caller
        join public.stream_members target
          on target.stream_id = caller.stream_id
        where caller.user_id = auth.uid()
          and target.user_id = au.id
      );
end;
$$;

grant execute on function public.get_user_public_profiles(uuid[]) to authenticated;
