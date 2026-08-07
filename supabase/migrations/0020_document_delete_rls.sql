-- Document delete for anyone who already has edit access.
-- Mirrors UPDATE policies: author, stream admin, or session attendee.
-- prd-v0.5 / Commons Edit popup Delete button.

create policy "Authors can delete own documents"
  on public.documents for delete
  using (created_by = auth.uid());

create policy "Stream admins can delete stream documents"
  on public.documents for delete
  using (
    stream_id in (
      select stream_id
      from public.stream_members
      where user_id = auth.uid() and role = 'admin'
    )
  );

create policy "Session attendees can delete linked documents"
  on public.documents for delete
  using (
    session_id is not null
    and exists (
      select 1
      from public.session_attendees sa
      where sa.session_id = documents.session_id
        and sa.user_id = auth.uid()
    )
    and stream_id in (
      select sm.stream_id from public.stream_members sm where sm.user_id = auth.uid()
    )
  );
