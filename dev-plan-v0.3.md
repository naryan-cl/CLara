# CLara Platform — Development & Implementation Plan

**Version:** 0.3  
**Last updated:** 2026-07-30 (Google SSO + email/password auth; Listens v1 shipped)  
**Target Tool:** Cursor (AI Coding Assistant)  
**Tech Stack:** Next.js (App Router), Supabase (PostgreSQL, Auth, pgvector, Storage), Vercel, Tailwind, OpenAI, Inngest v4, TipTap (rich text ↔ Markdown).  
**Companion PRD:** `prd-v0.5.md`  
**Supersedes:** `dev-plan-v0.2.md`  
**Live:** https://clara-cl.vercel.app/

---

## 0. Handoff — start here

### Colleague checklist
1. Pull latest `main` (repo may be **public**; never commit `.env.local` or secrets).
2. Copy `.env.example` → `.env.local`; fill Supabase + OpenAI + Inngest (same names as Vercel).
3. `npm install` && `npm run dev` (optional: `npm run inngest:dev` in a second terminal).
4. Confirm you are in `stream_members` for Camp CLAI (admins: see migrations `0001` / `0002`).
5. Read **§4 Progress & Decisions** below before coding.

### What works in production today
*   Auth shell, landing, dashboard, sessions nav.
*   Active stream from DB (`getActiveStream`).
*   Commons `documents` table + RLS.
*   CLara Receives: Upload (`.md`/`.txt`) **or** Add text (TipTap → Markdown).
*   Document view/edit at `/sessions/documents/[id]`.
*   Inngest serve + health + `clara/hello` smoke test.
*   **CLara Listens v1** (local, verified 2026-07-30): mic recording → Whisper → Commons document. Not yet deployed to Vercel — see below.
*   **PDF/DOCX Receives** (local, verified 2026-07-30): async Storage + Inngest conversion path. Not yet deployed to Vercel — needs `0005_receives_staging_storage.sql` run on prod Supabase first (Vercel already has `OPENAI_API_KEY`/`SUPABASE_SECRET_KEY` from the OKF enrich work).

### Do not break
*   Chatbot ≠ Ask CLara (separate surfaces/pipelines).
*   Always pass `stream_id` on Commons writes.
*   Keep Old Clara’s Inngest app/URL separate from this project’s sync (`clara-cl.vercel.app`).

---

## 1. Product framing

*   **Product:** CLara · **First stream:** Camp CLAI (`camp-clai`, isolation **on**)
*   **Lens:** Input → Commons → Output
*   **Content model:** Users see rich text; **storage is Markdown** in `documents.content`

| Lens | Status |
| :--- | :--- |
| Receives (text) | **Shipped** |
| OKF LLM enrich (Inngest) | **Shipped** |
| Listens (audio) | **Shipped v1** (short mic recordings, sync transcription — see below) |
| PDF/DOCX → Markdown | **Shipped** (async, Storage + Inngest — see below) |
| Chatbot / Ask / Map | Later |

---

## 2. Database (applied / pending)

### Applied (run in Supabase SQL editor if a fresh env)
*   `0001_streams.sql` — `streams`, `stream_members`, RLS, seed Camp CLAI
*   `0002_naryan_camp_clai_admin.sql` — admin membership for `naryan@cultivatingleadership.com`
*   `0003_documents.sql` — `documents` + privacy enum + RLS (member read public; author read/update; member insert; stream admin update)
*   `0004_sessions.sql` — `sessions` table (event containers) + RLS; `documents.session_id` converted from free text to a `sessions.id` FK (safe: 0 production rows had it set)
*   `0005_receives_staging_storage.sql` — private `receives-staging` Storage bucket (path `{stream_id}/{uuid}.{ext}`) + object policies scoped to stream membership, for the PDF/DOCX Receives path

### Not yet migrated
*   `document_embeddings`, `nodes`, `edges` — see prior §1.2 plan in v0.2 history / PRD

### `documents` columns (shipped)
`id`, `stream_id`, `created_by`, `content`, `title`, `session_id`, `type`, `participants`, `tags`, `privacy_status`, `needs_review`, `created_at`, `updated_at`

---

## 3. Key code map

