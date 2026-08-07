-- Quiet unlock popups for members who already met Ocean/Desert thresholds
-- before Phase 7 themes shipped. New unlocks after this still show the
-- congratulations dialog (seen_at stays null until they cross the line).

update public.stream_members sm
set ocean_unlock_seen_at = coalesce(sm.ocean_unlock_seen_at, now())
from public.streams s
where sm.stream_id = s.id
  and sm.ocean_unlock_seen_at is null
  and (
    select count(*)::integer
    from public.documents d
    where d.stream_id = sm.stream_id
      and d.created_by = sm.user_id
      and d.privacy_status = 'public'
      and d.is_draft = false
  ) >= s.ocean_unlock_at;

update public.stream_members sm
set desert_unlock_seen_at = coalesce(sm.desert_unlock_seen_at, now())
from public.streams s
where sm.stream_id = s.id
  and sm.desert_unlock_seen_at is null
  and (
    select count(*)::integer
    from public.documents d
    where d.stream_id = sm.stream_id
      and d.created_by = sm.user_id
      and d.privacy_status = 'public'
      and d.is_draft = false
  ) >= s.desert_unlock_at;
