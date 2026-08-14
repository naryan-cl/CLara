-- For now, every CLara account is a Camp CLAI member as soon as it exists.
-- Why: signup currently creates auth.users but no stream_members row, so new
-- colleagues land on "No stream / join an active stream". Camp CLAI is the
-- only populated stream; auto-join as `member` (never admin). Existing
-- admins are left untouched via ON CONFLICT. Revisit when other streams
-- are populated or invite-only membership is required.
--
-- Apply in the Supabase SQL editor. Safe to re-run.

create or replace function public.add_user_to_camp_clai(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.stream_members (stream_id, user_id, role)
  select s.id, p_user_id, 'member'
  from public.streams s
  where s.slug = 'camp-clai'
  on conflict (stream_id, user_id) do nothing;
end;
$$;

revoke all on function public.add_user_to_camp_clai(uuid) from public;
revoke all on function public.add_user_to_camp_clai(uuid) from anon, authenticated;

-- Trigger: attach membership in the same transaction as account creation.
-- Never raise — a missing Camp CLAI row must not block signup.
create or replace function public.handle_new_user_camp_clai()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.add_user_to_camp_clai(new.id);
  return new;
exception
  when others then
    raise warning 'handle_new_user_camp_clai: %', sqlerrm;
    return new;
end;
$$;

revoke all on function public.handle_new_user_camp_clai() from public;
revoke all on function public.handle_new_user_camp_clai() from anon, authenticated;

drop trigger if exists on_auth_user_created_camp_clai on auth.users;
create trigger on_auth_user_created_camp_clai
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user_camp_clai();

-- Signed-in self-heal: first page load can attach membership if the trigger
-- was missed (accounts created before this migration, restores, etc.).
create or replace function public.ensure_my_camp_clai_membership()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;

  perform public.add_user_to_camp_clai(auth.uid());
end;
$$;

grant execute on function public.ensure_my_camp_clai_membership() to authenticated;

-- Pending / existing accounts: add anyone not already in Camp CLAI.
insert into public.stream_members (stream_id, user_id, role)
select s.id, u.id, 'member'
from auth.users u
cross join public.streams s
where s.slug = 'camp-clai'
on conflict (stream_id, user_id) do nothing;
