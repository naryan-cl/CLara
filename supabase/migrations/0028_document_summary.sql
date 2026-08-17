-- Per-element Markdown summary on every Commons document.
-- Why: Dashboard/Commons detail should open on a short summary, with the
-- original transcript / reflection / uploaded text on a second tab.
-- Session Finalize still writes a nested type=Summary document for the
-- gathering synthesis — that is separate from this column.
-- Numbered 0028: 0026 session delete RLS, 0027 connection edit RLS.

alter table public.documents
  add column if not exists summary text;

comment on column public.documents.summary is
  'LLM-generated Markdown summary of content. Null until the summarize job runs.';
