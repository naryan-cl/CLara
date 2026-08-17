-- Flag Commons documents that came from outside CL (e.g. a public article
-- or another program). Used by the dashboard list "Hide external" pill.
-- Existing rows stay false (internal / CL origin).

alter table public.documents
  add column if not exists is_external boolean not null default false;

comment on column public.documents.is_external is
  'True when the author flagged this upload as from outside CL / Camp CLAI.';
