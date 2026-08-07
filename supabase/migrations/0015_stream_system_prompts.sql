-- Admin-editable system prompts for Reflect (Chatbot) and Ask CLara.
-- Per-stream overrides; NULL means "use the product default in application code".
-- Existing "Stream admins can update their stream" policy (0007) covers writes.
-- Members already SELECT their streams (0001), so Reflect/Ask can read overrides.

alter table public.streams
  add column if not exists reflect_system_prompt text,
  add column if not exists ask_system_prompt text;

comment on column public.streams.reflect_system_prompt is
  'Optional override for the Reflect (CLara Chatbot) system prompt. NULL = code default.';

comment on column public.streams.ask_system_prompt is
  'Optional override for the Ask CLara system prompt. NULL = code default.';
