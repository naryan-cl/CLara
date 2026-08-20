-- Ask CLara: per-stream LLM provider + encrypted API key (admin-only table).
-- Retrieval/embeddings still use platform OPENAI_API_KEY; this config applies
-- only to the grounded answer step in askClara().
--
-- RLS enabled with NO policies — same posture as document_embeddings (0008).
-- Only the service-role admin client reads/writes; stream members cannot
-- SELECT these rows through the browser Supabase client.

create table public.stream_ask_llm_settings (
  stream_id uuid primary key references public.streams (id) on delete cascade,
  provider text not null default 'default'
    check (provider in ('default', 'openai', 'claude', 'gemini')),
  api_key_ciphertext text,
  model text,
  updated_at timestamptz not null default now()
);

comment on table public.stream_ask_llm_settings is
  'Ask CLara answer-model settings per stream. NULL api_key_ciphertext with provider=default uses platform env keys.';

comment on column public.stream_ask_llm_settings.provider is
  'default | openai | claude | gemini — default uses OPENAI_API_KEY + OPENAI_CHAT_MODEL from Vercel.';

comment on column public.stream_ask_llm_settings.api_key_ciphertext is
  'AES-256-GCM blob (app-layer). Never expose to the browser.';

alter table public.stream_ask_llm_settings enable row level security;
