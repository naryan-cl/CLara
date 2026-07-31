# CLara Platform — Development & Implementation Plan

**Version:** 0.3  
**Last updated:** 2026-07-30 (Google SSO + email/password auth)  
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
| Listens (audio) | Next / soon |
| Chatbot / Ask / Map | Later |
| OKF LLM enrich (Inngest) | Next recommended |
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
| Env template | `.env.example` |

### Inngest
*   App id in code: `clara`
*   Smoke event: `clara/hello` → function `clara-hello`
*   Prod sync URL: `https://clara-cl.vercel.app/api/inngest`
*   Package: `inngest@^4` (Festival-style `triggers: [{ event }]`)

---

## 4. Progress & Decisions (living log)

### Current phase
*   **Phase 2 (Receives) — text path done.** Next: OKF LLM enrich via Inngest, and/or PDF·DOCX, and/or Listens.

### Shipped
*   Phase 1 shell: Next.js + Supabase auth + app routes + CLara branding.
*   Login: Google OAuth + email/password (sign-in / create account); magic link removed (`src/app/login/page.tsx`).
*   Streams + membership + active stream UI.
*   Vercel + OpenAI + Inngest keys; hello job verified.
*   `documents` Commons + dashboard/sessions recent lists.
*   Receives Upload / Add text; TipTap toolbar; Markdown storage; view/edit.
*   Public repo secrets policy (`.cursorrules` / `claude.md` / README / `.gitignore`).

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

### Reference projects
*   **Festival** — `C:\Users\narya\OneDrive\Documents\WEAll Can\Festival` — Inngest, Ask/RAG, graph, embeddings, PDF/DOCX convert (`unpdf` / markitdown).
*   **Old Clara** — `C:\Users\narya\OneDrive\Documents\GitHub\Old Clara` — Listens recorder, Whisper, chunked upload, privacy gates.

### Next up (pick one module at a time)
1.  **Inngest OKF enrich** on new `documents` (set/clear `needs_review`) — recommended.
2.  **PDF + DOCX → Markdown** Receives (queue via Inngest; then same view/edit).
3.  **CLara Listens** (port Old Clara mic + optional display-audio mix → Whisper → document).
4.  **Admin Queue** UI for `needs_review`.
5.  Embeddings + **Ask CLara** (stream-scoped RAG).
6.  Unblock: Supabase owner sets Auth URLs for `https://clara-cl.vercel.app` (+ `/auth/callback`).

### Blocked / open
*   Supabase Auth URL config for production (Google redirect) — needs **owner** access.
*   Google provider must be enabled in Supabase with Client ID/Secret; Email provider must allow password sign-in.
*   Vercel Hobby previously blocked non-owner commit authors on **private** repos — mitigated by going public; Pro or commit-as-`naryan-cl` if made private again.
*   Local git push from some agents may lack GitHub auth — use GitHub Desktop / logged-in CLI.

---

## 5. Phase plan (remaining)

### Phase 2 (finish ingestion)
*   [x] Text Receives + documents CRUD UI  
*   [ ] OKF LLM enrich (Inngest)  
*   [ ] PDF/DOCX convert  
*   [ ] Listens + Whisper  
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
