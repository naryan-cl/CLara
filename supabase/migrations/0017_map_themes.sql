-- Phase 7: map wallpaper themes + unlocks
-- Dashboard Plant/Ocean/Desert wallpaper + themed sprites.
-- Unlock unit = authored Public non-draft Commons documents in the stream.

-- Stream defaults + contribution thresholds (admin-overridable)
alter table public.streams
  add column if not exists default_map_theme text not null default 'plant'
    check (default_map_theme in ('plant', 'ocean', 'desert')),
  add column if not exists ocean_unlock_at integer not null default 5
    check (ocean_unlock_at >= 0),
  add column if not exists desert_unlock_at integer not null default 10
    check (desert_unlock_at >= 0);

comment on column public.streams.default_map_theme is
  'Default dashboard map theme for members who have not picked one (or whose pick is locked).';
comment on column public.streams.ocean_unlock_at is
  'Public non-draft authored docs required to unlock Ocean (product default 5).';
comment on column public.streams.desert_unlock_at is
  'Public non-draft authored docs required to unlock Desert (product default 10).';

-- Per-member theme preference + one-shot unlock popup state
alter table public.stream_members
  add column if not exists selected_map_theme text not null default 'plant'
    check (selected_map_theme in ('plant', 'ocean', 'desert')),
  add column if not exists ocean_unlock_seen_at timestamptz,
  add column if not exists desert_unlock_seen_at timestamptz;

comment on column public.stream_members.selected_map_theme is
  'Member''s chosen dashboard map theme (must be unlocked; app clamps if not).';
comment on column public.stream_members.ocean_unlock_seen_at is
  'When the Ocean unlock congratulations popup was acknowledged (null = not yet).';
comment on column public.stream_members.desert_unlock_seen_at is
  'When the Desert unlock congratulations popup was acknowledged (null = not yet).';

-- Draft flag so Reflect autosaves do not count toward unlocks
alter table public.documents
  add column if not exists is_draft boolean not null default false;

comment on column public.documents.is_draft is
  'True for in-progress Reflect autosaves. False after Submit (and for Upload/Record/etc). Drafts never count toward theme unlocks.';

create index if not exists documents_theme_contrib_idx
  on public.documents (stream_id, created_by)
  where privacy_status = 'public' and is_draft = false;

-- Members cannot UPDATE stream_members under admin-only RLS (0007).
-- Scoped RPCs let a member change only their own theme preference columns.

create or replace function public.set_my_map_theme(
  p_stream_id uuid,
  p_theme text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_theme not in ('plant', 'ocean', 'desert') then
    raise exception 'Invalid map theme';
  end if;

  if not exists (
    select 1 from public.stream_members sm
    where sm.stream_id = p_stream_id and sm.user_id = auth.uid()
  ) then
    raise exception 'Not a member of this stream';
  end if;

  update public.stream_members
  set selected_map_theme = p_theme
  where stream_id = p_stream_id
    and user_id = auth.uid();
end;
$$;

create or replace function public.ack_map_theme_unlock(
  p_stream_id uuid,
  p_theme text,
  p_apply boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_theme not in ('ocean', 'desert') then
    raise exception 'Invalid unlock theme';
  end if;

  if not exists (
    select 1 from public.stream_members sm
    where sm.stream_id = p_stream_id and sm.user_id = auth.uid()
  ) then
    raise exception 'Not a member of this stream';
  end if;

  if p_theme = 'ocean' then
    update public.stream_members
    set
      ocean_unlock_seen_at = coalesce(ocean_unlock_seen_at, now()),
      selected_map_theme = case
        when p_apply then 'ocean'
        else selected_map_theme
      end
    where stream_id = p_stream_id
      and user_id = auth.uid();
  else
    update public.stream_members
    set
      desert_unlock_seen_at = coalesce(desert_unlock_seen_at, now()),
      selected_map_theme = case
        when p_apply then 'desert'
        else selected_map_theme
      end
    where stream_id = p_stream_id
      and user_id = auth.uid();
  end if;
end;
$$;

grant execute on function public.set_my_map_theme(uuid, text) to authenticated;
grant execute on function public.ack_map_theme_unlock(uuid, text, boolean) to authenticated;
