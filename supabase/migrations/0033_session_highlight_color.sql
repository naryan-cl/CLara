-- Optional colour mark on a session so admins can spot it while scanning
-- Commons / dashboard / archive lists. NULL = no highlight.

alter table public.sessions
  add column if not exists highlight_color text;

alter table public.sessions
  drop constraint if exists sessions_highlight_color_check;

alter table public.sessions
  add constraint sessions_highlight_color_check
  check (
    highlight_color is null
    or highlight_color in ('sage', 'horizon', 'ember', 'glow')
  );

comment on column public.sessions.highlight_color is
  'Optional admin colour mark (sage / horizon / ember / glow) for scanning lists.';
