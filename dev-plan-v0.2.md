# CLara Platform — Development & Implementation Plan

**Version:** 0.2  
**Target Tool:** Cursor (AI Coding Assistant)  
**Tech Stack:** Next.js (App Router), Supabase (PostgreSQL, Auth, pgvector, Storage), Vercel, Tailwind CSS.  
**Companion PRD:** `prd-v0.4.md`  
**Supersedes:** `dev-plan-v0.1.md`

---

## 0. Product framing (read first)

*   **Product:** CLara platform  
*   **First stream:** Camp CLAI  
*   **Architecture lens:** Input → Commons → Output (does not replace UI surfaces)  
*   **V1 must include multi-stream plumbing** even if only Camp CLAI is populated

| Lens | Features |
| :--- | :--- |
| **Input** | CLara Chatbot · CLara Listens (mic and/or audio stream) · CLara Receives (uploads) |
| **Commons** | Structured DB · `.md` + OKF (Open Knowledge Format) metadata · stream-scoped |
| **Output** | Ask CLara · Knowledge Map |
| **Surfaces (keep)** | Dashboard · Sessions · Harvest · Chatbot · Ask CLara · Map · Admin Queue |

**Separation rule:** CLara Chatbot (input/contribute) and Ask CLara (output/query) are **separate surfaces** so contribution and retrieval do not contaminate each other.

---

## 1. Database Architecture (Supabase SQL)

Relational data + vector embeddings for RAG. **Every commons artifact is stream-scoped.**

### 1.1 Streams & membership
*   `streams`:
    *   `id` (uuid)
    *   `slug` (text, unique — e.g. `camp-clai`)
    *   `name` (text — e.g. `Camp CLAI`)
    *   `isolation_enabled` (boolean — when true, Commons is not visible/queryable from other streams)
    *   `created_at`, `updated_at`
*   `stream_members`:
    *   `stream_id`, `user_id`, `role` (e.g. `admin`, `member`)
    *   Unique on (`stream_id`, `user_id`)

### 1.2 Core Tables
*   `users`: Managed via Supabase Auth. Extensions for platform `role` (Admin/User) and `organization`.
*   `documents`: Central repository for Commons data (always belongs to one stream).
    *   `id` (uuid)
    *   `stream_id` (fk → `streams`, required)
    *   `content` (text — raw markdown body)
    *   `title`, `session_id`, `type`, `participants` (jsonb), `tags` (jsonb array)
    *   `privacy_status` (enum: `public`, `private`)
    *   `needs_review` (boolean — missing OKF metadata)
    *   `created_at`, `updated_at`
*   `document_embeddings`: For RAG.
    *   `id`, `document_id` (fk), `stream_id` (denormalized for isolation-safe queries), `chunk_content`, `embedding` (vector(1536))
*   `nodes`: Atoms, Concepts, Frameworks.
    *   `id`, `stream_id`, `label`, `type`, `description`
*   `edges`: Relationships for the Map View.
    *   `id`, `stream_id`, `source_node_id`, `target_node_id`, `relationship_type`, `weight`
*   `sessions`: High-level event containers within a stream.
    *   `id`, `stream_id`, `title`, `date`, `host_id`

### 1.3 Isolation & RLS (why this matters)
When `streams.isolation_enabled = true`, Row Level Security and query helpers must ensure:
*   Reads/writes of `documents`, embeddings, `nodes`, `edges`, and `sessions` stay inside that stream for members.
*   **Ask CLara** similarity search filters by `stream_id` (and never crosses into isolated streams).
*   Cross-stream behavior when isolation is off can be refined later; V1 must correctly **enforce isolation when on**.

Seed V1 with at least one stream row: **Camp CLAI** (`slug: camp-clai`), `isolation_enabled = true` (decided — see Progress & Decisions).

---

## 2. Phase-by-Phase Build Plan

### Phase 1: Foundation, Auth & Stream Shell
1.  **Init Next.js Project:** App Router, Tailwind, and Shadcn UI.
2.  **Supabase Auth (platform-level):**
    *   Magic Link and OAuth (Google SSO).
    *   RLS: authenticated users only see Commons data for streams they belong to; respect `privacy_status` and isolation.
3.  **Streams schema:** Create `streams` + `stream_members`; seed Camp CLAI; wire `stream_id` through subsequent tables.
4.  **Landing Page:** Unauthenticated **CLara** front door (platform framing).
5.  **Dashboard Shell:** Authenticated layout with active-stream context and nav (Sessions, Map, Chatbot, Ask CLara, Admin).

### Phase 2: Ingestion Pipelines (Inputs)
1.  **CLara Receives — File Upload:** UI for `.md`, `.txt`, `.mp3`/`.wav` (and agreed formats), always tagged with active `stream_id`.
2.  **CLara Listens — Audio capture:**
    *   **Mic path** (including mobile device mic).
    *   **Audio stream path** (desktop): capture system/meeting audio where the browser allows (Zoom/Meet/Teams listening mode).
3.  **Audio Processing Route:** Whisper (or similar) → transcript.
4.  **LLM Markdown + OKF Processing:**
    *   Pass transcripts to an LLM (GPT-4o / Claude).
    *   Extract OKF headers (Title, Type, Session ID, Participants, Tags, Stream context) and format as Markdown.
    *   Save to `documents`. If OKF validation fails, set `needs_review = true`.

### Phase 3: Ask CLara & CLara Chatbot (separate surfaces)
1.  **Vectorization Pipeline:** On new `documents`, chunk markdown, embed via OpenAI `text-embedding-3-small`, save to `document_embeddings` **with `stream_id`**.
2.  **CLara Chatbot (Input UI):** Conversational contribute/reflect UI; persist eligible turns into the Commons for the active stream.
3.  **Ask CLara (Output UI):** Separate query UI. Embed the question → vector search **scoped to active stream** (and isolation rules) → answer with RAG context only from that Commons.
4.  **Prompt Editing:** Per-surface toggle to view/edit system prompts (Chatbot vs Ask stay distinct).

