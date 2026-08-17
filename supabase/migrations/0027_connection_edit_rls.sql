-- Connection edits from session/document forms.
-- Hosts, attendees, nested authors, and stream admins can write the same
-- Relate rows Add → Connect already creates. Matches canEditSession /
-- document edit (author, attendee, admin).

-- ---------------------------------------------------------------------------
-- session_relations: anyone who can edit the session can link it
-- ---------------------------------------------------------------------------
drop policy if exists "Session attendees can insert session_relations"
  on public.session_relations;
drop policy if exists "Session attendees can delete session_relations"
  on public.session_relations;
drop policy if exists "Nested document authors can insert session_relations"
  on public.session_relations;
drop policy if exists "Nested document authors can delete session_relations"
  on public.session_relations;

create policy "Session attendees can insert session_relations"
  on public.session_relations for insert
  with check (
    exists (
      select 1
      from public.session_attendees sa
      where sa.session_id = session_relations.session_id
        and sa.user_id = auth.uid()
    )
  );

create policy "Session attendees can delete session_relations"
  on public.session_relations for delete
  using (
    exists (
      select 1
      from public.session_attendees sa
      where sa.session_id = session_relations.session_id
        and sa.user_id = auth.uid()
    )
  );

create policy "Nested document authors can insert session_relations"
  on public.session_relations for insert
  with check (
    exists (
      select 1
      from public.documents d
      where d.session_id = session_relations.session_id
        and d.created_by = auth.uid()
    )
  );

create policy "Nested document authors can delete session_relations"
  on public.session_relations for delete
  using (
    exists (
      select 1
      from public.documents d
      where d.session_id = session_relations.session_id
        and d.created_by = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- document_links: document editors + session editors (target_session_id)
-- ---------------------------------------------------------------------------
drop policy if exists "Stream admins can insert document_links"
  on public.document_links;
drop policy if exists "Stream admins can delete document_links"
  on public.document_links;
drop policy if exists "Session attendees can insert document_links"
  on public.document_links;
drop policy if exists "Session attendees can delete document_links"
  on public.document_links;
drop policy if exists "Session editors can relate documents to a session"
  on public.document_links;
drop policy if exists "Session editors can remove session relate links"
  on public.document_links;

create policy "Stream admins can insert document_links"
  on public.document_links for insert
  with check (public.is_stream_admin(stream_id));

create policy "Stream admins can delete document_links"
  on public.document_links for delete
  using (public.is_stream_admin(stream_id));

create policy "Session attendees can insert document_links"
  on public.document_links for insert
  with check (
    exists (
      select 1
      from public.documents d
      join public.session_attendees sa on sa.session_id = d.session_id
      where d.id = source_document_id
        and d.session_id is not null
        and sa.user_id = auth.uid()
        and d.stream_id = document_links.stream_id
    )
  );

create policy "Session attendees can delete document_links"
  on public.document_links for delete
  using (
    exists (
      select 1
      from public.documents d
      join public.session_attendees sa on sa.session_id = d.session_id
      where d.id = source_document_id
        and d.session_id is not null
        and sa.user_id = auth.uid()
    )
  );

-- Session editor connecting an element to this gathering (source = document).
create policy "Session editors can relate documents to a session"
  on public.document_links for insert
  with check (
    target_session_id is not null
    and target_document_id is null
    and exists (
      select 1
      from public.sessions s
      where s.id = target_session_id
        and s.stream_id = document_links.stream_id
        and (
          s.created_by = auth.uid()
          or public.is_stream_admin(s.stream_id)
          or exists (
            select 1
            from public.session_attendees sa
            where sa.session_id = s.id
              and sa.user_id = auth.uid()
          )
          or exists (
            select 1
            from public.documents d
            where d.session_id = s.id
              and d.created_by = auth.uid()
          )
        )
    )
  );

create policy "Session editors can remove session relate links"
  on public.document_links for delete
  using (
    target_session_id is not null
    and exists (
      select 1
      from public.sessions s
      where s.id = target_session_id
        and (
          s.created_by = auth.uid()
          or public.is_stream_admin(s.stream_id)
          or exists (
            select 1
            from public.session_attendees sa
            where sa.session_id = s.id
              and sa.user_id = auth.uid()
          )
          or exists (
            select 1
            from public.documents d
            where d.session_id = s.id
              and d.created_by = auth.uid()
          )
        )
    )
  );
