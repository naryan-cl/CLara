# CLara Platform — Development & Implementation Plan

**Version:** 0.3  
**Last updated:** 2026-08-05 (Phase 6 Modules A–F shipped in code; run migration 0011)  
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
*   **Phase 5 (sessions, archive, harvest, admin polish)** — verified locally 2026-07-30, migrations `0004`/`0006`/`0007` already run against the one shared Supabase project (same one Vercel uses). Code was committed and pushed to `main` mid-session (commit `8c5e716`, later `a28943f`/`9d096c9`) alongside the colleague's PDF/DOCX and auth work — **check actual Vercel deployment status before assuming this is live in production**, this dev-plan entry only confirms local verification.

### Do not break
*   Chatbot ≠ Ask CLara (separate surfaces/pipelines).
*   Always pass `stream_id` on Commons writes.
*   Keep Old Clara’s Inngest app/URL separate from this project’s sync (`clara-cl.vercel.app`).

---

## 1. Product framing

*   **Product:** CLara · **First stream:** Camp CLAI (`camp-clai`, isolation **on**)
*   **Lens:** Add → Commons → Synthesis (formerly Input → Commons → Output)
*   **Content model:** Users see rich text; **storage is Markdown** in `documents.content`

| Lens | Status |
| :--- | :--- |
| Receives (text) | **Shipped** |
| OKF LLM enrich (Inngest) | **Shipped** |
| Listens (audio) | **Shipped v1** (short mic recordings, sync transcription — see below) |
| PDF/DOCX → Markdown | **Shipped** (async, Storage + Inngest — see below) |
| Chatbot | **Shipped** (2026-08-04, local — see below) |
| Ask | **Shipped** (2026-08-03) |
| Map | **Shipped** (2026-08-04, local — see below) |

---

## 2. Database (applied / pending)

### Applied (run in Supabase SQL editor if a fresh env)
*   `0001_streams.sql` — `streams`, `stream_members`, RLS, seed Camp CLAI
*   `0002_naryan_camp_clai_admin.sql` — admin membership for `naryan@cultivatingleadership.com`
*   `0003_documents.sql` — `documents` + privacy enum + RLS (member read public; author read/update; member insert; stream admin update)
*   `0004_sessions.sql` — `sessions` table (event containers) + RLS; `documents.session_id` converted from free text to a `sessions.id` FK (safe: 0 production rows had it set)
*   `0005_receives_staging_storage.sql` — private `receives-staging` Storage bucket (path `{stream_id}/{uuid}.{ext}`) + object policies scoped to stream membership, for the PDF/DOCX Receives path
*   `0006_session_attendees.sql` — `session_attendees` join table (who attended which session) + RLS
*   `0007_admin_membership.sql` — admin insert/update/delete RLS on `stream_members`, admin update RLS on `streams`, plus `get_stream_members`/`add_stream_member_by_email` SECURITY DEFINER functions
*   `0008_document_embeddings.sql` — enables `pgvector`; `document_embeddings` (chunked, `vector(1536)`, HNSW cosine index, RLS on with **no** policies — service-role/SECURITY DEFINER only). Ask CLara Module A.
*   `0009_match_document_chunks.sql` — `match_document_chunks(stream_id, query_embedding, match_count)` SECURITY DEFINER function (stream-membership + document-privacy checked internally, same pattern as `get_stream_members`). Ask CLara Module B.
*   `0010_knowledge_map.sql` — `nodes` (Atom/Concept/Framework/Theme, unique per `(stream_id, lower(label))`) + `edges` (directed, unique per `(stream_id, source_node_id, target_node_id)`), RLS: stream members can `select` both, no insert/update/delete policies (admin-client-only writes, same posture as `document_embeddings`). Knowledge Map (Phase 4).

