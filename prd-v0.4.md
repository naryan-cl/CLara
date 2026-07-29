# CLara Platform — Product Requirements Document (PRD)

**Version:** 0.4  
**Owner:** Ali  
**Status:** Approved for implementation  
**Target Audience for Document:** AI Coding Assistants (Cursor) and Engineering Team  
**Supersedes:** `prd-v0.3.md`

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
| **Commons** | The shared knowledge store for a stream: structured database records + Markdown (`.md`) files with OKF metadata. |
| **Input → Commons → Output** | The primary architecture lens for how thinking moves through the system. |
| **OKF** | Open Knowledge Format — standardized frontmatter/metadata on every `.md` document. |

---

## 3. Users, Auth & Access ("The Front Door")

### 3.1 Platform Authentication
*   Auth is for the **CLara platform**, not a single stream.
*   **Unauthenticated State:** Users arriving at the website see a CLara landing page (context & framing). Stream-specific framing may appear after the user selects or is routed into a stream.
*   **Sign-in:** A clear login affordance (e.g. "Login with CL Account").
*   **Authentication:** Handled via Supabase. Supports both **Single Sign-On (SSO)** and **Magic Links**.
*   **Access Control:** Restricted primarily to CL email domains, with an admin-configurable exception list for external participants.
*   **Stream membership:** After login, access to a given stream's Commons depends on membership (and that stream's isolation settings).

### 3.2 Roles
Because a Commons is open within its stream, the boundary between "Participant" and "Facilitator" is highly porous. All users can harvest ideas, upload dialogue, and explore. Admins have additional UI for managing edge cases (e.g. missing metadata) and stream configuration.

---

## 4. Streams

Streams are first-class in V1. The platform is multi-stream by design; Camp CLAI is the initial stream we ship and validate against.

### 4.1 Planned / Example Streams
*   **Camp CLAI** (primary V1 stream)
*   **Other Thinking Gyms**
*   **Client Development Zone**

### 4.2 Isolation Toggle
Each stream has an **isolation** setting:
*   **Isolated (on):** That stream's Commons is not visible or queryable from other streams. Default for streams that must not contaminate each other (e.g. client work).
*   **Isolated (off):** Content may be discoverable or linkable across streams per platform rules (future refinement; V1 should implement the toggle and enforce isolation when on).

**V1 requirement:** Design and implement stream plumbing (`stream_id` on commons data, membership, isolation enforcement). Ship Camp CLAI as the first populated stream.

---

## 5. Architecture — Input → Commons → Output

This is one way to organize features. It does not replace the user-facing surfaces in §6; it describes how data flows.

```
  INPUT                         COMMONS                        OUTPUT
  ─────                         ───────                        ──────
  CLara Chatbot          →   Structured database      →   Ask CLara
  CLara Listens (Recorder) →  .md files + OKF metadata →   Knowledge Map
  CLara Receives (Uploads) ↗
```

### 5.1 Inputs (How thinking enters)

1.  **CLara Chatbot**  
    Conversational capture: users explore or contribute ideas with the AI. Chat contributions that are meant for the Commons are written into the stream's Commons.  
    **Kept separate from Ask CLara** (see Outputs) so contribution and retrieval do not contaminate each other.

2.  **CLara Listens (Recorder)**  
    Audio capture into the Commons. Supports:
    *   **Microphone** — including the device mic on mobile (primary mobile path).
    *   **Audio stream** — listening to system/meeting audio (e.g. Zoom / Meet / Teams output) on desktop where available.  
    Live meeting capture is **not** a separate product pathway; it is a mode of CLara Listens.

3.  **CLara Receives (Uploads)**  
    Direct upload of audio recordings, transcripts, notes, or other supported files into the Commons.

*Note: Summaries are automatically generated and published once a transcript is complete (similar to Granola), with optional speaker attribution (host selects who joined via dropdown).*

### 5.2 Commons (Storage)

All ingested text, transcripts, and summaries become **Markdown (`.md`)** content stored in the structured database (and associated storage as needed), always scoped to a **stream**.

