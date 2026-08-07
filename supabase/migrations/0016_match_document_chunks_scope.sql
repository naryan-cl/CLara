-- Ask CLara: optional document / session scope for match_document_chunks
-- Dashboard map overlay "Ask about this element" needs retrieval limited to
-- one document or all documents in one session (still privacy-checked).
--
-- Postgres treats a new parameter list as a new overload, so drop the 0009
-- signature first, then create the scoped version.

drop function if exists public.match_document_chunks(uuid, vector, int);

create or replace function public.match_document_chunks(
  p_stream_id uuid,
  p_query_embedding vector(1536),
  p_match_count int default 6,
  p_document_id uuid default null,
  p_session_id uuid default null
)
returns table (
  chunk_id uuid,
  document_id uuid,
  document_title text,
  document_type text,
  session_id uuid,
  session_name text,
  content text,
  similarity float
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
      de.id as chunk_id,
      de.document_id,
      d.title as document_title,
      d.type as document_type,
      d.session_id,
      s.name as session_name,
      de.content,
      1 - (de.embedding <=> p_query_embedding) as similarity
    from public.document_embeddings de
    join public.documents d on d.id = de.document_id
    left join public.sessions s on s.id = d.session_id
    where de.stream_id = p_stream_id
      and (d.privacy_status = 'public' or d.created_by = auth.uid())
      and (p_document_id is null or de.document_id = p_document_id)
      and (p_session_id is null or d.session_id = p_session_id)
    order by de.embedding <=> p_query_embedding
    limit p_match_count;
end;
$$;

grant execute on function public.match_document_chunks(uuid, vector, int, uuid, uuid) to authenticated;