### Not yet migrated
*   (none outstanding)

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
| Sessions (event containers) | `src/lib/sessions/*` — `list-sessions.ts`, `create-session.ts` (RLS-scoped), `find-or-create-session.ts` (admin, for OKF enrich), `get-session.ts`, `attendance.ts` ("I Attended" harvest) |
| Session archive UI | `src/app/(app)/sessions/archive/*` — list + `[id]` detail; `src/lib/documents/list-by-session.ts` |
| Harvest UI | `src/app/(app)/sessions/harvest/page.tsx`, `src/components/HarvestExport.tsx` |
| Admin membership + isolation | `src/lib/streams/{list-members,add-member,remove-member,update-member-role,update-isolation}.ts`, `src/app/(app)/admin/actions.ts`, `src/components/{MembersPanel,IsolationToggle}.tsx` |
| PDF/DOCX conversion job | `src/lib/inngest/functions/convert-upload.ts` — `unpdf` for PDF, `mammoth` + existing `htmlToMarkdown` for DOCX |
| Ask CLara embeddings (Module A) | `src/lib/embeddings/{chunk-text,store-document-embeddings}.ts`, `src/lib/openai/embed.ts`, `src/lib/inngest/functions/embed-document.ts` — chunk → embed → `document_embeddings` on `clara/document.created` |
| Ask CLara retrieval + UI (Module B) | `src/lib/embeddings/search-commons.ts` (embed question → `match_document_chunks` RPC), `src/app/(app)/ask/actions.ts` (`askClara` — grounded chat completion + citations), `src/components/AskForm.tsx`, `src/app/(app)/ask/page.tsx` |
| CLara Chatbot — conversation + save (Module A + B) | `src/app/(app)/chat/actions.ts` (`sendChatMessage` — reflective-persona chat completion, in-memory only; `saveChatConversation` — writes transcript to `documents` as `Type: Reflection` / Private, fires `clara/document.created`), `src/components/ChatForm.tsx`, `src/app/(app)/chat/page.tsx` |
| Knowledge Map extraction (Module A) | `src/lib/graph/{types,extract-graph,upsert-graph}.ts` (LLM proposes nodes/edges → admin-client upsert, dedupes nodes by label), `src/lib/inngest/functions/extract-graph.ts` — public-documents-only, on `clara/document.created` |
| Knowledge Map read + UI (Module B) | `src/lib/graph/{list-graph,layout}.ts` (RLS read; `computeGraphLayout` — pure d3-force layout, deterministic seeded positions), `src/components/KnowledgeMap.tsx` (dark-canvas SVG render + detail panel), `src/app/(app)/map/page.tsx` |
| Env template | `.env.example` |

