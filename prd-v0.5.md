# CLara Platform — Product Requirements Document (PRD)

**Version:** 0.5  
**Owner:** Ali / Naryan  
**Status:** Living — implementation in progress  
**Last updated:** 2026-08-06 (Add · Reflect + Session Composer)  
**Target Audience:** AI Coding Assistants (Cursor) and Engineering Team  
**Supersedes:** `prd-v0.4.md`

---

## 0. Changelog (0.4 → 0.5)

*   Documented **CLara Receives** UX: Upload vs Add text (mutually exclusive); rich-text editing that **stores Markdown**.
*   Documented **view/edit** for Commons documents after receive.
*   OKF enrichment strategy: minimal form fields now; **LLM + Inngest** for Session / Tags / Participants later; `needs_review` if incomplete.
*   Planned Receives expansion: **PDF + DOCX → Markdown** (after text path is solid); old `.doc` lower priority.
*   Confirmed infra: Vercel production URL, public GitHub while building, Inngest separate from Old Clara.

### Progress since 0.5 (no version bump — see `dev-plan-v0.3.md` §4 for full detail)
*   **Auth methods changed**: Google SSO + email/password replace Magic Link (rate-limit issues on Supabase's default email provider made Magic Link impractical for active dev/testing) — see §3.1.
*   **OKF LLM enrichment** shipped: Session/Tags/Participants are proposed automatically (Inngest + OpenAI) on every new Commons document; `needs_review` now reflects extraction confidence, not just missing form fields — see §5.2.
*   **CLara Listens v1** shipped: mic recording → Whisper → Commons document (short recordings, synchronous, no Storage bucket by design) — see §5.1.
*   **CLara Listens v2 Module A (2026-08-06):** browser uploads audio to private `listens-staging` Storage; Inngest `clara-transcribe-recording` runs Whisper async; soft ~60 min / Whisper 25MB cap. Chunked multi-part upload = Module B later. Apply migration `0014_listens_staging_storage.sql`.
*   **CLara Listens v2 Module B (2026-08-06):** ~12-min MediaRecorder restarts; segments upload during the take; Inngest Whispers each and joins text (~3 hour soft cap). Same idea as Old Clara text-join, no permanent audio retention.
*   **PDF/DOCX Receives** shipped: async Storage + Inngest conversion path alongside the text path — see §5.1.
*   **Sessions are now first-class**: a real `sessions` table backs `Session_ID` (previously free text) — see §5.2.
*   **Full session archive + "I Attended" harvest** shipped — see §7.2 (previously "later").
*   **Admin surface** shipped: `/admin` now covers the `needs_review` metadata queue, membership management (add/remove/promote existing accounts by email), and the isolation toggle, all gated to stream admins — see §3.2, §4.2, §7.5 (previously "later" / DB-only).
*   **Ask CLara** shipped: RAG over the stream Commons (pgvector embeddings + retrieval function + grounded chat with source citations) — see §5.3 (previously "later").
*   **CLara Chatbot** shipped: open reflective conversation, separate pipeline from Ask CLara, with an explicit "Save conversation to Commons" action — see §5.1, §7.4. **Product decision:** a saved conversation defaults to **Private** (author-only), diverging from §1's general "Commons is open by default" framing — Chatbot content is personal reflection, not a session transcript, so the participant opts in to making it visible to the stream rather than opting out.
*   **Knowledge Map** shipped: stream-scoped `nodes`/`edges` (Atom/Concept/Framework/Theme) automatically extracted from Commons content, rendered as an interactive force-directed graph at `/map` — see §5.3, §6, §7.3 (previously "later"). **Product decision:** extraction only ever runs on **Public** documents — nodes/edges carry no per-node privacy field and the map has no manual approval gate before appearing, so a private document (e.g. a saved Chatbot reflection) must never feed it. **Keyboard:** Tab into nodes, **arrow keys** move spatially between nodes, Enter/Space opens the detail panel, Escape closes (shipped 2026-08-05; closes the former v1 Tab/Enter-only gap).
*   **Site IA restructure decided (2026-08-05, not yet built):** primary navigation becomes **Dashboard · Add · Commons · Synthesis · Admin**. Architecture lens renamed **Add → Commons → Synthesis** (was Input → Commons → Output). **Add** nests Chat / Record / Upload; **Synthesis** nests Ask CLara / Knowledge Map; **Commons** becomes the filterable/sortable repository of chats, recordings, uploads, and sessions (archive + "I Attended" woven in). Detail opens as a **popup** (minimize removed 2026-08-06). **Comments** on all Commons elements (author name + avatar/initials + timestamp; author can edit/delete; "edited" marker; admin-visible edit audit log). **Edit** of an element: author, session attendees, and stream admins only. Private items stay visible to their owner with an **eye icon**; filters include element type, date, attended, my artifacts. Mobile: **hamburger** with expandable Add/Synthesis sub-menus. Dashboard stays as-is for now. See §2, §5, §7 and `dev-plan-v0.3.md` Phase 6.
*   **Site IA Phase 6 shipped in code (2026-08-05):** nav + Add routes + Commons repository/popup/comments implemented. Apply Supabase migration `0011_comments_and_attendee_edit.sql` before comments and attendee-edit work against the shared database.
*   **Add · Reflect + Session Composer (2026-08-06):** Nav label **Chat → Reflect**. Reflect page (`/add/chat`) uses shared **Session Composer** (connect 1–3 sessions, create group reflection = create a **session** with optional seed question/description, share link `/join/[token]` + QR, participant autocomplete from stream peers). Each Reflect conversation remains its **own** `documents` Reflection row linked via `document_sessions` (never merged into one session body). **Private** reflections stay off the public Commons list and Knowledge Map, but **session attendees + stream admins can read** them. Autosave drafts + Submit (after ~2 exchanges) with thank-you / flower placeholder (map flowers = later). Same Session Composer on Record and Upload. Apply migration **`0012_session_composer.sql`**.

---

## 1. Vision & The "Commons" Paradigm

**CLara** is a platform for capturing, structuring, and exploring collective thinking. It is built by Cultivating Leadership (CL) for contexts that explore AI through adult development, complexity, and leadership.

**Camp CLAI** is one **stream** (domain) on the CLara platform — a residential/virtual learning event whose insight often evaporates after live sessions. CLara is the shared brain that holds that thinking. Other streams (e.g. Other Thinking Gyms, Client Development Zone) use the same platform plumbing with their own Commons.

**The Commons Paradigm:**  
Unlike standard chat interfaces where threads are private, **all conversations, transcripts, and generated concepts are shared to that stream's Commons by default** (similar to public Slack channels). Participants can opt out or restrict visibility, but the default state is open, visible, and collaborative.

---

## 2. Terminology

| Term | Meaning |
| :--- | :--- |
| **CLara** | The platform (product name). |
| **Stream** | A domain or instance on the platform (e.g. Camp CLAI). Each stream has its own Commons, surfaces, and membership. |
| **Commons** | The shared knowledge store for a stream: structured database records + Markdown body with OKF metadata. Also the primary UI repository that lists chats, recordings, uploads, and sessions (filterable/sortable). |
| **Add → Commons → Synthesis** | The primary architecture lens for how thinking moves through the system (formerly **Input → Commons → Output**). Same flow; friendlier product labels. |
| **Add** | Contribution surfaces: **Reflect** (CLara Chatbot), **Record** (Listens), **Upload** (Receives — file upload + Add text). |
| **Synthesis** | Meaning-making surfaces: **Ask CLara** and **Knowledge Map**. |
| **OKF** | Open Knowledge Format — standardized metadata on every Commons document (UI label for document kind is just **Type**, not “OKF type”). |
| **Receives** | Add path for files / typed notes into the Commons (vs Listens for live audio). Product nav label is **Upload**. |
| **Listens** | Add path for live audio → transcript. Product nav label is **Record**. |

---

## 3. Users, Auth & Access ("The Front Door")

### 3.1 Platform Authentication
*   Auth is for the **CLara platform**, not a single stream.
*   **Unauthenticated State:** Users arriving at the website see a CLara landing page (context & framing).
*   **Sign-in:** Login with CL Account via **Google SSO** or **email + password** (no magic link).
*   **Access Control:** Primarily CL email domains; admin exception list for externals (as configured).
*   **Stream membership:** After login, Commons access depends on `stream_members` (+ isolation).

### 3.2 Roles
*   **member** — contribute and explore within streams they belong to.
*   **admin** (per stream) — membership edge cases, metadata / `needs_review` queue, isolation settings.

**Production note:** Supabase Auth Site URL / redirect allow list for `https://clara-cl.vercel.app` may still need a project **owner** to configure (needed for Google OAuth redirect). Email+password works without that redirect allow list once Email provider is enabled.

*Changelog (2026-07-30): Auth methods updated — Google SSO + email/password; magic link removed.*

---

## 4. Streams

Streams are first-class in V1. Multi-stream plumbing is required even if only Camp CLAI is populated.

### 4.1 Planned / Example Streams
*   **Camp CLAI** (primary V1 stream; `slug: camp-clai`; **`isolation_enabled = true`**)
*   **Other Thinking Gyms**
*   **Client Development Zone**

### 4.2 Isolation Toggle
*   **On:** Commons not visible/queryable from other streams.
*   **Off:** Cross-stream discoverability later; V1 must enforce isolation when on.
*   **UI** *(Shipped)*: stream admins flip this from `/admin`, not just the database — see §7.5.

---

## 5. Architecture — Add → Commons → Synthesis

```
  ADD                           COMMONS                        SYNTHESIS
  ───                           ───────                        ─────────
  Chat (CLara Chatbot)   →   Structured database      →   Ask CLara
  Record (Listens)       →   Markdown + OKF metadata →   Knowledge Map
  Upload (Receives)      ↗   + sessions, comments,
                             privacy, filters
```

*(Formerly labeled Input → Commons → Output — same architecture, renamed 2026-08-05.)*

### 5.1 Add (contribution)

1.  **Reflect** (`/add/chat`, nav label Reflect; legacy `/chat` redirects) — *(Shipped; Reflect UX 2026-08-06.)* Solo, reflective conversation with CLara; separate pipeline from Ask CLara (no shared prompt, no Commons retrieval). **Session Composer** above the chat: connect to 1–3 existing sessions and/or **Create group reflection** (creates a first-class **session** with optional seed question). Seed questions appear as opening CLara messages. Conversation **autosaves** as a draft Reflection; after ~2 user↔CLara exchanges, **Submit** finalizes, shows thank-you + flower placeholder, then returns to the dashboard. **Private by default** (checkbox); private docs are hidden from public Commons / map but readable by **session attendees and stream admins**. Each person's reflection is its own document, linked to session(s) — not appended into a shared session Markdown body. Share/join via `/join/[token]`.
2.  **Record** (Listens) — *(Shipped v1 + v2 Module A/B.)* Browser mic (+ optional system/tab audio) → private `listens-staging` → ~12-min chunk uploads during long takes → async Whisper (Inngest joins segment text) → Commons `Transcript`. Soft ~3 hour cap. Same **Session Composer** as Reflect. Mobile = device mic.
3.  **Upload** (Receives) — bring existing text/files into the Commons; same **Session Composer** as Reflect/Record.
    *   **Upload** — `.md` / `.txt` (synchronous) **or** `.pdf` / `.docx` *(Shipped)* (async — converts via Storage + Inngest, ~4.5MB cap).
    *   **Add text** — rich-text editor (formatting visible; **stored as Markdown**); lives under Upload (not a fourth Add nav item).
    *   Upload and Add text are **mutually exclusive** on one submit (not both).
    *   After save: **view** formatted Markdown; **edit** with the same rich toolbar (Bold, Italic, Underline, Header, Subhead, Bullets, Numbered, Indent/Outdent, Link).
    *   Old `.doc` still lower priority / not planned.
    *   **Audio file upload** *(Shipped 2026-08-05.)* Sync Whisper via Receives (~4MB / ~15 min), `Type: Transcript`. Longer meeting audio uses **Record / Listens v2** (Storage + async), not Receives.

**What creates a session:** Creating a group reflection (Reflect) or using Create session on Record/Upload inserts a `sessions` row (name + optional seed/description + share token). Connecting only links the contribution — it does not create a session. Stand-alone Reflect may leave `session_id` null.

### 5.2 Commons (storage + repository UI)

*   Body is always **Markdown** in `documents.content` (even when authored via WYSIWYG).
*   Underline is not native Markdown; may persist as a small `<u>` tag inside the body.
*   Always **stream-scoped** (`stream_id`).
*   **Sessions are first-class** *(Shipped)*: a `sessions` table (event containers: `id`, `stream_id`, `name`, `occurred_at`, plus `seed_question` / `description` / `share_token` from Session Composer) backs session links — documents reference a real session (and may link 1–3 via `document_sessions`).
*   **Repository UI** *(Shipped Phase 6):* one filterable/sortable Commons view of chats, recordings, uploads, and sessions. Private items are hidden from the public list but still visible to their owner (eye icon); **session attendees and stream admins can also read private docs linked to that session** (Reflect privacy decision 2026-08-06). Filters: element type, date, attended, my artifacts. Clicking an element opens a **detail popup** (minimize removed 2026-08-06). Session archive and "I Attended" are woven in.
*   **Edit permissions** *(Decided):* author of the element, attendees of its linked session, and stream admins.
*   **Comments** *(Decided, not yet built):* on documents and sessions. Show author display name, small photo (auth avatar or initials fallback), and timestamp. Author may edit or delete their own comments; edits show an "edited" marker and append to an **admin-visible audit log** (who edited, when).

**OKF metadata fields:**
*   `Title`, `Session_ID`, `Date_Created`, `Type`, `Participants`, `Tags`, `Privacy`, `Stream_ID`
*   UI: label document kind as **Type** (not “OKF type”).
*   Types include: Reflection, Note, Transcript, Summary, Atom, Concept, Framework, Theme.

**How OKF gets filled:**
*   **Manual:** Title (optional), Type, Privacy (default Public) at Receive time; Session is editable on document edit (pick from the stream's existing sessions, or create by name inline). Owner can mark their own items Private to hide them from public Commons views (owner still sees them + eye icon).
*   **Automatic** *(Shipped)*: on every new document, an Inngest job asks an LLM to propose Session / Tags / Participants. It never overwrites a field a human already set, and sets `needs_review = true` only when the model wasn't confident it found real signal in the text — not merely because a field is empty.
*   **Admin Queue** *(Shipped)*: humans fix `needs_review` docs via `/admin` — never blocks ingestion. See §7.5.

### 5.3 Synthesis (meaning-making)

1.  **Ask CLara** (`/ask`) — *(Shipped.)* RAG over stream Commons; separate from Chatbot.
2.  **Knowledge Map** (`/map`) — nodes/edges, stream-scoped. *(Shipped.)*

---

## 6. The Knowledge Graph (Nodes & Edges)

*(Shipped.)* Atoms → concepts → frameworks/themes; edges relational; stream-scoped; no manual approval gate for map appearance — unchanged intent from prior versions. An Inngest job (`clara-extract-graph`) proposes nodes/edges via LLM on every new **Public** document (same `clara/document.created` event OKF enrichment and Ask CLara's embeddings pipeline already listen on); Private documents never feed the graph, since nodes/edges have no per-node privacy field and nothing gates their visibility once created. Nodes are deduped per stream by label, so the same concept mentioned across documents converges on one node rather than fragmenting. `/map` renders the graph as an interactive force-directed canvas (dark surface, glowing nodes by type, click for a detail panel with a link back to the source document) per `DESIGN_GUIDE.md`.

---

## 7. Scope — Core Surfaces

**Primary navigation (decided 2026-08-05):** **Dashboard · Add · Commons · Synthesis · Admin**. Mobile: hamburger menu; Add and Synthesis expand to show sub-pages. Desktop: same structure (top bar with expandable Add / Synthesis). Dashboard content stays as-is for now; Admin remains a separate top-level item (page still gated to stream admins).

### 7.1 Dashboard
*   Active stream context from DB.
*   Placeholder conceptual anchors.
*   **Recent Commons Activity** (live query of `documents`).
*   Jump-in cards may still link into Add / Synthesis surfaces; no redesign required in this IA pass.

### 7.2 Add — Reflect / Record / Upload
*   **Reflect** (`/add/chat`) — *(Shipped.)* CLara Chatbot renamed Reflect; Session Composer + autosave + Submit. Separate pipeline from Ask CLara.
*   **Record** — *(Shipped as Listens v1.)* Under Add nav; mic → Whisper → Transcript; Session Composer shared with Reflect/Upload.
*   **Upload** — *(Shipped as Receives.)* Under Add nav; Upload / Add text / PDF / DOCX / short audio → transcript; Session Composer shared.
*   **Join link** — `/join/[token]` marks attendance and opens Reflect with the session pre-selected.

### 7.3 Commons — repository
*   **Filterable / sortable list** of stream elements: chats (saved reflections), recordings (transcripts), uploads (notes/files), and **sessions** (archive woven in — not a separate top-level nav item).
*   Click → **detail popup** with view/edit (when permitted) and comments (minimize removed 2026-08-06).
*   Session popup: mark **"I Attended"** and comment; harvest/export of attended-session documents remains available (exact UI placement TBD in Phase 6).
*   Private-to-owner visibility + eye icon; filters: type, date, attended, my artifacts.
*   **Comments** + admin audit log — see §5.2.
*   Existing document routes (`/sessions/documents/[id]`, archive pages) can remain as deep links until the popup UX replaces them.

### 7.4 Synthesis — Ask CLara / Knowledge Map
*   **Ask CLara** (`/ask`) — *(Shipped.)* Grounded Q&A over the Commons with source citations. Nested under Synthesis in nav. **Follow-up thread** *(2026-08-05):* same-session conversation history in the Ask UI (client-held; still a separate pipeline from Chatbot).
*   **Knowledge Map** (`/map`) — *(Shipped.)* Force-directed graph from Public Commons documents; click a node for a detail panel with a link back to its source document. Nested under Synthesis in nav.
*   Pipelines stay separate from Chatbot — no shared prompt/state.

### 7.5 Admin — *(Shipped.)* `/admin` (stream admins only) has three sections:
*   **Metadata queue** — lists documents with `needs_review = true`. No separate "approve" action — opening a flagged document through the normal editor and saving with Title + Type filled clears the flag.
*   **Membership** — add an *existing* account to the stream by email, promote/demote member ↔ admin, remove a member. Deliberately does not create accounts or send invite email — the person must have signed in at least once already; a UI guard prevents an admin from removing/demoting themselves.
*   **Isolation** — toggle for `streams.isolation_enabled` (§4.2), previously database-only.
*   **Comment edit audit log** *(Shipped.)* Admins can open “Audit log” on an edited comment (who / when / previous body) via `comment_edit_log`.

---

## 8. Ops / Repo Decisions

*   **Live app:** https://clara-cl.vercel.app/
*   **GitHub:** public while building (Vercel Hobby multi-author deploys). No secrets in git; rotate if leaked.
*   **Inngest:** production app synced to `https://clara-cl.vercel.app/api/inngest` — **separate** from Old Clara’s Inngest app/URL.
*   **Reference code:** Festival (Inngest, Ask/RAG, graph, PDF/DOCX conversion patterns); Old Clara (Listens / recorder). Do not copy product surfaces wholesale.

---

## 9. Success Metrics & Out of Scope

**Success Metrics:** (unchanged intent from 0.4 — participation, graph growth, time-to-publish, stream isolation correctness)

**Out of Scope for V1:**
*   Native mobile apps (responsive web; Listens uses device mic on mobile).
*   Real-time multi-player co-editing.
*   LMS / Registration.
*   Fully populating non–Camp CLAI streams (plumbing yes).
*   Perfect PDF layout fidelity / scanned-PDF OCR (call out if added later).
