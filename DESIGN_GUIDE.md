# CLara Platform — Visual Design Guide

**Version:** 0.2 (draft) · Motion §6 closed out 2026-08-06 (`--duration-ambient: 3.2s`) · Dashboard map-as-background + organic radii 2026-08-07 · Ask blob restored (phone centered, not bottom sheet) 2026-08-16 · Commons/detail phone overlay 2026-08-16  
**Direction:** Cultivating Leadership's warmth and depth, pushed toward a calm, futuristic feel.  
**Applies to:** The **CLara** product UI, including the **Camp CLAI** stream and future streams.

> ⚠️ **Color/type caveat:** I don't have CL's official brand hex codes or licensed fonts, so the palette and typefaces below are a careful *inference* from the public cultivatingleadership.com site (mountain/dusk/ocean imagery, confident serif headlines with italic emphasis, warm neutrals, generous whitespace). **Replace the tokens with CL's real brand values once you have them** — everything is defined as variables so it's a find-and-replace, not a rebuild.

---

## 1. Design intent

CL's site feels **grounded, human, and reflective** — nature photography, poetry, roomy layouts, serif headlines that speak with quiet authority. **CLara** should feel like that, **plus a sense of emergence and intelligence**: the Knowledge Map glows and breathes, CLara feels like a calm thinking partner, transitions are smooth and considered. Think *"a naturalist's field notebook meets a soft, luminous interface"* — not neon cyberpunk.

**Three words:** grounded · luminous · spacious.

