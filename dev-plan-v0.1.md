# Camp CL/AI — Development & Implementation Plan

**Version:** 0.1
**Target Tool:** Cursor (AI Coding Assistant)
**Tech Stack:** Next.js (App Router), Supabase (PostgreSQL, Auth, pgvector, Storage), Vercel, Tailwind CSS.

---

## 1. Database Architecture (Supabase SQL)

The core structure relies on a relational setup combined with vector embeddings for RAG.

### 1.1 Core Tables
*   `users`: Managed via Supabase Auth. Extensions for `role` (Admin/User) and `organization`.
*   `documents`: The central repository for all Commons data.
    *   `id` (uuid)
    *   `content` (text - the raw markdown body)
    *   `title`, `session_id`, `type`, `participants` (jsonb), `tags` (jsonb array).
    *   `privacy_status` (enum: 'public', 'private')
    *   `needs_review` (boolean - flags missing OKF metadata)
    *   `created_at`, `updated_at`
*   `document_embeddings`: For RAG.
    *   `id`, `document_id` (fk), `chunk_content`, `embedding` (vector(1536)).
*   `nodes`: Representing Atoms, Concepts, Frameworks.
    *   `id`, `label`, `type`, `description`.
*   `edges`: Representing relationships for the Map View.
    *   `id`, `source_node_id`, `target_node_id`, `relationship_type`, `weight`.
*   `sessions`: High-level event containers.
    *   `id`, `title`, `date`, `host_id`.

---

## 2. Phase-by-Phase Build Plan

### Phase 1: Foundation & "Front Door"
1.  **Init Next.js Project:** Set up Next.js app router, Tailwind, and Shadcn UI components.
2.  **Supabase Auth:** 
    *   Implement Magic Link and OAuth (Google SSO).
    *   Configure Row Level Security (RLS) ensuring `privacy_status = 'public'` is readable by all authenticated users.
3.  **Landing Page:** Build the unauthenticated website front door conveying Context & Framing.
4.  **Dashboard Shell:** Basic authenticated layout with navigation (Sessions, Map, Chat).

### Phase 2: Ingestion Pipelines (The Inputs)
1.  **File Upload Flow:** Create UI to upload `.md`, `.txt`, `.mp3`/`.wav`.
2.  **Audio Processing Route:** Integrate OpenAI Whisper (or similar) API to convert uploaded audio to transcripts.
3.  **LLM Markdown Processing:** 
    *   Pass transcripts to an LLM (GPT-4o / Claude 3.5 Sonnet).
    *   Prompt the LLM to extract OKF headers (Title, Type, Session ID, Participants, Tags) and format as Markdown.
    *   Save to `documents` table. If OKF headers fail validation, set `needs_review = true`.

### Phase 3: RAG & The CLara Brain (The Chat)
1.  **Vectorization Pipeline:** Trigger a Supabase Edge Function on new `documents` inserts to chunk the markdown and generate embeddings via OpenAI `text-embedding-3-small`. Save to `document_embeddings`.
2.  **Chat Interface:** Build a conversational UI.
3.  **RAG Querying:** When a user asks a question, embed the query, perform vector similarity search on `document_embeddings`, and pass the context to CLara.
4.  **Prompt Editing:** Add a UI toggle allowing users to view/edit CLara's system prompt.

### Phase 4: Dynamic Graph & Map View
1.  **Entity Extraction:** During Phase 2 LLM processing, prompt the LLM to identify Atoms, Concepts, and links. Insert these into `nodes` and `edges` tables.
2.  **Map UI:** Implement a graph visualization library (e.g., `react-force-graph` or `vis-network`).
3.  **Filtering:** Add toggles to view the graph clustered by Themes vs. Chronological generation.

### Phase 5: Sessions & Polish
1.  **Explore Sessions View:** List view of all sessions, clicking into one shows the full transcript, summary, and attended participants.
2.  **"I Attended" Harvest:** Add button to sessions that generates a pre-filled harvest prompt reflecting on that specific session.
3.  **Admin Queue UI:** A simple data table view for Admins to fix metadata on files where `needs_review = true`.

---

## 3. Cursor Implementation Guidelines
*   **Component Structure:** Use server components by default. Use `"use client"` only for interactive pieces (Chat UI, Map Visualization, Audio Recorder).
*   **Styling:** Adhere to a calm, spacious design principle (muted colors, clear typography) reflecting CL's brand.
*   **Resilience:** All AI calls (transcription, summarization, extraction) must have try/catch blocks and fail gracefully without crashing the UI.
