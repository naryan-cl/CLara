-- Add naryan@cultivatingleadership.com as Camp CLAI admin.
-- Safe to re-run: ON CONFLICT updates role to admin.

insert into stream_members (stream_id, user_id, role)
select streams.id, auth.users.id, 'admin'
from streams
join auth.users on auth.users.email = 'naryan@cultivatingleadership.com'
where streams.slug = 'camp-clai'
on conflict (stream_id, user_id)
do update set role = excluded.role;
