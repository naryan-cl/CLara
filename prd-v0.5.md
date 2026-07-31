# CLara Platform — Product Requirements Document (PRD)

**Version:** 0.5  
**Owner:** Ali / Naryan  
**Status:** Living — implementation in progress  
**Last updated:** 2026-07-31 (Phase 2 + Phase 5 complete)  
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
*   **PDF/DOCX Receives** shipped: async Storage + Inngest conversion path alongside the text path — see §5.1.
*   **Sessions are now first-class**: a real `sessions` table backs `Session_ID` (previously free text) — see §5.2.
*   **Full session archive + "I Attended" harvest** shipped — see §7.2 (previously "later").
*   **Admin surface** shipped: `/admin` now covers the `needs_review` metadata queue, membership management (add/remove/promote existing accounts by email), and the isolation toggle, all gated to stream admins — see §3.2, §4.2, §7.5 (previously "later" / DB-only).

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
| **Commons** | The shared knowledge store for a stream: structured database records + Markdown body with OKF metadata. |
| **Input → Commons → Output** | The primary architecture lens for how thinking moves through the system. |
| **OKF** | Open Knowledge Format — standardized metadata on every Commons document (UI label for document kind is just **Type**, not “OKF type”). |
| **Receives** | Input path for files / typed notes into the Commons (vs Listens for live audio). |

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

## 5. Architecture — Input → Commons → Output

```
  INPUT                         COMMONS                        OUTPUT
  ─────                         ───────                        ──────
  CLara Chatbot          →   Structured database      →   Ask CLara
  CLara Listens (Recorder) →  Markdown + OKF metadata →   Knowledge Map
  CLara Receives (Uploads) ↗
```

### 5.1 Inputs

1.  **CLara Chatbot** — contribute/reflect; separate from Ask CLara. *(Not built yet.)*
2.  **CLara Listens** — *(Shipped v1.)* Browser mic recording → Whisper → Commons document (`Type: Transcript`), same table/RLS as Receives. Deliberately short-recording-only for v1 (~15 min cap, synchronous, no Storage bucket) — desktop meeting-audio capture and longer/chunked recordings (porting more of Old Clara's pattern) are a deferred "v2," not a bug in v1. Mobile = device mic (works today, since v1 is just browser `MediaRecorder`).
3.  **CLara Receives** — bring existing text/files into the Commons.
    *   **Upload** — `.md` / `.txt` (synchronous) **or** `.pdf` / `.docx` *(Shipped)* (async — converts via Storage + Inngest, ~4.5MB cap).
    *   **Add text** — rich-text editor (formatting visible; **stored as Markdown**).
    *   Upload and Add text are **mutually exclusive** on one submit (not both).
    *   After save: **view** formatted Markdown; **edit** with the same rich toolbar (Bold, Italic, Underline, Header, Subhead, Bullets, Numbered, Indent/Outdent, Link).
    *   Old `.doc` still lower priority / not planned.
    *   **Audio file upload** can share the same Whisper path Listens uses, later.

### 5.2 Commons (Storage)

*   Body is always **Markdown** in `documents.content` (even when authored via WYSIWYG).
*   Underline is not native Markdown; may persist as a small `<u>` tag inside the body.
*   Always **stream-scoped** (`stream_id`).
*   **Sessions are first-class** *(Shipped)*: a `sessions` table (event containers: `id`, `stream_id`, `name`, `occurred_at`) backs `Session_ID` — documents reference a real session (create-by-name inline in the editor) instead of free text.

**OKF metadata fields:**
*   `Title`, `Session_ID`, `Date_Created`, `Type`, `Participants`, `Tags`, `Privacy`, `Stream_ID`
*   UI: label document kind as **Type** (not “OKF type”).
*   Types include: Reflection, Note, Transcript, Summary, Atom, Concept, Framework, Theme.

**How OKF gets filled:**
*   **Manual:** Title (optional), Type, Privacy (default Public) at Receive time; Session is editable on document edit (pick from the stream's existing sessions, or create by name inline).
*   **Automatic** *(Shipped)*: on every new document, an Inngest job asks an LLM to propose Session / Tags / Participants. It never overwrites a field a human already set, and sets `needs_review = true` only when the model wasn't confident it found real signal in the text — not merely because a field is empty.
*   **Admin Queue** *(Shipped)*: humans fix `needs_review` docs via `/admin` — never blocks ingestion. See §7.5.

### 5.3 Outputs

1.  **Ask CLara** — RAG over stream Commons; separate from Chatbot. *(Not built yet.)*
2.  **Knowledge Map** — nodes/edges, stream-scoped. *(Not built yet.)*

---

## 6. The Knowledge Graph (Nodes & Edges)

Unchanged intent: atoms → concepts → frameworks/themes; edges relational; stream-scoped; no manual approval gate for map appearance. *(Schema/UI not built yet.)*

---

## 7. Scope — Core Surfaces

### 7.1 Dashboard
*   Active stream context from DB.
*   Placeholder conceptual anchors.
*   **Recent Commons Activity** (live query of `documents`).

### 7.2 Sessions (+ Receives)
*   **CLara Receives** (Upload / Add text / PDF / DOCX) — *(Shipped.)*
*   Document list → open `/sessions/documents/[id]` to view/edit.
*   **Full session archive** *(Shipped)* — browse past sessions and the Commons documents tied to each.
*   **"I Attended" harvest** *(Shipped)* — members mark sessions they attended; their attended-session documents can be exported.

### 7.3 Knowledge Map — later  
### 7.4 Chatbot & Ask CLara — later (keep pipelines separate)  
### 7.5 Admin — *(Shipped.)* `/admin` (stream admins only) has three sections:
*   **Metadata queue** — lists documents with `needs_review = true`. No separate "approve" action — opening a flagged document through the normal editor and saving with Title + Type filled clears the flag.
*   **Membership** — add an *existing* account to the stream by email, promote/demote member ↔ admin, remove a member. Deliberately does not create accounts or send invite email — the person must have signed in at least once already; a UI guard prevents an admin from removing/demoting themselves.
*   **Isolation** — toggle for `streams.isolation_enabled` (§4.2), previously database-only.

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