| Area | Path |
| :--- | :--- |
| Active stream | `src/lib/streams/get-active-stream.ts` |
| Create / list / get / update docs | `src/lib/documents/*` |
| Markdown ↔ HTML | `src/lib/markdown/convert.ts` |
| Receives UI | `src/components/ReceiveUploadForm.tsx` |
| Rich editor / view | `src/components/MarkdownEditor.tsx`, `MarkdownView.tsx` |
| Doc editor page | `src/app/(app)/sessions/documents/[id]/page.tsx` |
| Receives action | `src/app/(app)/sessions/actions.ts` → `receiveTextContent` |
| Inngest | `src/lib/inngest/*`, `src/app/api/inngest/route.ts`, `/api/inngest/health` |
| OKF enrichment job | `src/lib/inngest/functions/okf-enrich.ts` |
| Admin (service) Supabase client | `src/lib/supabase/admin.ts` — backend-only, bypasses RLS via `SUPABASE_SECRET_KEY`; never import from a request/Server Component path |
| OpenAI env helpers | `src/lib/openai/env.ts` |
| Listens recorder UI | `src/components/ListensRecorder.tsx` |
| Listens action | `src/app/(app)/sessions/listens-actions.ts` → `receiveListensRecording` |
| Whisper transcription helper | `src/lib/openai/transcribe.ts` → `transcribeAudio`, `MAX_AUDIO_BYTES` |
| Sessions (event containers) | `src/lib/sessions/*` — `list-sessions.ts`, `create-session.ts` (RLS-scoped), `find-or-create-session.ts` (admin, for OKF enrich) |
| PDF/DOCX conversion job | `src/lib/inngest/functions/convert-upload.ts` — `unpdf` for PDF, `mammoth` + existing `htmlToMarkdown` for DOCX |
| Env template | `.env.example` |