**OKF Headers (Frontmatter) — Open Knowledge Format:**  
Each `.md` document includes standardized OKF-style headers:
*   `Title`
*   `Session_ID`
*   `Date_Created`
*   `Type` *(Reflection, Note, Transcript, Summary, Atom, Concept, Framework, Theme)*
*   `Participants` *(Optional speaker attribution)*
*   `Tags`
*   `Privacy` *(Default: Public Commons, Toggle: Private)*
*   `Stream_ID` *(Which stream this document belongs to)*

**Fallback / Admin Queue:**  
If the AI fails to extract mandatory fields during automatic ingestion, the file still saves but is flagged with `needs_review`. It enters an Admin Queue for manual sorting — data is not lost, and ingestion is not blocked.

### 5.3 Outputs (How thinking is consumed)

1.  **Ask CLara**  
    Query / retrieval interface grounded in the stream's Commons (RAG over `.md` content). **Separate surface from CLara Chatbot (Input)** so asking does not mix with contributing.

2.  **Knowledge Map**  
    Visual exploration of nodes & edges derived from the Commons (concepts, frameworks, themes, and their links).

---

## 6. The Knowledge Graph (Nodes & Edges)

The map updates dynamically. No manual facilitator approval is required for concepts to appear.

*   **Nodes (Hierarchy of Ideas):**
    *   **Atomized Thoughts:** The smallest nugget or quote of an idea.
    *   **Concepts:** Composed of grouped atoms.
    *   **Frameworks / Themes:** Higher-level models composed of linked concepts.
*   **Edges (Connections):** Relational records track how files and concepts link (e.g. "discussed in", "challenges", "supports"). A tag can connect to up to 3 other conversations natively.
*   All graph entities are **stream-scoped** and respect the stream isolation toggle.

---

## 7. Scope — The Core Surfaces (User Views)

Upon logging in, users work within a **stream context** (Camp CLAI first). Surfaces below remain in scope; Input / Commons / Output is the data-flow lens behind them.

### 7.1 Dashboard
*   Displays the Core Conceptual Anchors for the active stream.
*   Shows a snapshot of recent Commons activity.
*   Provides immediate entry points to Sessions, Harvest, Chat, Map, and Resources.

### 7.2 Sessions (Archive & Explore View)
*   **Add Session:** Trigger Record / Upload (CLara Listens / CLara Receives).
*   **Explore Sessions:** Chronological or list-based directory. Users can view transcripts, read summaries, or click "I Attended" to generate a specific "Harvest Prompt" for personal reflection.

### 7.3 Knowledge Map (Map View)
*   Visual, interactive web of Nodes & Edges for the active stream.
*   **Views:** Cluster around themes, or view chronologically.
*   Users can click a node to read the concept and open **Ask CLara** about it.

### 7.4 Harvest & Chat Surfaces
*   **CLara Chatbot (Input):** Solo / reflection conversations that can contribute to the Commons.
*   **Ask CLara (Output):** Queries against the Commons via RAG. Answers are grounded in that stream's `.md` documents (respecting isolation).
*   **Transparency:** Users can see relevant system prompts and edit them to change how CLara deepens inquiry or responds in summary mode (per surface, so input and ask stay distinct).

### 7.5 Admin Queue
*   Admins review documents with `needs_review = true` and fix missing OKF metadata.
*   Admins can configure stream settings, including the **isolation toggle**.

---

## 8. Success Metrics & Out of Scope

**Success Metrics:**
*   % of Camp CLAI participants who sign in and contribute ≥ 1 asset to that stream's Commons.
*   Number of dynamic nodes/edges created automatically during the camp.
*   Time to publish (Target: Instant / automated upon transcript completion).
*   Stream plumbing works: documents, graph entities, and Ask CLara queries are correctly scoped; isolation toggle enforced when on.

**Out of Scope for V1:**
*   Native mobile apps (web app must be responsive; mobile uses device mic via CLara Listens).
*   Real-time live multi-player cursor co-editing.
*   LMS / Registration features.
*   Fully populating non–Camp CLAI streams (plumbing yes; Other Thinking Gyms / Client Development Zone content can land later).