### Inngest
*   App id in code: `clara`
*   Smoke event: `clara/hello` → function `clara-hello`
*   OKF enrich event: `clara/document.created` → function `clara-okf-enrich` (sent from `receiveTextContent` after a successful create, and from `clara-convert-upload` after a successful conversion; best-effort, never blocks the user's Receive)
*   Same `clara/document.created` event also fans out to `clara-embed-document` (Ask CLara) and `clara-extract-graph` (Knowledge Map) — all three listeners are independent, no shared state, added without ever touching `receiveTextContent`/`convert-upload`/`saveChatConversation`
*   Upload conversion event: `clara/upload.received` → function `clara-convert-upload` (sent from `receiveConvertibleUpload` in `sessions/actions.ts` after the file lands in Storage; enqueue failure rolls back the placeholder doc + storage object, unlike OKF enrich's best-effort failure mode, since extracted content is the whole point of this path)
*   Prod sync URL: `https://clara-cl.vercel.app/api/inngest`
*   Package: `inngest@^4` (Festival-style `triggers: [{ event }]`)
*   **Local dev gotcha:** `/api/inngest` defaults to assuming production/cloud mode and 500s against the local Inngest CLI dev server ("no signing key found") unless `INNGEST_DEV=1` is set in `.env.local`. Do not set this in Vercel.
*   **Local dev gotcha — stale background processes on both ports (2026-08-03):** hit while verifying Ask CLara Module A. Two *separate* leftover processes from earlier sessions were still running: (1) an old `next dev` bound to port 3000 (IPv6-only), which made a freshly-started `npm run dev` fall back to port 3001 and refuse to serve; (2) an old `inngest-cli dev` bound to the **default** port 8288, which pushed a freshly-started `npm run inngest:dev` onto port 8290. The app's `inngest.send()` calls (event sending, via `INNGEST_DEV=1`) always target the *default* dev-server port 8288 — they don't follow the `-u` flag, which only controls the CLI's own polling target for function *discovery/sync*. Net effect: the CLI's sync/introspection worked fine (`PUT /api/inngest` kept returning 200) even while every real event silently vanished into the wrong, unsynced dev-server instance on 8288 — so the Inngest dashboard looked "connected" but showed zero runs, which is a confusing false-healthy signal. **Fix + lesson: if a fresh `npm run dev` doesn't land on port 3000, or a fresh `npm run inngest:dev` doesn't land on port 8288, don't just use whatever port it fell back to — find and `kill` the process squatting on the *expected* port first** (`lsof -iTCP:3000 -sTCP:LISTEN`, `lsof -iTCP:8288 -sTCP:LISTEN`), then restart both fresh. Verified fixed: after killing both stale PIDs and restarting, the Inngest dashboard showed `apps synced, disabling auto-discovery`, and a real Receives submit produced both `clara-okf-enrich` and `clara-embed-document` runs with status `Completed`.

---

## 4. Progress & Decisions (living log)

### Current phase
*   **Phase 2–5 complete** (ingestion, Ask + Chatbot, Knowledge Map, sessions/archive/harvest/admin). See shipped log below.
*   **Phase 6 complete (2026-08-05):** Modules A–F shipped in code — nested nav + hamburger, Add page split, Commons repository (filters/sort/eye icon), minimizable detail popup, comments + edit audit log (`0011`), landing/dashboard copy. **Verified end-to-end by user 2026-08-05** (migration `0011` applied). Comments also on full document + session archive deep-link pages.
*   **Ask CLara v2 Module A (follow-ups) shipped 2026-08-05:** in-session conversation history on `/ask` (client-held turns; `askClara(question, history)`); short follow-ups blend prior user question into retrieval; Chatbot pipeline stays separate.
*   **Chatbot v2 Module A (privacy at save) shipped 2026-08-05:** save UI lets the participant choose Private (default) or Public Commons before writing the reflection.
*   **Ask CLara v2 Module B (similarity cutoff) shipped 2026-08-05:** `searchCommons` drops chunks below `DEFAULT_MIN_SIMILARITY` (0.28) so off-topic questions skip the LLM and return the quiet "nothing found" answer.
*   **Chatbot v2 Module B (per-exchange share) shipped 2026-08-05:** each CLara reply can "Share this exchange" (prior user turn + reply) as its own Reflection; full-conversation save remains.
*   **Knowledge Map v2 Module A (arrow-key nav) shipped 2026-08-05:** spatial arrow-key movement between nodes (`findNearestInDirection`), roving tabindex, Enter/Space select, Escape clears; closes the DESIGN_GUIDE a11y gap that v1 only had Tab/Enter.
*   **Audio via Receives shipped 2026-08-05:** Upload accepts short Whisper-friendly audio (`.mp3`, `.m4a`, `.wav`, …) with the same ~4MB / ~15 min cap as Listens v1; saves a public `Transcript`. Closes the Phase 2 optional checklist item (not Listens v2 — still sync, no Storage).

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
*   **"I Attended" harvest (Phase 5 module 3, 2026-07-30):** `0006_session_attendees.sql` — `session_attendees` join table (`session_id`, `user_id`, PK on both), RLS: users read/insert/delete only their own rows, insert additionally checked against `stream_members` so you can only mark attendance for sessions in a stream you belong to. New lib `src/lib/sessions/attendance.ts` (`markAttended`/`unmarkAttended`/`isAttending`/`listAttendedSessionIds`). UI: `AttendanceToggle` client component (calls new `toggleAttendance` server action in `sessions/archive/actions.ts`) added to `/sessions/archive/[id]`; new `/sessions/harvest` page lists every session the signed-in user attended with that session's documents (reusing `DocumentList`), plus a `HarvestExport` client component that builds a single Markdown string (session as `#`, each document as `##`) and triggers a browser download via `Blob` + `URL.createObjectURL` — purely client-side, no data leaves the browser. Linked from `/sessions` via a new "My harvest →" button. Verified end-to-end locally: toggled attendance on "Morning Circle 1" (confirmed the button flips to "✓ I attended this session"), confirmed it then appears on `/sessions/harvest` with its document, and confirmed the downloaded Markdown Blob's actual text content is correctly formatted (captured via intercepting `URL.createObjectURL` in a test script, since `link.click()` revokes the blob URL immediately after).
*   **Admin polish (Phase 5 module 4, 2026-07-30):** `0007_admin_membership.sql` — RLS insert/update/delete policies on `stream_members` and an update policy on `streams`, all scoped to "admins of their own stream" (same pattern as documents/sessions). Plus two `SECURITY DEFINER` functions, `get_stream_members` and `add_stream_member_by_email`, because listing members with email and resolving an email to a user id both require reading `auth.users`, which the RLS-bound client can't query directly — this project's convention is to keep the admin (service-role) client out of request-serving code, so a narrowly-scoped SQL function (each one re-checks the caller is an admin of that specific stream before doing anything) is the correct way to reach it instead. **By design, "add member" only attaches an *existing* account by email — it never creates accounts or sends invite email**, a deliberate scope decision so this feature can't send real messages to real people. New lib `src/lib/streams/{list-members,add-member,remove-member,update-member-role,update-isolation}.ts`; new `MembersPanel` and `IsolationToggle` client components wired into a redesigned `/admin` (now: Isolation, Membership, Admin Queue). UI-level guard hides remove/role-change controls for your own row (can't accidentally lock yourself out); server actions re-check the same server-side. **Bug caught during verification:** `get_stream_members`'s first draft referenced `user_id`/`role` unqualified inside a query — since `RETURNS TABLE(user_id, role, ...)` makes those names plpgsql variables in scope for the whole function body, Postgres couldn't tell if they meant the variable or the `stream_members` column ("column reference is ambiguous"). Fixed by aliasing the table and qualifying every column reference. Took two attempts to actually land — first re-run apparently re-applied the old unfixed SQL rather than the corrected version (root cause unclear — possibly a stale clipboard paste); confirmed via `pg_get_functiondef('public.get_stream_members(uuid)'::regprocedure)` before trusting the second attempt. **Lesson: when a SQL fix doesn't take effect, verify what's actually stored with `pg_get_functiondef` rather than assuming the paste landed.** Verified end-to-end locally: membership list shows both real members with correct email/role, own row correctly hides mutate controls, adding a nonexistent email shows the friendly "no account yet" error with no mutation, isolation toggle flips the DB value and UI copy correctly in both directions (tested off → on, confirmed via direct DB read each time, restored to `true` before finishing).
*   **Note on a lost commit (2026-07-31):** module 3 + 4 work was committed once ("final edits from phase 5"), then that commit got undone by a `git reset` (most likely GitHub Desktop's "Undo commit") before a colleague's `git pull --ff` fast-forwarded this repo past it — the files vanished from disk with no working-directory trace. Recovered via `git checkout <dangling-commit-sha> -- <paths>` since the commit object itself was still reachable through `git reflog`; nothing was actually lost. **Lesson: after any commit, `git reflog` is the safety net if a reset/undo removes it — the commit isn't gone until it's garbage-collected.**
*   **Note on a broken commit (2026-07-31):** re-committing the recovered module 3/4 files then hit a `git stash pop` conflict (from an earlier GitHub Desktop stash) that got resolved by committing the file **with the literal `<<<<<<<`/`=======`/`>>>>>>>` conflict markers still in it** — this landed on `main`/`origin` as commit `9d096c9 "stashed changes"`, corrupting both `prd-v0.5.md` and `dev-plan-v0.3.md` (no code files affected). Caught immediately after and fixed by manually resolving each marker block. **Lesson: after resolving any stash/merge conflict, grep the affected files for `<<<<<<<` before committing — a clean `git status` does not mean the content inside a file is valid.**
*   **PDF/DOCX Receives (2026-07-30):** async path, since conversion is too heavy to hold up a request. `receiveConvertibleUpload` (new branch inside `sessions/actions.ts`'s `receiveTextContent`, keyed off `.pdf`/`.docx` extension) uploads the raw file to the new private `receives-staging` Storage bucket (request-scoped client, RLS-enforced — see `0005_receives_staging_storage.sql`), creates a placeholder `documents` row (`content: ""`, `needs_review: true`), and sends `clara/upload.received`. The `clara-convert-upload` Inngest function downloads the file via the admin client, extracts Markdown in one step (PDF via `unpdf`'s `extractText`; DOCX via `mammoth.convertToHtml` piped through the existing `htmlToMarkdown` turndown helper — deliberately one step, not split download/convert, to avoid Inngest step-output size limits on the raw file bytes), writes the content back (`needs_review: false` on success, or a clear human-readable placeholder message + `needs_review: true` on failure — never crashes), deletes the Storage object either way, and on success chains into `clara-okf-enrich` the same way text Receives does. Capped at ~4.5MB (same server-action body limit Listens already established in `next.config.ts`). Verified end-to-end locally for both file types via a direct admin-client + `inngest.send` test (magic-link still rate-limited): generated real test files with macOS's built-in `textutil`/`cupsfilter`, confirmed correct Markdown extraction, confirmed the Storage object was deleted after processing, and confirmed OKF enrichment ran afterward and populated tags/participants correctly on both.

*   **Ask CLara Module A — embeddings pipeline (2026-08-03, shipped, verified end-to-end):** new `document_embeddings` table (`0008_document_embeddings.sql`, run against Supabase 2026-08-03, `vector(1536)` column, HNSW cosine index, RLS enabled with **zero** policies — deliberately unreachable from any browser client; only the admin/service-role client and, later, a `SECURITY DEFINER` retrieval function can touch it, same pattern as `0007`'s `get_stream_members`). New `clara-embed-document` Inngest function listens on the existing `clara/document.created` event (same event `okf-enrich` already listens on — fires after Receives text saves and after successful PDF/DOCX conversion, no changes needed to those code paths), chunks a document's Markdown via new pure helper `chunkText()` (`src/lib/embeddings/chunk-text.ts`, paragraph-aware, ~1200 chars/chunk with ~150 char overlap), embeds all chunks in one OpenAI call (new `embedTexts()` in `src/lib/openai/embed.ts`, model from `OPENAI_EMBEDDING_MODEL` / `getOpenAiEmbeddingModel()`, default `text-embedding-3-small`), and writes rows via `storeDocumentEmbeddings()` (`src/lib/embeddings/store-document-embeddings.ts`) which deletes-then-reinserts per `document_id` so re-runs/retries never duplicate chunks. Fails gracefully (skips, no throw/retry-loop) if `OPENAI_API_KEY` is unset or a document's content is empty — mirrors `okf-enrich.ts`'s posture exactly. **Known, deliberate scope limit:** editing a document's content later does not re-trigger embedding (matches existing behavior — edits don't re-trigger OKF enrich either, since `saveDocumentEdits` sends no Inngest event today). `npx tsc --noEmit` and `npx eslint` both pass clean on the new/changed files. **Verified end-to-end locally (2026-08-03):** ran `0008` in the Supabase SQL editor; real Receives "Add text" submit produced both `clara-okf-enrich` and `clara-embed-document` runs with status `Completed` in the Inngest dev dashboard; direct SQL read of `document_embeddings` for the new `document_id` showed a real chunk row with `vector_dims(embedding) = 1536` and matching content preview. Hit and fixed a local-dev-only networking gotcha along the way — see §3 "Local dev gotcha — stale background processes." Next session: build Module B (a `SECURITY DEFINER` `match_document_chunks` retrieval function + the actual `/ask` page, replacing its current `ComingSoon` stub).

*   **Ask CLara Module B — retrieval + `/ask` page (2026-08-03, shipped, verified end-to-end):** new `match_document_chunks(p_stream_id, p_query_embedding, p_match_count)` SECURITY DEFINER function (`0009_match_document_chunks.sql`, same pattern as `0007`'s `get_stream_members` — raises unless the caller is in `stream_members` for that stream, then joins `document_embeddings` → `documents` → `sessions`, filtered to that stream and to public docs or the caller's own private ones, ordered by cosine distance). New `searchCommons()` (`src/lib/embeddings/search-commons.ts`) embeds the question and calls that RPC via the normal **request-scoped** client (not admin — the function's own membership check is what makes that safe). New server action `askClara()` (`src/app/(app)/ask/actions.ts`) builds a numbered context block from the matched chunks and asks the chat model (existing `getOpenAiChatModel()`) to answer **only** from them, citing by number, or say plainly there isn't enough information — never falling back to outside knowledge. `/ask` (`src/app/(app)/ask/page.tsx`) now renders a real question box (`src/components/AskForm.tsx`, mirrors `ReceiveUploadForm.tsx`'s client-component shape) instead of the `ComingSoon` stub, with clickable source chips linking to `/sessions/documents/[id]`. `npx tsc --noEmit` and `npx eslint` both pass clean. **Verified end-to-end locally:** asked a question with no matching Commons content → got the honest "couldn't find anything" response, no hallucination; submitted a real reflection via Receives, asked a question specifically about its content → got an answer grounded in that reflection with a `[1]` citation, clicked the citation chip, landed on the correct document. Cross-stream isolation was **not** live-tested (only one stream is currently seeded) — reasoned through the function's membership guard instead; worth a real test once a second stream exists. Ask CLara is now functionally complete for v1 (not yet deployed to Vercel — migrations `0008`/`0009` still need to be run against prod Supabase, same as any other new migration).
*   **CLara Chatbot Module A — conversation engine (2026-08-04, shipped, verified end-to-end):** new `sendChatMessage()` server action (`src/app/(app)/chat/actions.ts`) with its own system prompt — a warm, curious reflective-conversation persona, explicitly told it has **no** access to the Commons or other participants' content, deliberately distinct from `askClara`'s grounded-retrieval prompt (no shared code/state between the two, per the "Chatbot ≠ Ask" rule). Conversation history is capped (last 20 messages, 4000 chars each) and lives only in client-side React state — nothing touches the database yet at this stage. New `ChatForm` client component (`src/components/ChatForm.tsx`) renders the conversation per `DESIGN_GUIDE.md`'s spec: user turns right-aligned, CLara turns in a `--paper` bubble with a small mono "CLARA" label. `/chat` (`src/app/(app)/chat/page.tsx`) now renders this instead of the `ComingSoon` stub. Hit and fixed one local-dev-only snag along the way: a 3-day-old stale `next-server` process (a leftover `next start` production build, same category of issue as the "Dev tooling fix" note above) was squatting on port 3000 and blocking the dev server — killed after confirming with the user, then `npm run dev` started clean. `npx tsc --noEmit` and `npx eslint` both pass clean. **Verified end-to-end locally (2026-08-04):** real multi-turn conversation in the browser — second reply correctly referenced the first turn's content, confirming conversation history is actually being sent back to the model each turn, not just the latest message.
*   **CLara Chatbot Module B — save to Commons (2026-08-04, shipped, verified end-to-end):** new `saveChatConversation()` server action, same file. Formats the full conversation as `**You:** ... / **CLara:** ...` Markdown and calls the existing `createDocument()` with `type: "Reflection"`, `privacyStatus: "private"`, and an auto-generated title (`Chat reflection — <date>`), then fires `clara/document.created` exactly like `receiveTextContent` does (best-effort, never blocks the save). **Product decision (confirmed with user):** one "Save conversation" button for the whole transcript (not per-message), and saved reflections default to **Private** — see `prd-v0.5.md` §5.1/§7.4 changelog for the reasoning. UI tracks whether the saved copy is stale (new messages sent since the last save) and shows "Save conversation to Commons" vs. "Saved ✓" + a link to the document accordingly. `npx tsc --noEmit` and `npx eslint` both pass clean. **Verified end-to-end locally:** saved a real test conversation, followed the "View saved reflection" link, confirmed the document has `Type: Reflection`, `Private`, the auto-generated title, and — without any new code on that side — the OKF enrichment job had *already* run and populated real proposed tags, proving the shared `clara/document.created` event correctly fans out to both Receives-originated and Chatbot-originated documents. (Left the one test document in the shared Supabase DB, flagged to the user as private/low-risk per the existing "not a separate dev database" caution above.)
*   **Knowledge Map Module A — schema + extraction pipeline (2026-08-04, shipped, verified end-to-end):** `0010_knowledge_map.sql` — `nodes` (`type`/`label`/`description`/`source_document_id`, unique per `(stream_id, lower(label))` so the same concept mentioned across documents merges into one row instead of duplicating) and `edges` (directed, unique per `(stream_id, source_node_id, target_node_id)`, re-extraction upserts the relationship label). RLS: members can `select` both, no insert/update/delete policies — same posture as `document_embeddings` (0008), all writes go through the admin client from the new `clara-extract-graph` Inngest function. **Deliberate scope decision (confirmed with user): extraction only ever runs on `privacy_status = 'public'` documents.** Nodes/edges have no per-node privacy field and the Knowledge Map has no manual approval gate before appearing (per `prd-v0.5.md` §6), so anything extracted is visible to the whole stream — a Private document (e.g. a saved Chatbot reflection) must never feed it. New `src/lib/graph/{types,extract-graph,upsert-graph}.ts`: `proposeGraph()` mirrors `okf-enrich.ts`'s structured-output pattern (same model, same truncation posture) to propose up to 6 entities (Atom/Concept/Framework/Theme) plus relationships between them; `upsertGraph()` does a manual find-or-insert per node (the expression unique index on `lower(label)` can't be targeted by postgrest's `upsert({onConflict})`, which only accepts plain column names) and falls back to re-reading on a unique-violation race rather than throwing. `clara-extract-graph` listens on the same `clara/document.created` event `okf-enrich` and `embed-document` already use — no changes needed to `receiveTextContent`, `convert-upload`, or `saveChatConversation`. `npx tsc --noEmit` and `npx eslint` both pass clean. **Verified end-to-end (2026-08-04)** via a direct admin-client + `inngest.send` test (same fallback pattern used for every prior Inngest-based module in this log): a real public reflection produced 5 correctly-typed nodes and 4 relational edges; a follow-up document mentioning the same concept reused the existing node (same id, not duplicated); a private reflection produced zero nodes. All test rows were deleted afterward — this Supabase project is the same one production Vercel uses, not a separate dev database (see the earlier "Unexplained" note below).
*   **Knowledge Map Module B — `/map` page (2026-08-04, shipped, verified end-to-end):** new `src/lib/graph/list-graph.ts` (plain RLS-scoped `select` on `nodes`/`edges`) and `src/lib/graph/layout.ts` (`computeGraphLayout()` — force-directed layout via the new `d3-force` dependency). New `src/components/KnowledgeMap.tsx` renders the layout as SVG per `DESIGN_GUIDE.md`'s "Knowledge Map" spec: dark `--forest-deep` canvas, nodes colored/sized by type (`--glow` Concept, `--horizon` Framework, `--ember` Theme, `--sage` Atom), a selected node gets a glow `drop-shadow`, edges animate via a new `km-edge-flow` CSS keyframe in `globals.css` (skipped when `prefers-reduced-motion` is set), click/Enter opens a slide-in detail panel with a link back to `/sessions/documents/[id]`. `/map` (`src/app/(app)/map/page.tsx`) replaces the `ComingSoon` stub, following the same empty-state card convention used on `/dashboard`/`/sessions`/`/admin`. **Hydration bug caught and fixed during verification:** the first implementation ran the d3-force simulation directly in a `useMemo` during render, reasoning that seeding every node's initial position deterministically (a circular layout by index, instead of letting d3-force fall back to `Math.random()`) made the whole computation a pure function of `(nodes, edges)` and therefore safe for SSR. In principle true, but in practice the simulation's 300 accumulated floating-point ticks landed on very slightly different values (differing past the 10th decimal place) between the server's Node/V8 process and the browser's V8 — a real hydration mismatch on every `<line>`/`transform` attribute, confirmed via the browser console. Fixed by gating the layout computation behind a `useSyncExternalStore`-based "has mounted past hydration" check (same escape-hatch pattern already used for reading `prefers-reduced-motion`, which legitimately differs server/client) — the server and first client render both show a "Laying out the map…" placeholder, and the real force-directed layout is only computed once safely past hydration. **Lesson: seeding out `Math.random()` does not make a multi-hundred-iteration floating-point simulation SSR-safe — floating-point arithmetic itself isn't guaranteed bit-identical across separate JS engine processes.** `npx tsc --noEmit` and `npx eslint` both pass clean (including the newer `react-hooks/set-state-in-effect` rule, which the first draft's naive `useEffect`+`setState` approach also violated). **Verified end-to-end in the browser (2026-08-04):** submitted a real reflection through the actual `/sessions` Receives UI (not a script) mentioning "Radical Candor," "Ladder of Inference," and "Camp Rhythms"; confirmed all three Inngest jobs ran (`clara-okf-enrich`, `clara-embed-document`, `clara-extract-graph`); `/map` rendered the resulting nodes/edges as a force-directed dark-canvas graph; clicked a node and confirmed the detail panel showed the correct type/label/description and its "View source document →" link landed on the correct document; reloaded with zero nodes and confirmed the empty-state card renders cleanly. The test document and its nodes/edges were deleted afterward (public content, would otherwise have stayed visible on the live map). **Known gap, not blocking v1:** `DESIGN_GUIDE.md`'s a11y note calls for full arrow-key spatial navigation between map nodes; v1 ships Tab/Enter only (nodes are focusable, Enter opens the detail panel) — flagged as a deferred v2 item, same "later" scoping already used for things like Listens v2.
*   **Note on tooling (2026-08-04):** the Browser-pane preview tool (`preview_start` with a `.claude/launch.json` name) failed with a sandbox-level `getcwd: cannot access parent directories: Operation not permitted` error when starting the dev server for this session — unrelated to any code change, and it persisted across retries. Worked around it by running `npm run dev` directly as a background shell process instead, then pointing the Browser pane at the already-running `http://localhost:3000` via `preview_start` with a plain `url` (which doesn't need to spawn anything itself). If this recurs, it's worth checking whether the app hosting the preview pane needs a permissions refresh/restart — it wasn't something fixable from within the repo.
*   **Unexplained: three Module-A test documents disappeared from the shared database (noticed 2026-08-03, cause unknown):** while verifying Module B, the three throwaway test documents created during Module A verification ("test 0731126", "test 2", "test 3") were gone — confirmed same project (`mwonasswpldsbiuylwkc`, byte-for-byte match against `.env.local`), `select count(*) from documents` had dropped back to 2 (both pre-dating this session). Neither of us deleted anything in either session. Low-stakes this time (only our own scratch test content, not real camp data), but flagging because **this Supabase project is not a separate dev database — it's the same one production Vercel uses**, and this is a multi-author repo (see the earlier "Note on concurrent work" entry above). If real Commons content ever disappears unexpectedly, treat it as a real incident, not a repeat of this note.

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

### Decisions that must survive the next session (2026-08-05)
*   **Phase 6 Modules B–F (2026-08-05, shipped in code):** Add routes `/add/chat|record|upload` (old `/chat` + `/sessions` hub redirect). Commons repository (`CommonsRepository` + pure `filterCommonsItems`) with type/date/attended/my-artifacts filters, sort, private eye icon. Minimizable `CommonsDetailPopup` loads document/session detail, DocumentEditor (`canEdit`), AttendanceToggle, `CommentThread`. Migration `0011_comments_and_attendee_edit.sql`: attendee UPDATE policy on documents, `comments` + `comment_edit_log`, `get_user_public_profiles`. Landing + dashboard copy use Add/Commons/Synthesis. **Manual test:** (1) Add menu → three pages work; (2) Commons filters + click opens popup; (3) Minimize/restore/close; (4) after `0011`, post/edit/delete comment + admin audit; (5) private doc shows eye to owner; (6) mobile hamburger still works.
*   **Nav labels:** Dashboard · Add · Commons · Synthesis · Admin. Dashboard unchanged for now. Admin stays top-level.
*   **Add children:** Chat (= `/chat` chatbot), Record (= Listens), Upload (= Receives including Add text).
*   **Synthesis children:** Ask CLara (`/ask`), Knowledge Map (`/map`). Routes can stay; nav nesting is the product change.
*   **Mobile:** hamburger; Add/Synthesis expand in-menu (not separate hub pages).
*   **Commons absorbs archive + attendance:** session list is part of Commons; open session → "I Attended" + comments. Old `/sessions` as the add-hub is retired once Add routes exist.
*   **Commons list content:** all chats/recordings/uploads unless Private (owner still sees own private + eye icon). Filters: element type, date, attended, my artifacts.
*   **Detail UX:** minimizable popup (minimize control top-right), not only full-page navigation.
*   **Edit who:** author, session attendees, stream admins.
*   **Comments:** on documents and sessions; name + avatar/initials + timestamp; author edit/delete; "edited" marker; admin-visible edit audit log (who/when).
*   **PRD naming:** Input/Output → Add/Synthesis in product docs (architecture flow unchanged).

### Next up (pick one module at a time)
1.  **Listens v2** (Storage + async Inngest) — only if long/full-meeting recordings become a real need.
2.  **Deploy** embeddings / graph migrations to Vercel prod Supabase if not already live.
3.  **Tune Ask cutoff** if 0.28 feels too strict/loose after real camp questions.

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
*   [x] Audio file via Receives (optional share Whisper) — shipped 2026-08-05 (sync Whisper, same cap as Listens v1)

### Phase 3 — Ask + Chatbot (separate)
*   [x] Ask CLara Module A — `document_embeddings` (pgvector) + `clara-embed-document` Inngest job — shipped + verified 2026-08-03
*   [x] Ask CLara Module B — retrieval function (`match_document_chunks`) + `/ask` page — shipped + verified 2026-08-03
*   [x] CLara Chatbot Module A — conversation engine + `/chat` UI — shipped + verified 2026-08-04
*   [x] CLara Chatbot Module B — "Save conversation to Commons" — shipped + verified 2026-08-04

**Phase 3 is complete as of 2026-08-04.**

### Phase 4 — Knowledge Map
*   [x] Module A — `nodes`/`edges` schema (`0010_knowledge_map.sql`) + `clara-extract-graph` Inngest job (public documents only, on the existing `clara/document.created` event)
*   [x] Module B — `/map` page: `d3-force` layout + dark-canvas SVG render (`DESIGN_GUIDE.md` spec), click-to-open detail panel with source-document link

**Phase 4 is complete as of 2026-08-04.**

### Phase 5 — Sessions archive, Harvest, Admin polish
*   [x] `sessions` table (event containers) — migration + RLS; documents keep a `session_id` FK instead of a free-text field
*   [x] Full session archive — `/sessions/archive` list + `/sessions/archive/[id]` detail page listing that session's Commons documents (reuse `DocumentList`)
*   [x] "I Attended" harvest — member marks sessions they attended; surface/export the Commons documents tied to those sessions for them (`/sessions/harvest`)
*   [x] Admin polish — membership edge cases (add/remove/promote `stream_members` by email, existing accounts only) + isolation toggle UI, both at `/admin` (§4.2 is no longer DB/RLS-only)

**Phase 5 is complete as of 2026-07-30.** Started ahead of Phase 3/4 by deliberate choice — Ask/Chatbot and Knowledge Map remain "later." Phase 2 is now fully done except optional audio-via-Receives.

### Phase 6 — Site IA: Add / Commons / Synthesis *(decided 2026-08-05)*

Build one module at a time; verify; update this Progress section; then continue.

*   [x] **Module A — App nav + mobile hamburger** — shipped 2026-08-05
*   [x] **Module B — Add page split** — `/add/chat`, `/add/record`, `/add/upload`; `/chat` and `/sessions` redirect; nav updated — shipped 2026-08-05
*   [x] **Module C — Commons repository list** — filterable/sortable multi-element list (docs + sessions); private eye icon; filters type/date/attended/my artifacts — shipped 2026-08-05
*   [x] **Module D — Minimizable detail popup** — click → popup with minimize; edit when author/attendee/admin (attendee RLS in `0011`); session popup includes "I Attended" — shipped 2026-08-05
*   [x] **Module E — Comments + audit log** — `0011_comments_and_attendee_edit.sql` + CommentThread; author edit/delete; "edited" marker; admin audit — shipped 2026-08-05 (**run migration in Supabase**)
*   [x] **Module F — Docs & landing copy** — landing triad Add/Commons/Synthesis; dashboard jump-in updated — shipped 2026-08-05

---

## 6. Cursor implementation guidelines
*   Server Components by default; `"use client"` for editor, upload, future recorder/map/chat.
*   Follow `DESIGN_GUIDE.md` v0.2 (CLara naming).
*   Fail AI/pipeline work gracefully; update this Progress section after meaningful sessions.
*   No secrets in git; flag risky territory (real transcripts, client data, credentials).
