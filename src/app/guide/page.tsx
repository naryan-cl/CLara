import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "User Guide — CLara",
  description:
    "How thinking moves through CLara — Add, Commons, Synthesis — and where to find each feature.",
};

const SECTIONS = [
  { id: "orientation", label: "Orientation" },
  { id: "signin", label: "Sign In & Dashboard" },
  { id: "add", label: "Add" },
  { id: "commons", label: "Commons" },
  { id: "synthesis", label: "Synthesis" },
  { id: "admin", label: "Admin" },
  { id: "reference", label: "Quick Reference" },
];

export default async function GuidePage() {
  // This page stays public either way — the check is only to decide which
  // header CTA to show. An already-signed-in visitor must never see "Login
  // with CL Account": clicking it re-runs the full sign-in flow and can
  // present a fresh Google/password prompt even though their session was
  // still fine, which reads as "the site randomly signed me out."
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex flex-1 flex-col bg-sand">
      <header className="border-b border-cloud bg-paper">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="font-display text-lg font-medium text-ink">
            CLara
          </Link>
          {user ? (
            <Link
              href="/dashboard"
              className="rounded-full border border-cloud bg-paper px-4 py-2 text-xs font-medium text-ink transition-colors hover:border-sage/50 hover:text-forest"
            >
              Back to Dashboard
            </Link>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-forest px-4 py-2 text-xs font-medium text-paper shadow-soft transition-colors hover:bg-forest-deep"
            >
              Login with CL Account
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-horizon">
          Camp CLAI stream · Colleague onboarding
        </p>
        <h1 className="mt-2 font-display text-4xl font-medium leading-tight text-ink">
          CLara User Guide
        </h1>
        <p className="mt-3 max-w-xl text-base leading-7 text-ink/70">
          How thinking moves through CLara — Add, Commons, Synthesis — and
          where to find each feature.
        </p>
        <p className="mt-4 flex items-center gap-2 font-mono text-sm font-medium text-forest">
          Add <span className="text-ink/40">→</span> Commons{" "}
          <span className="text-ink/40">→</span> Synthesis
        </p>

        <nav
          aria-label="Guide sections"
          className="mt-8 flex flex-wrap gap-2 border-y border-cloud py-4"
        >
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-pill border border-cloud bg-paper px-3 py-1.5 text-xs font-medium text-ink/70 transition-colors hover:border-sage/50 hover:text-forest"
            >
              {s.label}
            </a>
          ))}
        </nav>

        {/* 0. Orientation */}
        <Section id="orientation" eyebrow="0 · Orientation" title="What CLara is, and the one idea worth planting first">
          <H3>The Commons paradigm</H3>
          <P>
            CLara is a platform for capturing, structuring, and exploring
            collective thinking, built by Cultivating Leadership. Camp CLAI is
            the first stream (domain) on the platform — a residential/virtual
            learning event whose insight often evaporates after live
            sessions. CLara is the shared brain that holds that thinking.
          </P>
          <P>
            Unlike a private chat thread, everything added to CLara is shared
            to that stream&rsquo;s Commons by default — similar to a public
            Slack channel, not a DM. Participants can opt out or restrict
            visibility on an item-by-item basis, but the default state is
            open, visible, and collaborative.
          </P>
          <Callout label="Why lead with this">
            This is the single biggest surprise for people coming from
            private chat tools. Set the expectation before they type
            anything, not after they discover it on their own.
          </Callout>

          <H3>Terminology</H3>
          <RefTable
            rows={[
              ["CLara", "The platform (product name)."],
              [
                "Stream",
                "A domain or instance on the platform (e.g. Camp CLAI). Each stream has its own Commons, surfaces, and membership.",
              ],
              [
                "Commons",
                "The shared knowledge store for a stream, and the primary UI repository that lists chats, recordings, uploads, and sessions.",
              ],
              [
                "Add → Commons → Synthesis",
                "The architecture lens for how thinking moves through the system.",
              ],
              [
                "Add",
                "Contribution surfaces: Reflect, Record, Upload (and Session, which starts a gathering).",
              ],
              ["Synthesis", "Meaning-making surfaces: Ask CLara and Knowledge Map."],
              [
                "OKF",
                'Open Knowledge Format — standardized metadata on every Commons document. Shown in the UI simply as "Type."',
              ],
            ]}
          />
        </Section>

        {/* 1. Sign in & Dashboard */}
        <Section id="signin" eyebrow="1 · Sign In & the Dashboard" title="One stable home screen, before four Add surfaces compete for attention">
          <H3>Signing in</H3>
          <Ol
            items={[
              "Go to the CLara sign-in page and choose Google SSO or CL email + password. There is no magic-link option.",
              "Access is controlled primarily by CL email domains, with an admin exception list for externals.",
              "After signing in, new accounts are added to the Camp CLAI stream automatically. Commons access still follows stream membership — later streams will not be automatic.",
            ]}
          />
          <H3>The Dashboard</H3>
          <P>
            The Dashboard is home base: a full-bleed map of the stream&rsquo;s
            Commons contributions, with floating controls layered on top:
          </P>
          <Ul
            items={[
              "The + button opens Add — Session, Reflect, Record, Upload.",
              "The List button slides out a Commons panel without leaving the map.",
              "Ask CLara floats top-right — minimized until the first question, then expands into a scoped conversation.",
              "Selecting a session on the map expands its children with nest lines; Relate lines draw among visible items.",
            ]}
          />
          <H3>Top navigation</H3>
          <P>
            Five items, always in the same order: Dashboard · Add · Commons ·
            Synthesis · Admin. Add expands to Reflect / Record / Upload (plus
            Session first in the Add menu); Synthesis expands to Ask CLara /
            Knowledge Map. Admin is visible only to stream admins.
          </P>
          <Callout label="Try it">
            Log in and locate three things before doing anything else: the
            stream badge next to the CLara wordmark, the + (Add) button, and
            the List button.
          </Callout>
        </Section>

        {/* 2. Add */}
        <Section id="add" eyebrow="2 · Add — How Thinking Gets In" title="Four surfaces, taught in this order">
          <H3>2.1 Session — the only nesting parent</H3>
          <P>
            Session (<Code>/add/session</Code>, first in the Add menu) starts
            an intentional, multi-person gathering. It is the only Add
            surface that can nest other people&rsquo;s Reflect / Record /
            Upload contributions under one shared event.
          </P>
          <Ol
            items={[
              "The host names the gathering and adds an inquiry or short description.",
              "CLara issues a short join code, plus share links and a QR code.",
              "The host stays on a live board: Reflect / Record / Upload share icons (copy link + QR), live counts of in-progress vs. submitted contributions.",
              "Finalize is a soft close — it synthesizes everything submitted so far into a session Summary. Late Adds via the join code are still allowed afterward, and the host can refresh the synthesis.",
            ]}
          />
          <Callout label="Rule to remember">
            Solo Reflect, Record, and Upload never create a session — only
            Add → Session does. Nesting under a session always requires a
            join code (or a share/QR join link); there is no other path.
          </Callout>

          <H3>2.2 Reflect — solo conversation with CLara</H3>
          <P>
            Reflect (<Code>/add/chat</Code>) is a solo reflective conversation
            with CLara, kept on a separate pipeline from Ask CLara — no
            shared prompt or memory between the two.
          </P>
          <Ul
            items={[
              "Autosaves as a draft; Submit when the conversation feels finished.",
              "Public by default; a checkbox marks the reflection Private.",
              "Connect: the same Relate + join-code pattern as every other Add surface (below).",
            ]}
          />

          <H3>2.3 Record — mic capture to transcript</H3>
          <P>
            Record (Listens) turns browser microphone audio — optionally with
            system/tab audio — into a diarized Commons transcript (speaker
            labels and timestamps), soft-capped around three hours.
          </P>
          <Ul
            items={[
              "The title you give a recording names the recording itself — it does not create a session.",
              "On mobile, Record uses the device microphone.",
              "Same Connect chrome (Relate + join code) as Reflect and Upload.",
            ]}
          />

          <H3>2.4 Upload — bring in what already exists</H3>
          <Ul
            items={[
              'Upload a file (.md/.txt synchronously, or PDF/DOCX asynchronously) — or use "Add text," a rich-text editor stored as Markdown. Mutually exclusive on a single submission.',
              "After saving, view the formatted Markdown and edit it with the same rich toolbar.",
              "Short audio files also transcribe synchronously; longer recordings should use Record instead.",
            ]}
          />

          <H3>2.5 Connect — the pattern shared by every Add</H3>
          <RefTable
            rows={[
              [
                "Relate",
                "A user-described link to another Commons element. Creates an edge — never nests one item under another.",
              ],
              [
                "Join code",
                "The only way to nest a contribution under a Session. Comes from the session's share link or QR code.",
              ],
            ]}
          />
          <Callout label="Try it">
            Start a two-minute Session, have a neighbor join by code, and
            Finalize it — feel the whole loop once before trying Reflect,
            Record, or Upload solo.
          </Callout>
        </Section>

        {/* 3. Commons */}
        <Section id="commons" eyebrow="3 · Commons — Where It All Lands" title="Show colleagues where their contribution went">
          <H3>The repository</H3>
          <Ul
            items={[
              "Default view lists sessions and standalone Adds; a session's children stay hidden until the session is opened.",
              "Color-coded by element type: Chat, Record, Upload, Session, Other.",
              "Filters: element type, date, attended, my artifacts.",
              "Click any card to open a detail popup with view/edit (when permitted) and comments.",
            ]}
          />
          <H3>Privacy</H3>
          <P>
            Private items show a small eye icon and stay visible to their
            owner. If a private item is linked to a session, that
            session&rsquo;s attendees and the stream&rsquo;s admins can also
            read it.
          </P>
          <H3>Who can edit or delete</H3>
          <P>
            The author of the element, attendees of its linked session, and
            stream admins — the same group that can edit can also delete.
            Sessions use the same rule (host, attendees, admins, or anyone
            who authored a nested document). Deleting a session asks whether
            to ungroup nested documents or delete them too.
          </P>
          <Callout label="Why this comes right after Add">
            Colleagues just created something. Showing them immediately where
            it landed — and who can see or edit it — closes the loop while
            it&rsquo;s fresh.
          </Callout>
        </Section>

        {/* 4. Synthesis */}
        <Section id="synthesis" eyebrow="4 · Synthesis — Meaning Comes Back Out" title="Ask CLara first, then the Knowledge Map">
          <H3>4.1 Ask CLara</H3>
          <P>
            Ask CLara (<Code>/ask</Code>) is grounded question-and-answer over
            the stream&rsquo;s Commons, with source citations pointing back
            to the originating document or session. Separate pipeline from
            Reflect — no shared prompt or conversation state.
          </P>
          <H3>4.2 Knowledge Map</H3>
          <P>
            The Knowledge Map (<Code>/map</Code>) is a stream-scoped graph of
            Atoms, Concepts, Frameworks, and Themes, automatically extracted
            from public Commons documents and rendered as an interactive,
            force-directed canvas. Private documents never feed the map.
          </P>
          <Callout label="Try it">
            Ask CLara a question that can only be answered using something
            someone added earlier in the session, then find that concept as
            a node on the Knowledge Map.
          </Callout>
        </Section>

        {/* 5. Admin */}
        <Section id="admin" eyebrow="5 · Admin (Stream Admins Only)" title="Teach this last, and only to the admins in the room">
          <RefTable
            rows={[
              [
                "Metadata queue",
                'Docs flagged needs_review. Saving Title + Type through the normal editor clears the flag — no separate "approve" step.',
              ],
              [
                "Membership",
                "New accounts join Camp CLAI automatically. Admins can still add an existing account by email, promote/demote, or remove. Never creates accounts or sends invites.",
              ],
              ["Isolation", "Toggle whether the stream's Commons is visible from other streams."],
              ["CLara prompts", "Edit the Reflect and Ask CLara system prompts for this stream."],
              ["Analytics", "Stream-scoped Commons, membership, and graph aggregates."],
            ]}
          />
        </Section>

        {/* 6. Quick reference */}
        <Section id="reference" eyebrow="6 · Quick Reference" title="“Which Add do I use?”">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <Th>Situation</Th>
                  <Th>Use</Th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Kicking off a workshop where several people will contribute", "Session", "bg-forest"],
                  ["Personal reflection or thinking out loud with CLara", "Reflect", "bg-horizon"],
                  ["Capturing a live conversation or meeting by voice", "Record", "bg-sage"],
                  ["You already have notes, a document, or an audio file", "Upload", "bg-ember"],
                  ["Linking two related items without nesting", "Relate", "bg-ink/50"],
                ].map(([sit, use, color]) => (
                  <tr key={use} className="border-t border-cloud">
                    <td className="py-2.5 pr-4 text-ink/80">{sit}</td>
                    <td className="py-2.5">
                      <span
                        className={`rounded-pill px-3 py-1 font-mono text-xs font-medium text-paper ${color}`}
                      >
                        {use}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <H3>Glossary, in the product&rsquo;s own words</H3>
          <RefTable
            rows={[
              ["Stream", "A domain/instance on CLara with its own Commons and membership."],
              ["Commons", "The shared knowledge store for a stream, and the page that lists everything in it."],
              ["Session", "An intentional multi-person gathering — the only nesting parent for other Adds."],
              ["Reflect", "Solo chat with CLara for capture/reflection. Not the same pipeline as Ask CLara."],
              ["Record / Listens", "Mic capture → diarized transcript in the Commons."],
              ["Upload / Receives", "Bringing existing files or typed text into the Commons."],
              ["Ask CLara", "Grounded Q&A over the Commons with source citations. Synthesis, not Add."],
              ["Knowledge Map", "Auto-extracted graph of concepts from public Commons documents."],
            ]}
          />
        </Section>

        <footer className="mt-16 border-t border-cloud pt-6 text-sm italic text-ink/50">
          Questions after reading this guide → your stream admin.
        </footer>
      </main>
    </div>
  );
}

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-14 scroll-mt-8 border-t border-cloud pt-10">
      <p className="font-mono text-xs font-medium uppercase tracking-[0.12em] text-horizon">
        {eyebrow}
      </p>
      <h2 className="mt-1 font-display text-2xl font-medium text-ink">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-6 mb-2 text-base font-semibold text-horizon">
      {children}
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="max-w-2xl text-sm leading-6 text-ink/80">{children}</p>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-sand px-1.5 py-0.5 font-mono text-[13px] text-forest">
      {children}
    </code>
  );
}

function Ul({ items }: { items: string[] }) {
  return (
    <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6 text-ink/80">
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

function Ol({ items }: { items: string[] }) {
  return (
    <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-6 text-ink/80">
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ol>
  );
}

function Callout({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 rounded-lg border border-cloud bg-paper p-4 shadow-soft">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-forest">
        {label}
      </p>
      <p className="mt-1.5 text-sm leading-6 text-ink/70">{children}</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="pb-2 pr-4 text-left font-mono text-[11px] font-medium uppercase tracking-wide text-ink/50">
      {children}
    </th>
  );
}

function RefTable({ rows }: { rows: [string, string][] }) {
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <tbody>
          {rows.map(([term, def]) => (
            <tr key={term} className="flex flex-col border-t border-cloud first:border-t-0 sm:table-row">
              <td className="w-auto py-2.5 pr-4 align-top font-medium text-forest sm:w-40">
                {term}
              </td>
              <td className="py-2.5 align-top text-ink/70">{def}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
