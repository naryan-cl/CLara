-- Private staging bucket for CLara Receives PDF/DOCX uploads.
-- Files land here just long enough for the convert-upload Inngest job to
-- download, extract Markdown, and delete them — only the extracted text is
-- kept permanently (in documents.content), not the original file.
-- Path convention: {stream_id}/{uuid}.{ext}

insert into storage.buckets (id, name, public)
values ('receives-staging', 'receives-staging', false)
on conflict (id) do nothing;

-- Members can upload into their own stream's folder.
create policy "Members can upload to their stream's staging path"
  on storage.objects for insert
  with check (
    bucket_id = 'receives-staging'
    and (storage.foldername(name))[1]::uuid in (
      select stream_id from public.stream_members where user_id = auth.uid()
    )
  );

-- Members can read objects in their own stream's folder (not required by the
-- conversion job, which uses the admin client, but kept for consistency /
-- future debugging access).
create policy "Members can read their stream's staging objects"
  on storage.objects for select
  using (
    bucket_id = 'receives-staging'
    and (storage.foldername(name))[1]::uuid in (
      select stream_id from public.stream_members where user_id = auth.uid()
    )
  );
