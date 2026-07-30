# CLara Platform — Development & Implementation Plan

**Version:** 0.3  
**Last updated:** 2026-07-30 (Listens v1 shipped)  
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
| Chatbot / Ask / Map | Later |
| PDF/DOCX → Markdown | Planned after text Receives |

---

## 2. Database (applied / pending)

### Applied (run in Supabase SQL editor if a fresh env)
*   `0001_streams.sql` — `streams`, `stream_members`, RLS, seed Camp CLAI
*   `0002_naryan_camp_clai_admin.sql` — admin membership for `naryan@cultivatingleadership.com`
*   `0003_documents.sql` — `documents` + privacy enum + RLS (member read public; author read/update; member insert; stream admin update)

### Not yet migrated
*   `document_embeddings`, `nodes`, `edges`, `sessions` (event containers) — see prior §1.2 plan in v0.2 history / PRD

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
| Env template | `.env.example` |

### Inngest
*   App id in code: `clara`
*   Smoke event: `clara/hello` → function `clara-hello`
*   OKF enrich event: `clara/document.created` → function `clara-okf-enrich` (sent from `receiveTextContent` after a successful create; best-effort, never blocks the user's Receive)
*   Prod sync URL: `https://clara-cl.vercel.app/api/inngest`
*   Package: `inngest@^4` (Festival-style `triggers: [{ event }]`)
*   **Local dev gotcha:** `/api/inngest` defaults to assuming production/cloud mode and 500s against the local Inngest CLI dev server ("no signing key found") unless `INNGEST_DEV=1` is set in `.env.local`. Do not set this in Vercel.

---

## 4. Progress & Decisions (living log)

### Current phase
*   **Phase 2 (Receives + OKF enrich + Listens v1) — text path, LLM enrichment, and mic-recording input all built.** Next: PDF·DOCX, or Admin Queue, or Ask CLara embeddings.

### Shipped
*   Phase 1 shell: Next.js + Supabase auth + app routes + CLara branding.
*   Streams + membership + active stream UI.
*   Vercel + OpenAI + Inngest keys; hello job verified.
*   `documents` Commons + dashboard/sessions recent lists.
*   Receives Upload / Add text; TipTap toolbar; Markdown storage; view/edit.
*   Public repo secrets policy (`.cursorrules` / `claude.md` / README / `.gitignore`).
*   Production Auth URL config (Site URL + `/auth/callback` redirect for `clara-cl.vercel.app`) — Magic Link confirmed working in prod.
*   **OKF LLM enrichment (Inngest):** on `clara/document.created`, `clara-okf-enrich` fetches the doc via the new admin (service) client, asks OpenAI (`gpt-4o-mini`, structured JSON output) to propose tags / participants / session id, writes them back only if not already set (never clobbers manual edits), and sets `needs_review = !confident`. Fails gracefully (skips, doesn't retry-loop) if `OPENAI_API_KEY` isn't configured. Verified end-to-end locally via a direct admin-client + `inngest.send` test (magic-link email was rate-limited at test time) — tags/participants/session_id all extracted correctly from a sample reflection.
*   **CLara Listens v1 (2026-07-30):** browser mic recording (`MediaRecorder`, mono, 32kbps opus/mp4) → `receiveListensRecording` Server Action → OpenAI Whisper (`transcribeAudio`) → `createDocument({ type: "Transcript" })`, same table/RLS Receives uses. **Deliberately synchronous, no Storage bucket, no Inngest job** — the audio blob never persists, only the transcript text. This caps usable recordings at roughly 15 minutes (~4MB at the recorded bitrate, staying under Vercel's ~4.5MB serverless request-body limit) — fine for a reflection, not a full meeting. Required raising `next.config.ts`'s `experimental.serverActions.bodySizeLimit` from Next's 1MB default to `"5mb"`. Verified end-to-end by the user locally (real mic recording → transcript → document appeared correctly).

### Security incident — resolved (2026-07-29)
*   Real Supabase `anon` and `service_role` **JWT** keys were committed to `.env.example` (commit `8b472fb`) and pushed to this public repo for ~25 min before being caught.
*   **Fix:** legacy JWT-based Supabase API keys were **disabled entirely** in the dashboard (Project Settings → API Keys → Legacy API Keys → "Disable JWT-based API keys"). This project now runs on the newer Publishable/Secret key system only — no JWT secret rotation was available/needed once disabled.
*   Vercel's `NEXT_PUBLIC_SUPABASE_ANON_KEY` was updated to the publishable key (`sb_publishable_...`) and redeployed *before* disabling the legacy keys, so production had zero downtime.
*   `.env.example` restored to placeholders only; added an explicit incident note there so this isn't repeated.
*   **Takeaway:** never paste real values into `.env.example` — only into `.env.local` (gitignored) or Vercel's env var UI.

### Decisions (must remember)
*   CLara platform; Camp CLAI first stream; isolation **true**.
*   Chatbot ≠ Ask (no shared RAG/prompt state).
*   Auth is platform-level.
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
1.  **PDF + DOCX → Markdown** Receives (queue via Inngest; then same view/edit).
2.  **Admin Queue** UI for `needs_review`.
3.  Embeddings + **Ask CLara** (stream-scoped RAG).
4.  **Listens v2** (Storage bucket + async Inngest transcription) — only if long/full-meeting recordings become a real need; v1 already covers short reflections.

### Blocked / open
*   Vercel Hobby previously blocked non-owner commit authors on **private** repos — mitigated by going public; Pro or commit-as-`naryan-cl` if made private again.
*   Local git push from some agents may lack GitHub auth — use GitHub Desktop / logged-in CLI.
*   Supabase's default email provider rate-limits Magic Link sends fairly aggressively (hit during this session's testing) — fine for dev, but production should get a custom SMTP provider configured before real camp usage.

---

## 5. Phase plan (remaining)

### Phase 2 (finish ingestion)
*   [x] Text Receives + documents CRUD UI  
*   [x] OKF LLM enrich (Inngest)  
*   [ ] PDF/DOCX convert  
*   [x] Listens + Whisper (v1 — short recordings, sync; long/chunked is a later phase)  
*   [ ] Audio file via Receives (optional share Whisper)

### Phase 3 — Ask + Chatbot (separate)  
### Phase 4 — Knowledge Map  
### Phase 5 — Sessions archive, Harvest, Admin polish  

---

## 6. Cursor implementation guidelines
*   Server Components by default; `"use client"` for editor, upload, future recorder/map/chat.
*   Follow `DESIGN_GUIDE.md` v0.2 (CLara naming).
*   Fail AI/pipeline work gracefully; update this Progress section after meaningful sessions.
*   No secrets in git; flag risky territory (real transcripts, client data, credentials).
