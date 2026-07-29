# Camp CL/AI Platform — Product Requirements Document (PRD)

> **Superseded by [`prd-v0.4.md`](./prd-v0.4.md).**  
> Product is now **CLara**; **Camp CLAI** is a stream. Keep this file only for historical reference.

**Version:** 0.3 (Ready for Build) — **superseded**
**Owner:** Ali 
**Status:** Superseded by v0.4
**Target Audience for Document:** AI Coding Assistants (Cursor) and Engineering Team

---

## 1. Vision & The "Commons" Paradigm

Camp CL/AI is a residential/virtual learning event run by Cultivating Leadership (CL) exploring AI through the lens of adult development, complexity, and leadership. Insight generated in live sessions often evaporates. This platform is the **front door** to the camp's collective thinking.

**The Commons Paradigm:** 
The platform acts as a shared brain. Unlike standard chat interfaces where threads are private, **all conversations, transcripts, and generated concepts are shared to the CL Commons by default** (similar to public Slack channels). Participants can opt out or restrict visibility, but the default state is open, visible, and collaborative.

## 2. Users, Auth & Access ("The Front Door")

### 2.1 The Website Front Door
*   **Unauthenticated State:** Users arriving at the website see a contextual framing/landing page explaining the camp and core questions. 
*   **Sign-in:** A clear "Login with CL Account" button.
*   **Authentication:** Handled via Supabase. Supports both **Single Sign-On (SSO)** and **Magic Links**.
*   **Access Control:** Restricted primarily to CL email domains, with an admin-configurable exception list for external participants.
*   **Roles:** Because the Commons is open, the boundary between "Participant" and "Facilitator" is highly porous. All users can harvest ideas, upload dialogue, and explore. (Admins have additional UI for managing edge cases like missing metadata).

---

## 3. Architecture & Data Ingestion 

As mapped in `image_649378.png`, the system seamlessly ingests, structures, and displays information.

### 3.1 Ingestion Pathways (How thinking enters)
Users can add to the Commons through four distinct pathways:
1.  **Conversations with CLara:** Chat threads querying or exploring ideas with the AI.
2.  **Mobile Mic / Live Record:** Live voice memo feature allowing participants to record dialogue/reflections.
3.  **Live Meeting Capture:** Capturing sound output directly from platforms like Zoom/Meet/Teams.
4.  **Direct File Upload:** Uploading audio recordings, transcripts, or raw notes.

*Note: Summaries are automatically generated and published once a transcript is complete (similar to Granola), with optional speaker attribution (Host selects who joined the conversation via dropdown).*

### 3.2 Storage & Markdown Architecture
All ingested text, transcripts, and summaries are converted into **Markdown files (`.md`)** stored in the database.

**OKF Headers (Frontmatter):**
Each `.md` file includes standardized Open Knowledge Framework (OKF) style headers. 
*   `Title`
*   `Session_ID`
*   `Date_Created`
*   `Type` *(Reflection, Note, Transcript, Summary, Atom, Concept, Framework, Theme)*
*   `Participants` *(Optional speaker attribution)*
*   `Tags`
*   `Privacy` *(Default: Public Commons, Toggle: Private)*

**Fallback / Admin Queue:**
If the AI fails to extract mandatory fields (e.g., Type, Session ID) during automatic ingestion, the file still saves but is flagged with a `needs_review` boolean. It enters an Admin Queue for manual sorting later, preventing data loss without blocking ingestion.

---

## 4. The Knowledge Graph (Nodes & Edges)

The system maps dynamically in real-time. No manual facilitator approval is required for concepts to appear on the map.

*   **Nodes (Hierarchy of Ideas):**
    *   **Atomized Thoughts:** The smallest nugget or quote of an idea.
    *   **Concepts:** Composed of grouped atoms.
    *   **Frameworks / Themes:** Higher-level models composed of linked concepts.
*   **Edges (Connections):** SQL relational tables track how files and concepts link (e.g., "discussed in", "challenges", "supports"). A tag can connect to up to 3 other conversations natively.

---

## 5. Scope — The Core Surfaces (User Views)

Upon logging in, users arrive at the **Dashboard** which branches into several distinct views:

### 5.1 Dashboard
*   Displays the Core Conceptual Anchors.
*   Shows a snapshot of recent Commons activity.
*   Provides immediate entry points to Sessions, Harvest, and Resources.

### 5.2 Sessions (Archive & Explore View)
*   **Add Session:** Trigger the Record/Upload flow.
*   **Explore Sessions:** Chronological or list-based directory. Users can view transcripts, read summaries, or click "I Attended" to generate a specific "Harvest Prompt" for personal reflection.

### 5.3 Knowledge Graph (Map View)
*   Visual, interactive web of Nodes & Edges.
*   **Views:** Cluster around themes, or view chronologically. 
*   Users can click a node to read the concept and immediately ask CLara about it.

### 5.4 Harvest & Chat View (CLara)
*   **Add CLara Chat Reflection / Solo Conversations:** Users query the database.
*   CLara answers are grounded via RAG (Retrieval-Augmented Generation) across the `.md` files in the Commons.
*   **Transparency:** Users can see CLara's system prompt and edit it to change how she deepens inquiry or responds in summary mode.

---

## 6. Success Metrics & Out of Scope

**Success Metrics:**
*   % of camp participants who sign in and contribute $\ge 1$ asset to the Commons.
*   Number of dynamic nodes/edges created automatically during the camp.
*   Time to publish (Target: Instant/Automated upon transcript completion).

**Out of Scope for V1:**
*   Native mobile apps (web app must be responsive).
*   Real-time live multi-player cursor co-editing.
*   LMS / Registration features.
