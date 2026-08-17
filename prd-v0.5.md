# CLara Platform — Product Requirements Document (PRD)

**Version:** 0.5  
**Owner:** Ali / Naryan  
**Status:** Living — implementation in progress  
**Last updated:** 2026-08-17 (Synthesis Top 10)  
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
*   **Dashboard list recency + outside-CL flag (2026-08-17):** Dashboard List sorts newest activity first; **Hide external** pill in the panel header (beside close); **New** / **External** labels on cards. Upload can flag “from outside CL” (`documents.is_external`). Detail pane: date + Created by sit on the type-pill row; session Join code is in Edit. Map stays unfiltered. Apply **`0032_document_is_external.sql`**. See §5.1, §7.1.
*   **Synthesis Top 10 (2026-08-17):** New Synthesis child at `/top10` ranks the stream’s top topics, spaces of difference (tensions/polarities), and questions/inquiries from Public Commons — tags, element-summary sections, session inquiries, and Knowledge Map contrast links. Source chips open the original document or session. Private stays off the board (same as the map). Not an Ask CLara pipeline. See §5.3, §7.4.
*   **Connect without join code (2026-08-17):** Stream members can nest Reflect / Record / Upload under an **open Session** from a Connect dropdown (newest first). Join code + share/QR remain for people who were given a code, including late Adds after Finalize. Session detail shows the join code and a link to the live board. See §5.1.
*   **Long audio via Upload (2026-08-17):** Add → Upload uses the same `listens-staging` + async Whisper path as Record (no ~4MB Server Action cap). Files over 25MB are compressed in the browser. See §5.1.
*   **Phone Record + Created by (2026-08-17):** Phone mic recordings now stay on the raw audio track (iOS was producing files Whisper could not read). **Created by** uses Google/email names instead of a generic “Member” when the profile RPC misses. Apply **`0031_user_display_names.sql`**. Original Record audio is kept in private `listens-staging` until the Transcript is deleted (Retry + in-app player). See §5.1, §5.2.
*   **Structured element-summary brief (2026-08-17):** Default summarize prompt writes a long Markdown brief (overview, categorized highlights, balcony observations on transcripts only, tensions/polarities, key questions, theme tags), not a 1–3 paragraph digest. Admin-editable. See §5.2, §7.5.
*   **Admin-editable summarize prompt + collapsible Admin (2026-08-17):** The per-element summary system prompt is editable on `/admin` alongside Reflect and Ask (`streams.summarize_system_prompt`; NULL = code default). Admin content sections start collapsed with Expand on the right. Apply **`0030_summarize_system_prompt.sql`**. See §7.5.
*   **Per-element summaries (2026-08-16):** Every submitted Commons document gets an automatic Markdown summary on `documents.summary` (Inngest `clara-summarize-document`). Dashboard and Commons open **Summary** first, with a second tab for the original Transcript / Reflection / Uploaded text. Detail shows **Created by** (author display name) and, on sessions with two or more people, an **Attendees** list. Session Finalize synthesis is unchanged (gathering-level Summary document). Apply **`0028_document_summary.sql`**. See §5.2, §7.3.
*   **Auth methods changed**: Google SSO + email/password replace Magic Link (rate-limit issues on Supabase's default email provider made Magic Link impractical for active dev/testing) — see §3.1.
*   **OKF LLM enrichment** shipped: Session/Tags/Participants are proposed automatically (Inngest + OpenAI) on every new Commons document; `needs_review` now reflects extraction confidence, not just missing form fields — see §5.2.
*   **CLara Listens v1** shipped: mic recording → Whisper → Commons document (short recordings, synchronous, no Storage bucket by design) — see §5.1.
*   **CLara Listens v2 Module A (2026-08-06):** browser uploads audio to private `listens-staging` Storage; Inngest `clara-transcribe-recording` runs Whisper async; soft ~60 min / Whisper 25MB cap. Chunked multi-part upload = Module B later. Apply migration `0014_listens_staging_storage.sql`.
*   **CLara Listens v2 Module B (2026-08-06):** ~12-min MediaRecorder restarts; segments upload during the take; Inngest Whispers each and joins text (~3 hour soft cap). Original audio stays in private `listens-staging` until the Transcript is deleted (2026-08-17).
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
*   **Record Session details (2026-08-06):** Record no longer uses Connect/Create buttons. Below the recorder, an always-open **Session details** form has Title (session name), Inquiry/Description, Participants, and Connections. Filling Title creates the session on Submit. Reflect/Upload keep the button composer. Page eyebrows (`Add · …`) removed from Add pages. Capture strip: mic/pause/stop/trash; Stop saves staging; Trash deletes; Submit under Connections with in-progress confirmation.
*   **Admin-editable CLara prompts (2026-08-06; summarize added 2026-08-17):** Stream admins can view/edit the Reflect, Ask CLara, and element summary system prompts on `/admin` (per-stream overrides on `streams`; NULL = product default in code). Reflect ≠ Ask ≠ Summarize stay separate. Apply **`0015_stream_system_prompts.sql`** and **`0030_summarize_system_prompt.sql`**. Participant-facing prompt transparency is later. Admin sections on `/admin` start collapsed.
*   **Map themes (2026-08-07, Phase 7 Modules A–D shipped in code):** Dashboard canvas supports **Plant / Ocean / Desert** generative topo wallpapers (pan/zoom with the graph) **and** matching theme sprite pools for nodes. **`/map` Knowledge Map stays dark with type-colored circles** (no wallpaper, no sprites). **Ocean** keeps deep blues with light labels/edges. Unlock unit = authored **Public** + **non-draft** Commons docs (`documents.is_draft`; Reflect autosave = draft until Submit). Defaults: Plant free, Ocean @ 5, Desert @ 10 (admin-overridable on `/admin`). Per-member theme pick + unlock congratulations popup. Apply migration **`0017_map_themes.sql`**. Sprite pipeline: `Sprites/split_sprites2.py` (edge flood-fill alpha — keeps interior white) → cull under `Sprites/extracted/` → `npm run sprites:prepare` → `public/map-sprites/{theme}/{type}/`. How-to: `Sprites/README.md`. See `dev-plan-v0.3.md` §4.
*   **Commons polish (2026-08-07):** Compact filter bar; element-type colour coding (Chat/Record/Upload/Session/Other) + legend; **Delete** in Edit for anyone with edit access (author / attendees / admins) — apply **`0020_document_delete_rls.sql`**. **My harvest** page + Markdown export removed (attendance toggle + “Attended” filter remain).
*   **Transcript quality (2026-08-10):** Record / Upload audio transcripts are no longer a flat text blob. Default model is **`gpt-4o-transcribe-diarize`** (speakers + segment clocks). Commons Markdown looks like `**Name** · [M:SS]` turns; Session details participants seed `documents.participants` and rename Speaker A/B when possible (solo → that person; multi → light LLM map). Multi-chunk Listens shifts clocks so the full take stays continuous. Set `OPENAI_TRANSCRIPTION_MODEL=whisper-1` for timestamp-only (no speakers). Cost stays ~$0.006/min audio.
*   **Stuck transcription (2026-08-16):** Placeholder Transcripts older than ~1 hour (or Inngest `onFailure`) show **Transcription failed** with **Retry** when staging audio + job meta still exist. Yesterday’s spinning labels were the job never finishing — Inngest logs expire, so the UI no longer waits forever.
*   **Admin analytics + map layout (2026-08-10):** `/admin/analytics` (stream Commons/graph/membership aggregates; Phase A). Site pageviews via Vercel Web Analytics. `/admin/map-layout` tunes Dashboard/Knowledge Map physics + sizes (`0022_map_layout_config.sql`). See §7.5.
*   **Sessions as intentional gatherings (IA v2, 2026-08-10):** **Session** is the only nesting parent for multi-person contribution. **Add → Session** is first in the Add menu (`/add/session`): host creates a gathering (name, inquiry, short join code + share links), stays on a **live board** with Reflect/Record/Upload share icons (copy link + QR), live in-progress vs submitted counts, and **Finalize** (soft close — synthesizes current children into a Summary; late Adds still allowed; optional refresh synthesis). Solo Reflect / Record / Upload create **one Add** with no session create UI. **Connect** = **Relate** (user-described edge to another element) and/or nest under a Session (pick an **open session** from the dropdown, or enter a **join code** / share/QR link). Three connection kinds stay distinct: session parent/child (nesting), user-described links, auto-generated (OKF/map). Commons list hides session children until the parent is opened. Dashboard map keeps the same top-level set; **selecting a session expands its children with nest lines**; Relate lines draw among visible nodes. Dashboard Commons map uses Reflect/Record/Upload/Session visuals — not Atom/Concept/Framework/Theme (those stay on `/map`). Apply migration **`0021_session_gathering.sql`**.
*   **Dashboard session edit (2026-08-13):** Ask-pane pencil edits **sessions** (title, date, inquiry, description) for host, attendees, stream admins, and authors of nested documents. Apply **`0023_session_edit_rls.sql`**. **Session Delete (2026-08-16):** same people; Commons popup + archive + dashboard. Confirm: ungroup nested docs or delete them too. Apply **`0026_session_delete_rls.sql`**. OKF no longer auto-creates a gathering whose name is a UUID.
*   **Edit connections (2026-08-16):** Session edit can Relate to other sessions or elements. Document edit can **nest** into a session (`session_id`) **or** Relate to another session/element without nesting. Apply **`0027_connection_edit_rls.sql`**. Dashboard clicks no longer shove other map nodes apart.
*   **Auto-join Camp CLAI (2026-08-14):** New registrants become Camp CLAI `member`s on account creation; existing accounts with no membership are backfilled. Apply **`0024_auto_join_camp_clai.sql`**. Temporary while Camp CLAI is the only populated stream.

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
| **Synthesis** | Meaning-making surfaces: **Ask CLara**, **Knowledge Map**, and **Top 10**. |
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
*   **Stream membership:** After login, Commons access depends on `stream_members` (+ isolation). **For now (2026-08-14):** every new account is added to **Camp CLAI** as a `member` on signup (migration `0024`); existing accounts with no membership are backfilled. Admins still manage roles and other streams from `/admin`.

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
  Session (gathering)    →   Structured database      →   Ask CLara
  Reflect (CLara Chatbot)→   Markdown + OKF metadata →   Knowledge Map
  Record (Listens)       →   + sessions (parents), comments,  Top 10
  Upload (Receives)      ↗     privacy, filters, relate edges
```

*(Formerly labeled Input → Commons → Output — same architecture, renamed 2026-08-05.)*

### 5.1 Add (contribution)

0.  **Session** (`/add/session`, first in Add menu) — *(IA v2.)* Intentional multi-person gathering. Host enters name + inquiry; system issues a **short join code** and share links. After save, host stays on a **live board**: Reflect / Record / Upload icons copy mode-specific join links + show QR; live counts of **in progress** (drafts) vs **submitted**; **Finalize** synthesizes submitted children into a session Summary (thank-you + confetti → dashboard with session open). Finalize is a **soft close** — late Adds via join code still allowed; host may refresh synthesis. Apply **`0021_session_gathering.sql`**.
1.  **Reflect** (`/add/chat`, nav label Reflect; legacy `/chat` redirects) — Solo reflective conversation with CLara (separate from Ask). Creates **one** Reflection document — **no create-session UI**. **Connect:** **Relate** (user-described link to another Commons element) and/or nest under a Session (open-session dropdown or join code). Inquiry seed appears when joining via session. Autosave drafts + Submit → thank-you + flower; private checkbox (public unless opted private); private docs hidden from public Commons/map but readable by session attendees + stream admins. Each person's reflection is its own document.
2.  **Record** (Listens) — Browser mic (+ optional system/tab audio) → `listens-staging` → async diarized transcription → Commons `Transcript`. Soft ~3 hour cap. **Title is the recording title only** (does not create a session). Same **Connect** (Relate + open session / join code) as Reflect/Upload. Mobile = device mic.
3.  **Upload** (Receives) — bring existing text/files into the Commons; same Connect pattern (Relate + open session / join code).
    *   **Upload** — `.md` / `.txt` (synchronous) **or** `.pdf` / `.docx` *(Shipped)* (async — converts via Storage + Inngest, ~4.5MB cap) **or** audio (Listens staging + async Whisper, ~3 hour cap).
    *   **Add text** — rich-text editor (formatting visible; **stored as Markdown**); lives under Upload (not a fourth Add nav item).
    *   Optional checkbox **This is from outside CL** flags `documents.is_external` (file, paste, and audio). Record / Reflect / Chat do not set it. Editable later. Apply **`0032_document_is_external.sql`**.
    *   Upload and Add text are **mutually exclusive** on one submit (not both).
    *   After save: **view** formatted Markdown; **edit** with the same rich toolbar (Bold, Italic, Underline, Header, Subhead, Bullets, Numbered, Indent/Outdent, Link).
    *   Old `.doc` still lower priority / not planned.
    *   **Audio file upload** *(2026-08-17: long files.)* Same Listens staging + async Whisper as Record. The Upload box accepts `.m4a` / `.mp3` / `.wav` / …; files ≤ 25MB go to Storage as-is; larger files are compressed in the browser into 12-min chunks. Soft ~3 hour cap. `Type: Transcript`. Keep the Upload page open until the file has uploaded; transcription then runs in the background.

**What creates a session:** Only **Add → Session**. Reflect / Record / Upload never create sessions. Nesting under a session uses the Connect **open-session dropdown** (stream members, newest first) or a **join code** / share/QR join link. Stand-alone Adds leave `session_id` null. **Relate** creates a user-described edge only — never nests.

**Three connection kinds:** (1) Session parent/child — structural nesting; (2) User-described — Relate picker; (3) Auto-generated — OKF / Knowledge Map. Only (1) hides children under a parent in Commons/dashboard.

### 5.2 Commons (storage + repository UI)

*   Body is always **Markdown** in `documents.content` (even when authored via WYSIWYG).
*   **Per-element summary** *(2026-08-16; brief shape 2026-08-17):* `documents.summary` holds a thorough Markdown brief generated after content lands (brief summary, categorized highlights, balcony observations on transcripts only, tensions/polarities, key questions, theme tags). Detail views default to the **Summary** tab; a second tab shows the original. Type `Summary` gathering docs copy `content` into `summary` (no extra LLM). Private Reflect still gets a summary (map extraction stays public-only). Prompt is admin-editable (`0030`). Apply **`0028_document_summary.sql`**.
*   **Created by / Attendees** *(2026-08-16):* detail shows the author's display name; sessions with two or more `session_attendees` list those people (plus leftover OKF names on nested documents).
*   Underline is not native Markdown; may persist as a small `<u>` tag inside the body.
*   Always **stream-scoped** (`stream_id`).
*   **Sessions are first-class** *(Shipped; IA v2 gathering model):* event containers (`name`, inquiry/`seed_question`, `share_token`, short `join_code`, soft-close `finalized_at` / synthesis Summary). Documents nest via `session_id` (+ `document_sessions`). User-described relates live in `document_links` (not nesting).
*   **Repository UI** *(Shipped Phase 6; nesting IA v2):* default list shows **sessions + standalone Adds**; session children are hidden until the session is opened. Private items stay visible to owner (eye icon); **session attendees and stream admins can also read private docs linked to that session**. Filters: element type, date, attended, my artifacts. Detail popup (minimize removed).
*   **Edit permissions** *(Decided):* author of the element, attendees of its linked session, and stream admins.
*   **Comments** *(Decided, not yet built):* on documents and sessions. Show author display name, small photo (auth avatar or initials fallback), and timestamp. Author may edit or delete their own comments; edits show an "edited" marker and append to an **admin-visible audit log** (who edited, when).

**OKF metadata fields:**
*   `Title`, `Session_ID`, `Date_Created`, `Type`, `Participants`, `Tags`, `Privacy`, `Stream_ID`
*   UI: label document kind as **Type** (not “OKF type”).
*   Types include: Reflection, Note, Transcript, Summary, Atom, Concept, Framework, Theme.

**How OKF gets filled:**
*   **Manual:** Title (optional), Type, Privacy (default Public) at Receive time; Session is editable on document edit (pick from the stream's existing sessions, or create by name inline). Owner can mark their own items Private to hide them from public Commons views (owner still sees them + eye icon).
*   **Automatic** *(Shipped)*: on every new document, an Inngest job asks an LLM to propose Session / Tags / Participants. It never overwrites a field a human already set, and sets `needs_review = true` only when the model wasn't confident it found real signal in the text — not merely because a field is empty. Proposed session names that look like UUIDs are ignored (unless they match an existing session id).
*   **Admin Queue** *(Shipped)*: humans fix `needs_review` docs via `/admin` — never blocks ingestion. See §7.5.

### 5.3 Synthesis (meaning-making)

1.  **Ask CLara** (`/ask`) — *(Shipped.)* RAG over stream Commons; separate from Chatbot.
2.  **Knowledge Map** (`/map`) — nodes/edges, stream-scoped. *(Shipped.)*
3.  **Top 10** (`/top10`) — *(Shipped 2026-08-17.)* Ranked topics, spaces of difference, and questions from Public Commons, with source chips back to the original document or session. Count/aggregate — not an Ask CLara answer. Private documents never appear.

---

## 6. The Knowledge Graph (Nodes & Edges)

*(Shipped.)* Atoms → concepts → frameworks/themes; edges relational; stream-scoped; no manual approval gate for map appearance — unchanged intent from prior versions. An Inngest job (`clara-extract-graph`) proposes nodes/edges via LLM on every new **Public** document (same `clara/document.created` event OKF enrichment and Ask CLara's embeddings pipeline already listen on); Private documents never feed the graph, since nodes/edges have no per-node privacy field and nothing gates their visibility once created. Nodes are deduped per stream by label, so the same concept mentioned across documents converges on one node rather than fragmenting. `/map` renders the graph as an interactive force-directed canvas (dark surface, glowing nodes by type, click for a detail panel with a link back to the source document) per `DESIGN_GUIDE.md`.

---

## 7. Scope — Core Surfaces

**Primary navigation (decided 2026-08-05):** **Dashboard · Add · Commons · Synthesis · Admin**. Mobile: hamburger menu; Add and Synthesis expand to show sub-pages. Desktop: same structure (top bar with expandable Add / Synthesis). Dashboard content stays as-is for now; Admin remains a separate top-level item (page still gated to stream admins).

### 7.1 Dashboard
*   Active stream context from DB.
*   Full-bleed Commons map (contribution types) with floating Ask / Add / List.
*   **List panel** (2026-08-17): newest `created_at` first; **New** on the last 24 hours; **Hide external** beside close (list only — map stays unfiltered). Detail: date + author on the type-pill row; session Join code in Edit. Apply **`0032`**.
*   Map shows sessions + ungrouped Adds; **select a session to expand children and nest lines**. Relate lines among visible nodes. Ask pane pencil edits documents **and sessions** when permitted.

### 7.2 Add — Session / Reflect / Record / Upload
*   **Session** (`/add/session`) — *(IA v2.)* First in Add menu + FAB. Host live board, join code, mode-specific share/QR, counts, Finalize.
*   **Reflect** (`/add/chat`) — Solo Add; Connect = Relate + open session / join code; autosave + Submit. Separate from Ask CLara.
*   **Record** — Mic → Whisper → Transcript; recording title ≠ session; same Connect chrome.
*   **Upload** — Upload / Add text / PDF / DOCX / audio (async Whisper, same path as Record); same Connect chrome; optional **from outside CL** flag.
*   **Join link** — `/join/[token]?mode=reflect|record|upload` marks attendance and opens the matching Add surface with the session pre-linked (works after Finalize).

### 7.3 Commons — repository
*   **Filterable / sortable list:** top-level = sessions + **ungrouped** Adds; children appear when a session is opened. Colour-coded by element type (Chat / Record / Upload / Session / Other).
*   Click → **detail popup** with **Summary first** (then original text), **Created by**, attendees when a session has two or more people, view/edit (when permitted) and comments (minimize removed 2026-08-06). Edit form includes **Delete** for the same people who can edit (author, session attendees, stream admins). Documents: `0020_document_delete_rls.sql`. Sessions: `0026_session_delete_rls.sql` — confirm ungroup nested docs or delete them too. Summaries: `0028_document_summary.sql`.
*   Session popup: mark **"I Attended"**, comment, and **Edit / Delete** when permitted (title / date / inquiry / description). Dashboard Ask pane pencil is the same editor. Apply **`0023_session_edit_rls.sql`** + **`0026`**. (Standalone **My harvest** export page removed 2026-08-07 — use Commons filters / session archive instead.)
*   Private-to-owner visibility + eye icon; filters: type, date, attended, my artifacts.
*   **Comments** + admin audit log — see §5.2.
*   Existing document routes (`/sessions/documents/[id]`, archive pages) can remain as deep links until the popup UX replaces them.

### 7.4 Synthesis — Ask CLara / Knowledge Map / Top 10
*   **Ask CLara** (`/ask`) — *(Shipped.)* Grounded Q&A over the Commons with source citations. Nested under Synthesis in nav. **Follow-up thread** *(2026-08-05):* same-session conversation history in the Ask UI (client-held; still a separate pipeline from Chatbot). **Scoped Ask from dashboard map** *(2026-08-06):* map node detail shows summary/transcript + participants; asking about that element closes the overlay and continues in Ask grounded only in that document or session (`0016` RPC filters).
*   **Knowledge Map** (`/map`) — *(Shipped.)* Force-directed graph from Public Commons documents; click a node for a detail panel with a link back to its source document. Nested under Synthesis in nav. **Dashboard** map uses Commons items with the same interactive canvas plus **theme wallpapers + theme sprites** (Plant / Ocean / Desert). **`/map` keeps circles on a dark canvas** (no wallpaper / no sprites).
*   **Top 10** (`/top10`) — *(Shipped 2026-08-17.)* Nested under Synthesis. Three ranked lists (up to 10 each): **What’s humming** (topics from OKF tags + summary theme tags + map Themes/Concepts), **Spaces of difference** (summary tensions/polarities + map contrast edges), **Still asking** (summary key questions + session inquiries). Rank = how many distinct Public sources mention it. Source chips open `/sessions/documents/[id]` or `/sessions/archive/[id]`. Private and drafts stay out. No new LLM call and no shared state with Ask or Reflect — ranking lives in `src/lib/top10/`.
*   Pipelines stay separate from Chatbot — no shared prompt/state.

### 7.5 Admin — *(Shipped.)* `/admin` (stream admins only) has these sections:
*   **Metadata queue** — lists documents with `needs_review = true`. No separate "approve" action — opening a flagged document through the normal editor and saving with Title + Type filled clears the flag.
*   **Membership** — add an *existing* account to the stream by email, promote/demote member ↔ admin, remove a member. Deliberately does not create accounts or send invite email — the person must have signed in at least once already; a UI guard prevents an admin from removing/demoting themselves. **For now (2026-08-14):** new CLara accounts auto-join Camp CLAI as members (`0024`); this panel is for role changes, removals, and other streams.
*   **Isolation** — toggle for `streams.isolation_enabled` (§4.2), previously database-only.
*   **CLara prompts** *(2026-08-06; summarize 2026-08-17):* view and edit the Reflect (Chatbot), Ask CLara, and per-element summary system prompts for the active stream. Overrides live on `streams.reflect_system_prompt` / `streams.ask_system_prompt` / `streams.summarize_system_prompt` (NULL = product default in `src/lib/prompts/defaults.ts`). Reset clears the override. Admin-only for v1; pipelines stay separate. Apply **`0030`** to persist a summarize override. `/admin` sections start collapsed with Expand on the right.
*   **Map themes** *(shipped 2026-08-07):* set the stream’s **default wallpaper theme** (Plant / Ocean / Desert) and the **contribution counts** required to unlock additional themes. Product defaults: Plant free, Ocean @ 5, Desert @ 10. Unlock counting = authored Public non-draft Commons documents in that stream. Per-member theme selection and unlock popup are participant-facing (not admin-only). Apply **`0017_map_themes.sql`**.
*   **Analytics** *(2026-08-10):* `/admin/analytics` — stream-scoped Commons / membership / graph aggregates (creations by type over time, summary cards). Site-wide pageviews via **Vercel Web Analytics** (not in-app). Ask question counts later.
*   **Map & Dashboard layout** *(2026-08-10):* `/admin/map-layout` — tune force physics + node/label sizes; live preview; persist on `streams.map_layout_config` (`0022`). Applies to Dashboard map and Knowledge Map.
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
