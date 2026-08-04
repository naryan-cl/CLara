-- Ask CLara (Phase 3, Module B): stream-scoped, privacy-aware chunk retrieval
-- prd-v0.5.md §5.3 · dev-plan-v0.3.md "Next up"
--
-- document_embeddings (0008) has RLS on with no policies, so no
-- request-scoped client can query it directly. This SECURITY DEFINER
-- function is the one audited place that's allowed to — same pattern as
-- 0007's get_stream_members: it manually re-checks the caller is a member
-- of the target stream before doing anything, then runs with elevated
-- rights just for this one similarity + privacy-filtered query.

create or replace function public.match_document_chunks(
  p_stream_id uuid,
  p_query_embedding vector(1536),
  p_match_count int default 6
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
  -- Every column reference below is table-qualified (de./d./s.) on purpose:
  -- RETURNS TABLE(...) names become plpgsql variables in scope for the
  -- whole function body, and several of them (document_id, session_id,
  -- content) collide with real column names — see 0007's "column reference
  -- is ambiguous" note for the bug this avoids.
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
    order by de.embedding <=> p_query_embedding
    limit p_match_count;
end;
$$;

grant execute on function public.match_document_chunks(uuid, vector, int) to authenticated;
