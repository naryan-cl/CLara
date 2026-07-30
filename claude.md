# Project Context
- Product: **CLara** platform. **Camp CLAI** is the first stream (domain), not the whole product.
- Source of truth: `prd-v0.4.md` (product) and `dev-plan-v0.2.md` (build roadmap). Also follow `DESIGN_GUIDE.md` for UI.
- Architecture lens: Input → Commons → Output. Chatbot (input) and Ask CLara (output) stay **separate**.
- Always scope Commons data with `stream_id`. Respect stream **isolation** when enabled.

# Communication & Teaching Persona
- DEVELOPER LEVEL: Beginner developers.
- EXPLAIN 'WHY': Explain the architectural reasoning behind every change or command before executing it.
- INCREMENTAL GUIDANCE: Break down all tasks into small, explicit steps.
- SAFE & CLEAR: Prioritize clarity and safety over speed. Verify each step before proceeding to the next.
- PAUSE FOR CONFIRMATION: Ask the user to run/test one step before moving to the next.

# Living Documents (PRD & Dev Plan)
- Treat `prd-v0.4.md` and `dev-plan-v0.2.md` as **living documents**, not one-time specs.
- After meaningful session work, update the Dev Plan **Progress & Decisions** section with: what shipped, what is in progress, blocked items, and decisions that must survive the next session.
- Update the PRD when product preferences, terminology, scope, or success criteria change — note the change in a short changelog/version line when you do.
- Prefer editing the current versioned files in place for progress notes; create a new version (e.g. v0.5) only for substantial product/architecture shifts.
- Do not rely on chat memory alone for durable facts (auth defaults, isolation choices, seed emails, phase status) — write them into the Dev Plan or PRD.

# Modular Build & Testability
- Build in **small modules** aligned to Dev Plan phases and surfaces (auth, streams, receives, listens, chatbot, ask, map, sessions, admin).
- One module at a time: implement → verify → mark progress in the Dev Plan → then continue.
- Prefer pure/helpers in `src/lib/` (and similar) that can be tested without the full UI.
- Keep UI thin; put stream scoping, OKF parsing, RAG retrieval, and isolation checks in reusable functions.
- Every new module should include a clear manual test checklist (and automated tests when a test runner exists). Fail AI/pipeline work gracefully (try/catch, no UI crash).
- Do not mix CLara Chatbot and Ask CLara pipelines, prompts, or shared mutable UI state.

# Secrets & Public Repo
- The GitHub repo is **public while we build** (Vercel Hobby multi-author deploys). Assume every commit is world-readable.
- **Never commit secrets:** `.env.local`, API keys, signing keys, service-role keys, DB passwords, tokens, real Commons/participant content.
- Only commit `.env.example` with empty/placeholder values. Real values live in Vercel / local `.env.local` only.
- Before staging files, scan for `sk-`, `signkey-`, `service_role`, connection strings with passwords, and pasted `.env` contents.
- **Flag risky territory** to the user before proceeding: real session transcripts, client-stream data, PII, audio dumps, or credentials in sample fixtures.
- If a secret may have been committed: stop, tell the user, and advise rotating the key immediately.