**What "futuristic" means here (and doesn't):**

- ✅ Soft depth (subtle glows, gradients, glassy layers), living motion, a refined dark "map" surface, generous negative space, crisp modern sans for UI.  
- ❌ Neon-on-black, harsh gradients, sci-fi clichés, dense dashboards, aggressive animation.

---

## 2. Color

Semantic tokens first; swap the hex values for CL brand colors when available.

### Core palette (inferred)

| Token | Hex | Use |
| :---- | :---- | :---- |
| `--ink` | `#1C2A2E` | Primary text, dark headlines (deep slate-green, evokes dusk mountains) |
| `--forest` | `#2E4B45` | Primary brand / buttons / active nav |
| `--forest-deep` | `#1A2E2A` | Dark surfaces, the Knowledge Map canvas |
| `--sage` | `#7FA093` | Secondary accents, muted UI, borders on dark |
| `--horizon` | `#3E6E8E` | Cool secondary (ocean/dusk blue) — links, info |
| `--glow` | `#8FD6C4` | The "intelligence" accent — CLara presence, active map nodes, focus glows |
| `--ember` | `#C97B4A` | Warm accent for highlights/CTAs used sparingly (sunset warmth) |
| `--sand` | `#F3EEE6` | Warm off-white page background (light mode) |
| `--paper` | `#FBF9F5` | Cards / raised surfaces (light mode) |
| `--cloud` | `#E7E1D6` | Hairlines, dividers, subtle fills |
| `--success` | `#4E7C67` | Approved / published states |
| `--warning` | `#C7902F` | Pending review |
| `--danger` | `#B04A3C` | Errors / destructive |

### Surfaces

- **Light mode (default for sessions, reading, most app chrome):** `--sand` background, `--paper` cards, `--ink` text. Calm and editorial.  
- **Dark "map" mode (Knowledge Map, immersive chat, and the dashboard canvas):** `--forest-deep` canvas today, `--glow`/`--sage` nodes and lines, luminous focus states. This is where "futuristic" lives.  
- **Map theme wallpapers (Phase 7):** Plant / Ocean / Desert generative topo on the **dashboard** map (pan/zoom with nodes). Ocean is deep blue with light labels; Plant/Desert use dark ink. Themes may be lighter or darker than `--forest-deep` — **node/label/edge contrast is retuned per theme**. Floating chrome stays light `--paper` for readability.  
- **Dashboard floating chrome:** light `--paper` panels float on the dark map (Ask host, Add/List FABs, Commons list) so synthesis UI stays readable without leaving the map field.

### Gradients & glow (use sparingly)

- **Aurora accent:** `linear-gradient(135deg, var(--horizon), var(--glow))` — hero moments, active CLara states.  
- **Node glow:** soft `box-shadow: 0 0 24px rgba(143,214,196,.45)` on active/hovered concept nodes.  
- Keep gradients low-contrast and slow; never full-bleed neon.

### Contrast

All text must meet WCAG AA (4.5:1 body, 3:1 large). `--ink` on `--sand`, and `--sand`/`--glow` on `--forest-deep`, all pass — verify any new pairings with a contrast checker.

---

## 3. Typography

CL leads with a **serif** for headlines (warm, literary) and a clean **sans** for running UI. Suggested free pairing (Google Fonts) until brand fonts are confirmed:

- **Display / headlines:** *Fraunces* (soft, optical serif with an editorial, slightly futuristic character) — or *Newsreader* as an alternative. Use italics for emphasis quotes, echoing CL's site.  
- **UI / body:** *Inter* (or *General Sans* if you want more character) — neutral, legible, modern.  
- **Mono (code, source labels, subtle "system" voice):** *IBM Plex Mono* or *JetBrains Mono*, used small.

### Type scale (rem, 1rem = 16px)

| Role | Size | Weight | Font | Notes |
| :---- | :---- | :---- | :---- | :---- |
| Display | 3.0–3.75 | 400/500 | Fraunces | Hero; generous line-height ~1.1; italic allowed |
| H1 | 2.25 | 500 | Fraunces | Page titles |
| H2 | 1.75 | 500 | Fraunces | Section |
| H3 | 1.25 | 600 | Inter | Card titles |
| Body-lg | 1.125 | 400 | Inter | Reading (summaries) |
| Body | 1.0 | 400 | Inter | Default |
| Small / meta | 0.875 | 500 | Inter | Labels, dates |
| Mono-label | 0.75 | 500 | IBM Plex Mono | Source tags, "CLara" system voice, uppercase tracking |

Body line-height 1.6; measure (line length) capped ~68–72ch for summaries — CL-style readability.

---

## 4. Spacing, layout & shape

- **Spacing scale (px):** 4, 8, 12, 16, 24, 32, 48, 64, 96. Prefer roomy — this app breathes.  
- **Grid:** 12-column, max content width ~1200px; reading views ~720px.  
- **Radius:** `--radius-sm 8px`, `--radius-md 14px`, `--radius-lg 22px`, `--radius-pill 999px`. Soft, rounded — friendly, not sharp.  
- **Organic radii (dashboard floating chrome):** asymmetric multi-value radii so Ask / FABs / List / Ask button feel like soft field shapes, not identical cards. Prefer these over `clip-path` so `overflow: auto` still works. Tokens in `globals.css`: `--radius-organic-fab`, `--radius-organic-ask`, `--radius-organic-list`, `--radius-organic-btn`; utilities `.organic-fab`, `.organic-ask`, `.organic-list`, `.organic-ask-btn`.  
- **Elevation:** soft, low-spread shadows (`0 4px 24px rgba(28,42,46,.08)`); on dark surfaces use glow instead of shadow.  
- **Borders:** 1px `--cloud` hairlines in light; `rgba(127,160,147,.25)` in dark.

---

## 5. Core components

**Buttons**

- *Primary:* `--forest` fill, `--paper` text, pill or `--radius-md`; hover lightens + subtle lift.  
- *Secondary:* transparent with `--forest` border/text.  
- *AI action ("Ask CLara"):* aurora-gradient border or subtle `--glow` ring to signal intelligence.

**Concept anchor cards (dashboard):** legacy pattern — superseded by the map-as-background dashboard (Commons nodes on the canvas + floating Ask / Add / List). Keep card language for Commons list rows and repository views.

**Knowledge Map:** dark `--forest-deep` canvas with **type-colored circles** on `/map` (no wallpaper, no sprites). On `/dashboard` the map **fills the viewport under the top nav** (full-bleed) with a **Plant / Ocean / Desert** generative topo wallpaper that pans/zooms with the graph, plus **theme-matched nature sprites** (pools per Atom/Concept/Framework/Theme). Circles are the fallback if a sprite is missing. Active/hover sprites glow; pinned nodes get a contrasting ring. Labels/edges use each theme’s contrast tokens. Edges are thin **quadratic curves** through sprite centers with a faint animated flow. Optional subtle contour drift; freeze under `prefers-reduced-motion`. **Interactions (Festival harvest pattern):** scroll to zoom, drag background to pan, drag a node to **pin** it (peers reheat around it), double-click to unpin. **Theme picker** (unlocked themes) sits bottom-left on the dashboard. **Dashboard detail:** selecting a Commons node (or a List card) opens **inside** the floating Ask host — title becomes the element title, **Summary tab first** (original Transcript / Reflection / Uploaded text on the next tab), **Created by** + session **Attendees** when there are two or more people, Ask entry stays at the bottom; asking hands off to a scoped Ask thread and clears the selection. Circular **X** closes detail; documents with edit rights show a pencil that opens `DocumentEditor`. **Phone:** detail is a contained overlay filling the map view below the nav (dimmed backdrop, in-panel scroll) so it cannot paint off-screen. On `/map`, detail still overlays the canvas. Respect reduced-motion (freeze the flow).

**Commons repository (`/commons`):** click a card to open a **detail overlay** over the list (below the header on phone; centered modal on `sm+`). The shell is viewport-bounded with inner scroll — never a desktop panel that extends off-screen. Close via ✕, backdrop, or Escape.

**Dashboard floating controls:** organic **+** FAB expands to Record / Reflect / Upload; sibling **List** FAB slides an organic Commons card panel. Ask CLara is an **asymmetric organic blob** (`.organic-ask`) — top-right on desktop, **horizontally centered** above the home indicator on phone (not a full-bleed bottom sheet). Minimized (title + entry) until the first question or handoff. On desktop, the **Ask** submit button floats on the blob’s bottom edge so the organic radius does not clip it.

**CLara Chatbot (Add) & Ask CLara (Synthesis):** roomy message column; assistant messages in `--paper` bubbles with a small mono "CLARA" label. Keep the two surfaces visually related but distinct (e.g. different empty states / headers) so contribution and retrieval are not confused. **Ask CLara** shows **source chips** beneath answers (`--horizon` outline, mono label) linking to the doc/session, plus a quiet "no grounding found" state. Chatbot focuses on capture/reflection, not Commons retrieval chips.

**Session & summary:** editorial reading layout — serif title, date/facilitator meta, `Body-lg` prose, related-concept chips. Facilitator view adds a draft/publish bar.

**Status pills:** Draft (`--cloud`), Pending (`--warning`), Published/Approved (`--success`).

**Navigation:** minimal top bar — **CLara** wordmark, active **stream** badge (e.g. Camp CLAI), **Dashboard · Add · Commons · Synthesis · Admin**, and account. **Add** expands to Chat / Record / Upload; **Synthesis** expands to Ask CLara / Knowledge Map. Mobile: hamburger with the same expandable groups (nav must remain reachable below `sm`). Calm, not crowded.

---

## 6. Motion

- **Feel:** slow, eased, purposeful. Durations 200–400ms UI; ambient presence (thinking / listening / map glow) **`--duration-ambient: 3.2s`** per breath cycle (user-verified 2026-08-06). Easing `cubic-bezier(.22,.61,.36,1)`.  
- **Signature moments:** map nodes gently pulse/glow when selected **or hovered**; CLara "thinking" / Reflect "listening" show a soft breathing glow, not a spinner; content enters with fade+rise (~10px).  
- **Implementation (shipped + closed):** CSS tokens + keyframes in `src/app/globals.css`. Shared UI under `src/components/motion/`: `ThinkingPresence`, `ListeningPresence`, `FadeRise`. Motion utilities are explicit `@layer utilities` (not `@theme inline --animate-*` — that broke animations). Prefer those helpers over one-off keyframes.  
- **Out of scope for this pass:** landing hero overhaul, app-wide route transitions, Lottie characters, cursor trails.  
- **Accessibility:** honor `prefers-reduced-motion` — disable ambient/flow animation, keep only essential fades. Windows “Animation effects” off maps to reduced-motion in Chromium.

---

## 7. Imagery & icon style

- **Photography:** natural, atmospheric (landscapes, light, texture) à la CL — used as calm hero/section accents, never busy backgrounds behind text without an overlay.  
- **Icons:** thin, rounded line icons (e.g., Lucide). Consistent 1.5px stroke.  
- **Illustration/graphics:** abstract, organic-meets-network (dots, soft constellations) to bridge "nature" and "AI." Subtle.

---

## 8. Accessibility checklist

- AA contrast on all text/controls; verify new color pairings.  
- Full keyboard nav incl. the Knowledge Map (arrow between nodes, Enter to open panel).  
- Visible focus rings (`--glow` ring on dark, `--forest` on light).  
- `prefers-reduced-motion` respected everywhere.  
- Alt text on imagery; semantic headings; form labels on auth.  
- Don't rely on color alone for status — pair with text/icon.

---

## 9. Design tokens (drop-in)

### CSS variables

```css
:root {
  --ink:#1C2A2E; --forest:#2E4B45; --forest-deep:#1A2E2A; --sage:#7FA093;
  --horizon:#3E6E8E; --glow:#8FD6C4; --ember:#C97B4A;
  --sand:#F3EEE6; --paper:#FBF9F5; --cloud:#E7E1D6;
  --success:#4E7C67; --warning:#C7902F; --danger:#B04A3C;
  --radius-sm:8px; --radius-md:14px; --radius-lg:22px; --radius-pill:999px;
  --radius-organic-fab: 42% 58% 55% 45% / 48% 42% 58% 52%;
  --radius-organic-ask: 28px 48px 36px 52px / 40px 32px 48px 36px;
  --radius-organic-list: 36px 24px 44px 28px / 32px 40px 28px 44px;
  --radius-organic-btn: 18px 28px 22px 30px / 24px 18px 28px 20px;
  --shadow-soft:0 4px 24px rgba(28,42,46,.08);
  --ease:cubic-bezier(.22,.61,.36,1);
  --duration-ui:280ms;
  --duration-ambient:3.2s;
  --font-display:'Fraunces',serif; --font-sans:'Inter',system-ui,sans-serif; --font-mono:'IBM Plex Mono',monospace;
}
```

### Tailwind (v3/v4) theme extension

```javascript
// tailwind.config.js  → theme.extend
colors: {
  ink:'#1C2A2E', forest:{DEFAULT:'#2E4B45', deep:'#1A2E2A'}, sage:'#7FA093',
  horizon:'#3E6E8E', glow:'#8FD6C4', ember:'#C97B4A',
  sand:'#F3EEE6', paper:'#FBF9F5', cloud:'#E7E1D6',
  success:'#4E7C67', warning:'#C7902F', danger:'#B04A3C',
},
borderRadius:{ sm:'8px', md:'14px', lg:'22px', pill:'999px' },
fontFamily:{ display:['Fraunces','serif'], sans:['Inter','system-ui','sans-serif'], mono:['IBM Plex Mono','monospace'] },
boxShadow:{ soft:'0 4px 24px rgba(28,42,46,.08)', glow:'0 0 24px rgba(143,214,196,.45)' },
```

> Tell your AI coding agent: **"Use these design tokens as the single source of truth. Never hard-code colors; always reference the token."** That keeps the whole app consistent and makes a later brand swap trivial.
