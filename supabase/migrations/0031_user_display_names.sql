-- Richer display names for Created by / comments / peers.
-- Why: Google and some email signups store the name in display_name or
-- given_name + family_name, not only full_name / name. Empty metadata still
-- falls back to the email local-part (never a blank label).
-- Safe to re-run.

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
        nullif(au.raw_user_meta_data->>'display_name', ''),
        nullif(trim(concat_ws(' ',
          au.raw_user_meta_data->>'given_name',
          au.raw_user_meta_data->>'family_name'
        )), ''),
        nullif(split_part(au.email::text, '@', 1), '')
      ) as display_name,
      coalesce(
        nullif(au.raw_user_meta_data->>'avatar_url', ''),
        nullif(au.raw_user_meta_data->>'picture', '')
      ) as avatar_url
    from auth.users au
    where au.id = any (p_user_ids)
      and exists (
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

create or replace function public.list_stream_peers(p_stream_id uuid)
returns table (
  user_id uuid,
  email text,
  display_name text,
  role text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.stream_members sm
    where sm.stream_id = p_stream_id and sm.user_id = auth.uid()
  ) then
    raise exception 'Not authorized: you are not a member of this stream.';
  end if;

  return query
    select
      sm.user_id,
      au.email::text,
      coalesce(
        nullif(au.raw_user_meta_data->>'full_name', ''),
        nullif(au.raw_user_meta_data->>'name', ''),
        nullif(au.raw_user_meta_data->>'display_name', ''),
        nullif(trim(concat_ws(' ',
          au.raw_user_meta_data->>'given_name',
          au.raw_user_meta_data->>'family_name'
        )), ''),
        nullif(split_part(au.email::text, '@', 1), '')
      ) as display_name,
      sm.role::text
    from public.stream_members sm
    join auth.users au on au.id = sm.user_id
    where sm.stream_id = p_stream_id
    order by display_name asc;
end;
$$;

grant execute on function public.list_stream_peers(uuid) to authenticated;
