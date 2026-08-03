-- Ask CLara (Phase 3, Module A): chunked embeddings over Commons documents
-- prd-v0.5.md §5.3 · dev-plan-v0.3.md "Next up" #1
--
-- Locked down deliberately: RLS is enabled with NO policies, so no
-- browser-facing (anon/authenticated) client can read or write this table at
-- all. Writes happen only via the admin (service-role) client from the
-- `clara-embed-document` Inngest job, which bypasses RLS entirely. Reads will
-- happen only via a SECURITY DEFINER function added in a later migration
-- (Ask CLara Module B) that re-checks stream membership + document privacy
-- once, in one audited place — same pattern as 0007's get_stream_members.

create extension if not exists vector;

create table public.document_embeddings (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  stream_id uuid not null references public.streams (id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(1536) not null,
  created_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index document_embeddings_stream_id_idx on public.document_embeddings (stream_id);
create index document_embeddings_document_id_idx on public.document_embeddings (document_id);

-- Cosine similarity search index (HNSW: no training step needed, good default
-- at this data scale).
create index document_embeddings_embedding_idx
  on public.document_embeddings
  using hnsw (embedding vector_cosine_ops);

alter table public.document_embeddings enable row level security;
-- Intentionally no policies — see header comment.