### Phase 4: Dynamic Graph & Knowledge Map
1.  **Entity Extraction:** During Phase 2 LLM processing, extract Atoms, Concepts, links → `nodes` / `edges` with `stream_id`.
2.  **Map UI:** Graph library (e.g. `react-force-graph` or `vis-network`), filtered to active stream.
3.  **Filtering:** Themes vs chronological; node click can open **Ask CLara** about that node.

### Phase 5: Sessions, Harvest & Admin Polish
1.  **Explore Sessions View:** List sessions in the active stream; detail shows transcript, summary, participants.
2.  **"I Attended" Harvest:** Pre-filled harvest prompt for that session.
3.  **Admin Queue UI:** Table of `needs_review` documents; fix OKF metadata.
4.  **Stream admin:** Toggle `isolation_enabled`; manage membership edge cases.

---

## 3. Cursor Implementation Guidelines
*   **Component Structure:** Server components by default. `"use client"` only for interactive pieces (Chatbot, Ask CLara, Map, CLara Listens recorder).
*   **Styling:** Calm, spacious design reflecting CL's brand (see `DESIGN_GUIDE.md` v0.2 — CLara naming).
*   **Resilience:** All AI calls (transcription, summarization, extraction) use try/catch and fail gracefully without crashing the UI.
*   **Stream context:** Never write Commons data without an explicit `stream_id`. Prefer a single active-stream context provider in the authenticated shell.
*   **No contamination:** Do not reuse the same RAG pipeline prompt/UI state between Chatbot (input) and Ask CLara (output).

---

## 4. Progress & Decisions (living log)

Update this section at the end of meaningful work sessions so the next session (human or AI) does not depend on chat memory.

### Current phase
*   **Phase 1 — in progress:** Active-stream helper (`getActiveStream`) wires layout + dashboard to DB. Auth shell + Inngest smoke test done.

### Shipped
*   Streams schema migration: `supabase/migrations/0001_streams.sql` (`streams`, `stream_members`, RLS for membership read).
*   Seed stream: Camp CLAI (`slug: camp-clai`).
*   `src/lib/streams/get-active-stream.ts` — prefers `camp-clai`; nav badge + dashboard title from DB (or “No stream” banner if not a member).
*   Migration `0002_naryan_camp_clai_admin.sql` — adds `naryan@cultivatingleadership.com` as Camp CLAI admin (must be applied in Supabase SQL editor / migration runner).
*   Migration `0003_documents.sql` — Commons `documents` table + RLS; dashboard lists recent docs via `listRecentDocuments`.
*   CLara Receives (text): `ReceiveUploadForm` + `receiveTextFile` server action → `createDocument` with active `stream_id`.

### Decisions to remember
*   Product name: **CLara**; first stream: **Camp CLAI**.
*   Camp CLAI **`isolation_enabled = true`** by default.
*   Chatbot (input) and Ask CLara (output) remain separate surfaces/pipelines.
*   Auth is platform-level (CLara), not Camp-CLAI-only.
*   OKF = Open Knowledge Format (same header fields + stream scoping).
*   GitHub repo is **public while building** (Vercel Hobby multi-author deploys). Secrets stay in Vercel / `.env.local` only — never in git. Revisit visibility before client/production content hardens.

### Reference projects (do not copy wholesale)
*   **Festival** — `C:\Users\narya\OneDrive\Documents\WEAll Can\Festival`  
    Port patterns for: Inngest (`lib/inngest/*`, `/api/inngest`), Ask/RAG (`lib/harvest/ask.ts`), knowledge graph pipeline (`lib/ai/pipeline.ts`, harvest graph), embeddings (`lib/ai/embeddings.ts`), env example + enqueue-with-direct-fallback.  
    Skip: Stripe, Resend CRM, Fireflies-as-only-STT, festival-wide unscoped Ask, social network graph.
*   **Old Clara** — `C:\Users\narya\OneDrive\Documents\GitHub\Old Clara`  
    Port patterns for: CLara Listens — `audio-recorder.tsx` (mic + optional `getDisplayMedia` mix), chunked MediaRecorder, `lib/transcription/whisper.ts`, privacy (`save_audio` gate).  
    Redesign toward stream-scoped Commons + OKF docs (not live workshop synthesis / join-code participants).

### Shipped (infra)
*   `.env.example` — Festival-shaped template (Supabase, OpenAI, Inngest, app URL). `.gitignore` allows committing the example only.
*   Vercel deploy live: **https://clara-cl.vercel.app/**
*   `OPENAI_API_KEY` (+ embedding/transcription model vars) added to Vercel.
*   Inngest keys added to Vercel; scaffold: `src/lib/inngest/*`, `/api/inngest`, `/api/inngest/health`, hello event `clara/hello`, app id `clara`, package `inngest@^4`.
*   Inngest production sync verified against `https://clara-cl.vercel.app/api/inngest`; `clara/hello` triggered successfully (separate from Old Clara’s Inngest app).

### Next up
*   Test CLara Receives: Sessions → upload a small `.md`/`.txt` → see it under Recent + Dashboard activity.
*   Then: audio path (CLara Listens) or OKF LLM enrichment — pick one module at a time.
*   Owner: Supabase Auth URLs for production (still blocked without owner access).

### Blocked / open
*   Supabase Auth Site URL + redirect allow list for `https://clara-cl.vercel.app` — needs project **owner** access (current user cannot change). Localhost may still work; production Magic Link may fail until an owner updates Auth → URL Configuration.
