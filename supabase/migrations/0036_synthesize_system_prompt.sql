-- Admin-editable session Finalize synthesis prompt (NULL = product default in code).

alter table public.streams
  add column if not exists synthesize_system_prompt text;

comment on column public.streams.synthesize_system_prompt is
  'Override for gathering Finalize synthesis. NULL = DEFAULT_SYNTHESIZE_SYSTEM_PROMPT in src/lib/prompts/defaults.ts.';
