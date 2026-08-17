-- Admin-editable system prompt for per-element Commons summaries.
-- Per-stream override; NULL means "use the product default in application code".
-- Existing "Stream admins can update their stream" policy (0007) covers writes.

alter table public.streams
  add column if not exists summarize_system_prompt text;

comment on column public.streams.summarize_system_prompt is
  'Optional override for the per-element Commons summary system prompt. NULL = code default.';
