# Katari

> A private, collaborative mood-board for reviewing ideas together — started for
> wedding planning, now general-purpose. (Project folder/package is still named
> `wedding-board` for continuity; only the product name changed.)

A private, collaborative image-review whiteboard for two people. Upload images
and PDFs onto an infinite tldraw canvas, arrange them freely, and review each one
with per-user 1–10 ratings, comments, and a status — all syncing live between you.

Built with **Next.js (App Router) · React · TypeScript · tldraw · Supabase · Tailwind CSS**.

---

## Architecture at a glance

- **tldraw's store is the single source of truth for canvas geometry** (positions,
  sizes, sticky notes, text, arrows, shapes). It is persisted as one JSON snapshot
  per board in `board_snapshots`.
- **Postgres tables own only review data** — `uploads`, `ratings`, `comments`,
  `status` — each keyed by the tldraw **shape id**. Geometry is never duplicated in SQL.
- **Live sync** uses Supabase Realtime: tldraw store diffs are broadcast on a
  per-board channel; ratings/comments/status changes come through Postgres change
  subscriptions.
- **Private storage**: files live in a private `uploads` bucket. Each tldraw image
  asset stores the storage *path* (prefixed `supabase://`); the app mints short-lived
  signed URLs on demand via a custom tldraw asset store, so links never go stale.

### Key files
| Path | Purpose |
|---|---|
| `supabase/schema.sql` | All tables, RLS policies, triggers, storage bucket + policies |
| `src/middleware.ts` | Session refresh + auth route guard |
| `src/lib/supabase/{client,server}.ts` | Browser / server Supabase clients |
| `src/lib/board-assets.ts` | Custom tldraw asset store (signed-URL resolver) |
| `src/lib/upload.ts` | Upload → storage → tldraw shape → `uploads` row |
| `src/lib/pdf.ts` | Renders a PDF's first page to a thumbnail |
| `src/components/Canvas.tsx` | tldraw mount, snapshot load/save, drop-upload, canvas realtime |
| `src/components/Inspector.tsx` | Ratings / comments / status panel + DB realtime |
| `src/components/BoardClient.tsx` | Board layout orchestrator |

---

## Local setup

### 1. Install dependencies
```bash
npm install
```
> This project ships an `.npmrc` that points npm at a writable cache
> (`~/.npm-wedding-cache`) because the default `~/.npm` cache on this machine had
> root-owned files. If you ever want to restore the global cache, run:
> `sudo chown -R "$(whoami)" ~/.npm`

