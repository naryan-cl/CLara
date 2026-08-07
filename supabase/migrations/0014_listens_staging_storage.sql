-- Private staging bucket for CLara Listens v2 recordings.
-- Browser uploads audio here; clara-transcribe-recording downloads via the
-- admin client, runs Whisper, writes documents.content, then deletes the
-- object. Audio is not kept permanently — only the transcript text.
-- Path convention: {stream_id}/{uuid}.{ext}
-- file_size_limit = OpenAI Whisper's 25 MB upload cap.

insert into storage.buckets (id, name, public, file_size_limit)
values ('listens-staging', 'listens-staging', false, 26214400)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit;

-- Members can upload into their own stream's folder (browser client path).
create policy "Members can upload to their stream's listens staging path"
  on storage.objects for insert
  with check (
    bucket_id = 'listens-staging'
    and (storage.foldername(name))[1]::uuid in (
      select stream_id from public.stream_members where user_id = auth.uid()
    )
  );

-- Members can read their stream's staging objects (debugging / future UI).
create policy "Members can read their stream's listens staging objects"
  on storage.objects for select
  using (
    bucket_id = 'listens-staging'
    and (storage.foldername(name))[1]::uuid in (
      select stream_id from public.stream_members where user_id = auth.uid()
    )
  );

-- Members can delete their own uploads if finalize rolls back before Inngest runs.
create policy "Members can delete their stream's listens staging objects"
  on storage.objects for delete
  using (
    bucket_id = 'listens-staging'
    and (storage.foldername(name))[1]::uuid in (
      select stream_id from public.stream_members where user_id = auth.uid()
    )
  );
