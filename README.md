# Job hunt

Local dashboard for a job search: listings with full text, match score, salary estimate per company,
contacts, your own status and notes, and a refresh that re-checks listings and finds new ones.

## Run

```sh
pnpm install
pnpm dev        # app on http://localhost:5173, API on http://localhost:5174
```

Other commands:

| Command | What it does |
|---|---|
| `pnpm refresh` | Re-check open listings and search for new ones, from the terminal |
| `pnpm refresh --check-only` | Only re-check the listings already in the list |
| `pnpm test` | Unit tests |
| `pnpm typecheck` | Type check |
| `pnpm build && pnpm start` | Built app and API together on http://localhost:5174 |

## Where things live

- `data/jobhunt.db` – the SQLite database (Node's built-in `node:sqlite`, no native module). Schema and
  migrations in `server/db.ts` (versioned with `PRAGMA user_version`), queries in `server/store.ts`.
  Tables: `listings`, `companies`, `state` + `events` (your statuses and history), `runs`, `settings`.
  `data/` is not in git: it is personal and rolling back code should not roll back your notes.
- `server/` – local API (Hono) and the refresh job. `server/sources/` has one scraper per job board.
- `src/` – Vue 3 app. `filters.ts` and `search.ts` hold the filtering and full-text search logic.
  UI is Tailwind v4 + [shadcn-vue](https://www.shadcn-vue.com) (Reka UI): generated components live in
  `src/components/ui/` (add more with `pnpm dlx shadcn-vue@latest add <name>`), theme tokens in `src/styles.css`
  (cream surfaces, coral accent, one pastel per status as `--st-<status>-bg/-fg/-dot`, Bricolage Grotesque
  headings + Figtree body, animation utilities). Confetti for interview/offer/accepted is in `src/lib/celebrate.ts`.
- `shared/types.ts` – data types used by both sides.

## How refresh works

1. Every open listing is fetched again. A posting that is gone is marked closed.
2. LinkedIn, jobs.cz and StartupJobs are searched with the keywords from Settings, for Brno and remote Czechia.
3. Titles that look relevant and are not in the list yet are read and added.

New listings get a match score from a keyword heuristic (`server/score.ts`), shown with `~`.
Scores, strengths and weaknesses without `~` were assessed by hand and are never overwritten.

LinkedIn rate-limits its public endpoints, so a refresh takes several minutes. One run reads at most
40 new postings; the rest arrive on the next run.

## Tracking applications

Pages: **Dnes** (`/`, what is due today, upcoming interviews, interesting roles not sent yet),
**Pozice** (the list), **Tabule** (board by status, drag cards between columns), **Přehled** (sent per
week, answer rate, funnel, results per source).

Statuses: Nové → Zajímá mě → Odesláno → V jednání → Pohovor → Nabídka → Přijato, and the endings
Nechci (you), Zamítli (they), Bez odpovědi (ghosted), Uzavřeno (posting gone, set by refresh). The rules
live in `shared/pipeline.ts`:

- Moving to Odesláno stamps the date and plans a follow-up after `followUpDays` (Settings, default 7).
- Writing down an interview in the history moves the role to Pohovor and plans a thank-you the day after.
- After two follow-ups without an answer, the app offers to mark the role Bez odpovědi.

Per application you can also rate how much you want it (1–5 stars, sortable and filterable), add your
own labels, note who referred you (counts as source "Doporučení" in the stats), and keep the people at
the company (recruiter, hiring manager…) whom history entries can name.

Roles found elsewhere (referral, recruiter, careers page) are added with **Přidat pozici**. Pasting a URL
tries to fill in title, company and text. Refresh never re-checks or closes these.

## Keyboard (list page)

`j` / `k` next and previous · `i` interested · `a` sent · `v` talking · `p` interview · `f` offer ·
`x` not for me · `z` they said no · `g` no answer · `n` back to new · `o` open posting · `Enter` full text ·
`e` e-mail draft · `/` search · `?` help

## Backups and the daily refresh

While the server runs, it writes a copy of the database to `data/backups/jobhunt-YYYY-MM-DD.db` once a
day (`VACUUM INTO`, safe while the app is writing) and keeps the last 30. Settings → Data has "Zálohovat
teď" and exports: CSV for a spreadsheet, JSON with everything. To restore, stop the server and copy a
backup over `data/jobhunt.db` (delete `jobhunt.db-wal` and `jobhunt.db-shm` next to it).

The first start after the switch to SQLite imported the old `data/*.json` files and moved them to
`data/legacy-json/`.

With **Obnovovat inzeráty jednou denně** on (Settings), the server also starts a refresh by itself
between 7:00 and 23:00 when the last one is over 20 hours old.

## Salary estimates

Per company, gross CZK per month, in `data/companies.json`. Each has a `basis`: `inzerát` (stated in
a posting), `Levels.fyi`, `úřad práce` (labour-office listing) or `odhad` (a guess from the market and
the type of company). Edit the file to correct them.