### 2. Create a Supabase project
At [supabase.com](https://supabase.com) → New project. Wait for it to provision.

### 3. Run the schema
Supabase Dashboard → **SQL Editor → New query** → paste the entire contents of
[`supabase/schema.sql`](supabase/schema.sql) → **Run**. This creates the tables,
RLS policies, the auto-profile trigger, the Realtime publication, and the private
`uploads` storage bucket with its policies. It is safe to re-run.

Then run [`supabase/migration_links_reactions.sql`](supabase/migration_links_reactions.sql)
the same way — it adds the `links` (saved-URL cards) and `reactions` (emoji) tables,
their RLS policies, grants, and Realtime feeds. Also safe to re-run. (These are
already folded into `schema.sql` too, so a fresh project only needs `schema.sql`.)
And run [`supabase/migration_todos.sql`](supabase/migration_todos.sql) to add the
per-board to-do checklist (`todos` table). Also folded into `schema.sql`.

### 4. Configure environment variables
```bash
cp .env.local.example .env.local
```
Fill in from **Dashboard → Project Settings → API**:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 5. Run it
```bash
npm run dev
```
Open http://localhost:3000.

---

## Deploy to Vercel (so Gema can use it from her own device)

The app needs only two public env vars — there is no server secret — so deployment is simple.

### Option A — GitHub + Vercel (recommended; auto-deploys on every push)
1. Create a new **empty** repo on github.com (e.g. `wedding-board`), no README.
2. From this folder, push the code (already committed locally):
   ```bash
   git remote add origin git@github.com:<you>/wedding-board.git
   git branch -M main
   git push -u origin main
   ```
3. On [vercel.com](https://vercel.com) → **Add New… → Project** → import that repo.
   - Framework preset: **Next.js** (auto-detected). Root directory: **`./`**.
4. Add **Environment Variables** (same values as `.env.local`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. **Deploy.** You'll get a URL like `https://wedding-board.vercel.app`.

### Option B — Vercel CLI (fastest, no GitHub)
```bash
npm i -g vercel
vercel login      # opens the browser to authenticate (you do this)
vercel            # follow prompts; choose this directory
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel --prod
```

### After the first deploy — finish in Supabase
- **Auth → URL Configuration → Site URL**: set to your Vercel URL (used by email links).
- Confirm **email confirmation is off** (Auth → Providers → Email) for instant sign-ups, or Gema must click a confirmation email first.
- Have **Gema sign up** on the live URL, then open your board → **Share** → her email → Add.
- If cropped images come out blank in production, enable CORS for the `uploads` storage bucket (Storage → Settings) to allow your Vercel origin.

The publishable/anon key and project URL are browser-safe (they ship in `NEXT_PUBLIC_*`). Never put the Supabase **secret** key in this project.

---

## Manual setup checklist (things you must do in the Supabase dashboard)

- [ ] **Run `supabase/schema.sql`** in the SQL Editor (step 3 above).
- [ ] **Run `supabase/migration_links_reactions.sql`** (step 3 above) to enable
      link cards + emoji reactions on an existing board.
- [ ] **Run `supabase/migration_todos.sql`** (step 3 above) to enable the
      per-board to-do checklist in the right panel.
- [ ] **Copy the API URL + anon key** into `.env.local` (step 4).
- [ ] **Auth → Providers → Email**: ensure Email is enabled.
- [ ] **Auth → Providers → Email → "Confirm email"**: for the smoothest two-person
      local setup, you can turn *off* email confirmation so accounts work
      immediately after sign-up. (If you leave it on, each person must click the
      confirmation link before signing in.)
- [ ] **Create the two accounts**: open the app at `/login`, choose *Sign up*, and
      register each person (e.g. Nate and Gema). A `profiles` row is created
      automatically by a trigger.
- [ ] **Realtime**: the schema already adds `ratings`, `comments`, `uploads` to the
      `supabase_realtime` publication. No dashboard action needed. (Canvas sync uses
      Realtime *broadcast*, which needs no table config.)
- [ ] **Storage**: the schema creates the private `uploads` bucket and its policies.
      Confirm it exists under **Storage**.

---

## How sharing works

1. Each person signs up (creates an account).
2. One person creates a board — they become its first member.
3. On the board, click **Share**, enter the other person's email, **Add**. They must
   already have an account. They'll see the board on their home page after a refresh.

Membership = full edit access. There are intentionally no roles/permissions beyond that.

---

## Using a board

- **Upload**: drag image/PDF files straight onto the canvas, or click **Upload**.
  Each file becomes an image card at the drop point and is stored in Supabase.
- **Review**: select a card → the right-hand inspector opens. Set your rating (1–10),
  add comments, set a status (shortlisted / maybe / rejected). The average updates
  automatically. Your partner's edits appear live.
- **Whiteboard tools**: the full tldraw toolbar is available — sticky notes, text,
  arrows, rectangles, ellipses, freehand draw.
- **Saving**: the canvas autosaves (see the "Saved" indicator in the top bar). Reopen
  the board and everything is where you left it.

---

## Supported file types
`jpg`, `jpeg`, `png`, `webp`, and `pdf` (first page rendered as the card image; the
original PDF is stored and keeps its filename).

---

## Notes & known limits (MVP)

- Conflict handling for the canvas is last-write-wins, which is appropriate for two
  casual reviewers. There's no operational-transform/CRDT layer.
- Live cursors/presence are not implemented (kept out of scope). Easy to add later
  via tldraw's presence APIs over the same Realtime channel.
- Pasted images (Ctrl/Cmd-V) render and are stored, but only files added via the
  drop/upload flow get a reviewable `uploads` row.