### Inngest
*   App id in code: `clara`
*   Smoke event: `clara/hello` → function `clara-hello`
*   OKF enrich event: `clara/document.created` → function `clara-okf-enrich` (sent from `receiveTextContent` after a successful create, and from `clara-convert-upload` after a successful conversion; best-effort, never blocks the user's Receive)
*   Upload conversion event: `clara/upload.received` → function `clara-convert-upload` (sent from `receiveConvertibleUpload` in `sessions/actions.ts` after the file lands in Storage; enqueue failure rolls back the placeholder doc + storage object, unlike OKF enrich's best-effort failure mode, since extracted content is the whole point of this path)
*   Prod sync URL: `https://clara-cl.vercel.app/api/inngest`
*   Package: `inngest@^4` (Festival-style `triggers: [{ event }]`)
*   **Local dev gotcha:** `/api/inngest` defaults to assuming production/cloud mode and 500s against the local Inngest CLI dev server ("no signing key found") unless `INNGEST_DEV=1` is set in `.env.local`. Do not set this in Vercel.

---

## 4. Progress & Decisions (living log)

### Current phase
*   **Phase 2 complete** (Receives text + PDF/DOCX + OKF enrich + Listens v1 + Admin Queue) — every Phase 2 checklist item is now shipped except optional audio-file-via-Receives.
*   **Phase 5, modules 1–2 (sessions table + full session archive UI) shipped 2026-07-30.** Next: module 3, "I Attended" harvest.

### Shipped
*   Phase 1 shell: Next.js + Supabase auth + app routes + CLara branding.
*   Login: Google OAuth + email/password (sign-in / create account); magic link removed (`src/app/login/page.tsx`).
*   Streams + membership + active stream UI.
*   Vercel + OpenAI + Inngest keys; hello job verified.
*   `documents` Commons + dashboard/sessions recent lists.
*   Receives Upload / Add text; TipTap toolbar; Markdown storage; view/edit.
*   Public repo secrets policy (`.cursorrules` / `claude.md` / README / `.gitignore`).
*   Production Auth URL config (Site URL + `/auth/callback` redirect for `clara-cl.vercel.app`) — Magic Link confirmed working in prod.
*   **OKF LLM enrichment (Inngest):** on `clara/document.created`, `clara-okf-enrich` fetches the doc via the new admin (service) client, asks OpenAI (`gpt-4o-mini`, structured JSON output) to propose tags / participants / session id, writes them back only if not already set (never clobbers manual edits), and sets `needs_review = !confident`. Fails gracefully (skips, doesn't retry-loop) if `OPENAI_API_KEY` isn't configured. Verified end-to-end locally via a direct admin-client + `inngest.send` test (magic-link email was rate-limited at test time) — tags/participants/session_id all extracted correctly from a sample reflection.
*   **CLara Listens v1 (2026-07-30):** browser mic recording (`MediaRecorder`, mono, 32kbps opus/mp4) → `receiveListensRecording` Server Action → OpenAI Whisper (`transcribeAudio`) → `createDocument({ type: "Transcript" })`, same table/RLS Receives uses. **Deliberately synchronous, no Storage bucket, no Inngest job** — the audio blob never persists, only the transcript text. This caps usable recordings at roughly 15 minutes (~4MB at the recorded bitrate, staying under Vercel's ~4.5MB serverless request-body limit) — fine for a reflection, not a full meeting. Required raising `next.config.ts`'s `experimental.serverActions.bodySizeLimit` from Next's 1MB default to `"5mb"`. Verified end-to-end by the user locally (real mic recording → transcript → document appeared correctly).
*   **Admin Queue (2026-07-30):** `/admin` gated on `stream.role === "admin"` (from `getActiveStream()`); lists documents where `needs_review = true` via new `listNeedsReviewDocuments()` helper (`src/lib/documents/list-needs-review.ts`), reusing the existing `DocumentList` component. No new "approve" action needed — opening a flagged doc through the existing editor and saving with Title + Type filled already clears `needs_review` (`saveDocumentEdits`), so the queue is just a filtered view into that flow. Verified end-to-end locally: flagged a real doc via the admin Supabase client, confirmed it appeared in `/admin`, edited + saved it, confirmed it dropped out of the queue. (Local auth was magic-link-rate-limited during testing, so sign-in was done via `supabase.auth.admin.generateLink()` + `verifyOtp()` instead of an emailed link — a temporary `/dev-login` test page was added and deleted for this, never committed.)
*   **Sessions table (Phase 5 module 1, 2026-07-30):** `0004_sessions.sql` — `sessions` (event container: `id`, `stream_id`, `name`, `occurred_at`, `created_by`) unique on `(stream_id, name)`, RLS: members read/insert, stream admins update. `documents.session_id` converted from free-text to a `sessions.id` FK (`on delete set null`) — safe because 0 production documents had it set at migration time, confirmed by a read-only admin-client check before writing the migration. Cascading updates required: `DocumentEditor.tsx`'s free-text session field is now a `<select>` of the stream's sessions plus a "+ New session…" option that reveals a name input; `saveDocumentEdits` (`sessions/documents/actions.ts`) creates the session server-side (`src/lib/sessions/create-session.ts`) before saving the document when a new name is submitted; the OKF enrichment Inngest job (`okf-enrich.ts`) now resolves its LLM-proposed session name through `findOrCreateSessionByName()` (`src/lib/sessions/find-or-create-session.ts`, admin-client upsert on the unique constraint) instead of writing raw text. New lib: `src/lib/sessions/{types,list-sessions,create-session,find-or-create-session}.ts`. Verified end-to-end locally: ran the migration in the Supabase SQL editor, edited a real document, picked "+ New session…", named it "Morning Circle 1", saved — confirmed via a read-only admin-client script that a `sessions` row was created and the document's `session_id` FK points to it; reloaded a second document's editor and confirmed "Morning Circle 1" now appears as a selectable existing option in its dropdown. **Manual test checklist:** (1) open a document, Edit, session dropdown defaults to "— none —"; (2) pick "+ New session…", type a name, Save → read view shows `· session <name>`; (3) open a different document, Edit → new session appears in the dropdown; (4) re-select the same name in "+ New session…" on another doc → no duplicate row (unique constraint + upsert).
*   **Dev tooling fix (2026-07-30):** `.claude/dev-server.sh` had Windows-style CRLF line endings, which broke its shebang on macOS (`Operation not permitted` / `No such file or directory` when the preview tool tried to spawn it). Converted to LF. Also found and killed a stale `next start` (production build) process that had been squatting on port 3000 from an earlier session — always confirm with `ps` that anything already on the dev port is actually `next dev` before trusting hot reload.
*   **Full session archive (Phase 5 module 2, 2026-07-30):** `/sessions/archive` lists every session in the active stream (`listSessions`, sorted by `occurred_at` then `created_at`); `/sessions/archive/[id]` shows one session's name/date plus every Commons document tied to it via new `listDocumentsBySession()` (`src/lib/documents/list-by-session.ts`, `eq("session_id", ...)`) rendered through the existing `DocumentList`. Same soft stream-guard pattern as the document detail page. Linked from `/sessions` via a new "Browse session archive →" button; the old "later slice" copy on that page was updated since this is no longer later. Verified end-to-end locally: archive list shows "Morning Circle 1" (created in module 1's test), opening it shows "Test Jul 30" as the one document tied to it, link back to the document works, no console errors.
*   **Note on concurrent work (2026-07-30):** mid-session, discovered a colleague had PDF/DOCX Receives in flight uncommitted in the same working directory at the same time (new migration, Inngest job, `ReceiveUploadForm` changes) — including a migration filename collision at `0004`. Resolved by them renumbering their file to `0005_receives_staging_storage.sql`; no file overlap with Phase 5 work. Flagging the pattern: **before starting a module, check `git status` for unfamiliar uncommitted changes** — this is a public/multi-author repo and more than one person (or agent) may be working in it at once.
*   **PDF/DOCX Receives (2026-07-30):** async path, since conversion is too heavy to hold up a request. `receiveConvertibleUpload` (new branch inside `sessions/actions.ts`'s `receiveTextContent`, keyed off `.pdf`/`.docx` extension) uploads the raw file to the new private `receives-staging` Storage bucket (request-scoped client, RLS-enforced — see `0005_receives_staging_storage.sql`), creates a placeholder `documents` row (`content: ""`, `needs_review: true`), and sends `clara/upload.received`. The `clara-convert-upload` Inngest function downloads the file via the admin client, extracts Markdown in one step (PDF via `unpdf`'s `extractText`; DOCX via `mammoth.convertToHtml` piped through the existing `htmlToMarkdown` turndown helper — deliberately one step, not split download/convert, to avoid Inngest step-output size limits on the raw file bytes), writes the content back (`needs_review: false` on success, or a clear human-readable placeholder message + `needs_review: true` on failure — never crashes), deletes the Storage object either way, and on success chains into `clara-okf-enrich` the same way text Receives does. Capped at ~4.5MB (same server-action body limit Listens already established in `next.config.ts`). Verified end-to-end locally for both file types via a direct admin-client + `inngest.send` test (magic-link still rate-limited): generated real test files with macOS's built-in `textutil`/`cupsfilter`, confirmed correct Markdown extraction, confirmed the Storage object was deleted after processing, and confirmed OKF enrichment ran afterward and populated tags/participants correctly on both.

### Security incident — resolved (2026-07-29)
*   Real Supabase `anon` and `service_role` **JWT** keys were committed to `.env.example` (commit `8b472fb`) and pushed to this public repo for ~25 min before being caught.
*   **Fix:** legacy JWT-based Supabase API keys were **disabled entirely** in the dashboard (Project Settings → API Keys → Legacy API Keys → "Disable JWT-based API keys"). This project now runs on the newer Publishable/Secret key system only — no JWT secret rotation was available/needed once disabled.
*   Vercel's `NEXT_PUBLIC_SUPABASE_ANON_KEY` was updated to the publishable key (`sb_publishable_...`) and redeployed *before* disabling the legacy keys, so production had zero downtime.
*   `.env.example` restored to placeholders only; added an explicit incident note there so this isn't repeated.
*   **Takeaway:** never paste real values into `.env.example` — only into `.env.local` (gitignored) or Vercel's env var UI.

### Decisions (must remember)
*   CLara platform; Camp CLAI first stream; isolation **true**.
*   Chatbot ≠ Ask (no shared RAG/prompt state).
*   Auth is platform-level: **Google SSO** + **email/password**; magic link **removed** (avoids built-in SMTP rate limit).
*   Password identity is **email** (Supabase standard), not a separate username.
*   For email signup without custom SMTP: prefer **Auth → Providers → Email → Confirm email = off** during build, or create users in Dashboard → Authentication → Users.
*   OKF = Open Knowledge Format; UI says **Type**.
*   OKF fill: form Title/Type/Privacy now; **LLM+Inngest** for Session/Tags/Participants; `needs_review` fallback.
*   Rich text ↔ Markdown storage (TipTap + marked/turndown; underline may be `<u>` in MD).
*   Receives: Upload XOR Add text.
*   Repo **public while building**; secrets only in Vercel / `.env.local`.
*   Inngest for **this** app ≠ Old Clara Inngest (different serve URL).
*   Reference: Festival + Old Clara folders (see below).
*   Listens v1 is intentionally short-recording-only (sync, no Storage, no Inngest); long/chunked meeting recordings are a separate later phase, not a bug in v1.

### Reference projects
*   **Festival** — `C:\Users\narya\OneDrive\Documents\WEAll Can\Festival` — Inngest, Ask/RAG, graph, embeddings, PDF/DOCX convert (`unpdf` / markitdown).
*   **Old Clara** — `C:\Users\narya\OneDrive\Documents\GitHub\Old Clara` — Listens recorder, Whisper, chunked upload, privacy gates.

### Next up (pick one module at a time)
1.  "I Attended" harvest (Phase 5 module 3).
2.  Admin polish — membership edge cases + isolation toggle UI (Phase 5 module 4).
3.  Embeddings + **Ask CLara** (stream-scoped RAG).
4.  **Listens v2** (Storage bucket + async Inngest transcription) — only if long/full-meeting recordings become a real need; v1 already covers short reflections. Note: PDF/DOCX Receives already proved this exact pattern (Storage + admin client + Inngest), so Listens v2 can mostly reuse it.

### Blocked / open
*   Supabase Auth URL config for production (Google redirect) — needs **owner** access.
*   Google provider must be enabled in Supabase with Client ID/Secret; Email provider must allow password sign-in.
*   Vercel Hobby previously blocked non-owner commit authors on **private** repos — mitigated by going public; Pro or commit-as-`naryan-cl` if made private again.
*   Local git push from some agents may lack GitHub auth — use GitHub Desktop / logged-in CLI.
*   Supabase's default email provider rate-limits Magic Link sends fairly aggressively (hit during this session's testing) — fine for dev, but production should get a custom SMTP provider configured before real camp usage.

---

## 5. Phase plan (remaining)

### Phase 2 (finish ingestion)
*   [x] Text Receives + documents CRUD UI  
*   [x] OKF LLM enrich (Inngest)  
*   [x] PDF/DOCX convert  
*   [x] Listens + Whisper (v1 — short recordings, sync; long/chunked is a later phase)  
*   [ ] Audio file via Receives (optional share Whisper)

### Phase 3 — Ask + Chatbot (separate)  
### Phase 4 — Knowledge Map  

### Phase 5 — Sessions archive, Harvest, Admin polish
*   [x] `sessions` table (event containers) — migration + RLS; documents keep a `session_id` FK instead of a free-text field
*   [x] Full session archive — `/sessions/archive` list + `/sessions/archive/[id]` detail page listing that session's Commons documents (reuse `DocumentList`)
*   [ ] "I Attended" harvest — member marks sessions they attended; surface/export the Commons documents tied to those sessions for them
*   [ ] Admin polish — membership edge cases (invite/remove `stream_members`) + isolation toggle UI (§4.2 is DB/RLS-only today, no UI)

**Note:** Phase 5 was started ahead of Phase 3/4 by deliberate choice (2026-07-30) — Ask/Chatbot and Knowledge Map remain "later." Phase 2 is now fully done except optional audio-via-Receives.

---

## 6. Cursor implementation guidelines
*   Server Components by default; `"use client"` for editor, upload, future recorder/map/chat.
*   Follow `DESIGN_GUIDE.md` v0.2 (CLara naming).
*   Fail AI/pipeline work gracefully; update this Progress section after meaningful sessions.
*   No secrets in git; flag risky territory (real transcripts, client data, credentials).
