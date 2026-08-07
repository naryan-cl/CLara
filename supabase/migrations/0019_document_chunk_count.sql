-- Ask CLara index status: count embeddings for a document (or session).
-- document_embeddings has RLS with no policies (0008), so request-scoped
-- clients cannot SELECT it. This SECURITY DEFINER helper is the audited
-- place that can — same membership + privacy pattern as match_document_chunks.
-- Used to surface "not indexed yet" in scoped Ask and to list missing rows
-- for the Admin Ask-index backfill.

create or replace function public.document_chunk_count(
  p_document_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stream_id uuid;
  v_privacy text;
  v_created_by uuid;
  v_count integer;
begin
  select d.stream_id, d.privacy_status, d.created_by
    into v_stream_id, v_privacy, v_created_by
  from public.documents d
  where d.id = p_document_id;

  if v_stream_id is null then
    return 0;
  end if;

  if not exists (
    select 1 from public.stream_members sm
    where sm.stream_id = v_stream_id and sm.user_id = auth.uid()
  ) then
    raise exception 'Not authorized: you are not a member of this stream.';
  end if;

  if v_privacy <> 'public' and v_created_by <> auth.uid() then
    -- Same privacy gate as match_document_chunks: private docs only for author.
    -- (Session-attendee private reads are a documents RLS concern; embeddings
    -- stay author/public only so Ask never indexes private peer reflections.)
    return 0;
  end if;

  select count(*)::integer into v_count
  from public.document_embeddings de
  where de.document_id = p_document_id;

  return coalesce(v_count, 0);
end;
$$;

grant execute on function public.document_chunk_count(uuid) to authenticated;

-- Stream-admin helper: documents with content that have zero embedding rows.
create or replace function public.list_documents_missing_embeddings(
  p_stream_id uuid
)
returns table (
  document_id uuid,
  title text,
  document_type text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.stream_members sm
    where sm.stream_id = p_stream_id
      and sm.user_id = auth.uid()
      and sm.role = 'admin'
  ) then
    raise exception 'Not authorized: stream admins only.';
  end if;

  return query
    select
      d.id as document_id,
      d.title,
      d.type as document_type
    from public.documents d
    where d.stream_id = p_stream_id
      and coalesce(d.is_draft, false) = false
      and d.content is not null
      and length(trim(d.content)) > 0
      and not exists (
        select 1
        from public.document_embeddings de
        where de.document_id = d.id
      )
    order by d.created_at desc;
end;
$$;

grant execute on function public.list_documents_missing_embeddings(uuid) to authenticated;
