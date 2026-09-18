-- Guided Reflect flow: optional welcome + ordered questions per session.
-- Simple inquiry continues to use seed_question alone.
-- Apply in the Supabase SQL editor. Safe to re-run.

alter table public.sessions
  add column if not exists reflect_welcome text;

alter table public.sessions
  add column if not exists reflect_questions jsonb;

comment on column public.sessions.reflect_welcome is
  'Optional welcome/intro shown before guided Reflect questions.';

comment on column public.sessions.reflect_questions is
  'Ordered JSON array of reflection questions for guided Reflect; null/empty = simple seed_question flow.';
