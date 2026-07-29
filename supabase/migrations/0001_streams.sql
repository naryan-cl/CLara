-- CLara platform: streams & stream_members
-- dev-plan-v0.2.md §1.1 — multi-stream plumbing, Camp CLAI as first stream.

create extension if not exists "pgcrypto";

create table streams (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  isolation_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table stream_members (
  stream_id uuid not null references streams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (stream_id, user_id)
);

alter table streams enable row level security;
alter table stream_members enable row level security;

-- Members can see the streams they belong to (isolation enforced by membership,
-- not by a separate flag check — you simply can't see a stream you're not in).
create policy "Members can view their streams"
  on streams for select
  using (
    id in (select stream_id from stream_members where user_id = auth.uid())
  );

-- Users can see their own membership rows (needed to resolve "which streams am I in").
create policy "Users can view their own membership rows"
  on stream_members for select
  using (user_id = auth.uid());

-- Seed Camp CLAI as the first stream, isolation on per product decision.
insert into streams (slug, name, isolation_enabled)
values ('camp-clai', 'Camp CLAI', true);

-- Make the account that ran this migration the first admin of Camp CLAI.
-- Replace the email below if you want a different account to be the seed admin.
insert into stream_members (stream_id, user_id, role)
select streams.id, auth.users.id, 'admin'
from streams, auth.users
where streams.slug = 'camp-clai'
  and auth.users.email = 'aaniederkorn@gmail.com';
