# CLara

Public-while-building Next.js app for the **CLara** platform (first stream: **Camp CLAI**).

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).
 
## Getting Started


Live: [https://clara-cl.vercel.app/](https://clara-cl.vercel.app/)

## Secrets policy (public repo)

This repository is **public during early build** so Vercel Hobby can deploy commits from multiple GitHub users. Treat every push as world-readable.

**Never commit:**
- `.env.local`, `.env`, or any filled env file (only `.env.example` with placeholders)
- API keys, signing keys, service-role keys, database passwords, tokens
- Real participant transcripts, audio, or Commons content
- Client stream data or private CL notes that aren't meant for public product docs

**OK to commit:** `.env.example` (placeholder names only), PRD/Dev Plan, app code, migrations **without** live credentials.

If a secret is ever committed: rotate it immediately (OpenAI / Inngest / Supabase / etc.) and remove it from git history if needed.

## Docs
- Product: `prd-v0.5.md`
- Build plan / handoff: `dev-plan-v0.3.md`
- UI: `DESIGN_GUIDE.md`

## Local setup

```bash
npm install
copy .env.example .env.local
# fill .env.local with your own keys — never commit it
npm run dev
```

Optional Inngest local UI (second terminal):

```bash
npm run inngest:dev
```

## Stack
Next.js (App Router) · Supabase · Vercel · OpenAI · Inngest
