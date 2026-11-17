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

1. Every open listing is re-checked. A posting that is gone is marked closed.
2. The sources switched on in Settings → Zdroje inzerátů are searched for new postings.
3. Relevant titles not in the list yet are added (for scraped sources, by reading the posting page).

Sources live in `server/sources/` and are registered in `server/sources/index.ts`. Official data and
APIs come first; HTML is read only where a portal offers nothing else.

| Source | How | Key |
|---|---|---|
| Úřad práce (MPSV) | Official open data, the whole daily vacancy file (~18 MB), downloaded once a day and slimmed into `data/cache/`; vacancies in the search town that are in a chosen CZ-ISCO group or mention a keyword are kept. A vacancy missing from the day's file counts as closed. | no |
| StartupJobs | Their JSON API: search, and per-offer detail with description and state. | no |
| jobs.cz | No API or feed exists; its search page for the town and radius is read. | no |
| Careerjet | Official partner API, Czech locale. | `CAREERJET_KEY` |
| Jooble | API; unverified, jooble.org may block it with a Cloudflare check. | `JOOBLE_KEY` |
| LinkedIn | Public guest endpoints: the town (with radius and age limit) and remote Czechia. Slow because of rate limits. | no |

What is searched is set in Settings → Hledání: keywords, town (empty = all of Czechia), radius, remote, posting age, title must-contain and exclude words (whole words, diacritics ignored), and the Úřad práce occupation groups. The automatic match score uses your skills and seniority from Settings → Profil.

Keys go into `.env` in the project root (copy `.env.example`; `.env` is not in git), then restart the
server. Prace.cz, Profesia, Indeed and others were checked and offer no usable API or feed.

New listings get a match score from a keyword heuristic (`server/score.ts`), shown with `~`.
Scores, strengths and weaknesses without `~` were assessed by hand and are never overwritten.

LinkedIn rate-limits its public endpoints, so a refresh takes several minutes. One run reads at most
40 new posting pages; postings whose text came with the search (APIs, open data) do not count.

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

Each application can have tasks (take-home with a deadline, send portfolio…); tasks due today show on
Dnes next to follow-ups. Settings has a weekly goal for sent applications; Dnes shows progress and how
many weeks in a row you reached it. The E-mail menu in the detail has intro, follow-up, thank-you and
decline templates (CZ/EN, editable in Settings), addressed to a person you added there when one has an
e-mail.

Interviews can carry their round (HR, technical, take-home…) and each has a "Do kalendáře" .ics link.
The whole calendar (interviews, next steps, tasks) is a subscribable feed at
`webcal://localhost:5174/calendar.ics` while the server runs. Upload CV versions and cover letters in
Settings → Dokumenty (stored in `data/docs/`), tick which ones went with each application, and Přehled
shows the answer rate per document.

Settings → Profil holds your skills; each posting shows what share of its stack you know and what is
missing. An application at the offer stage gets an offer card (salary, bonuses, home office, holiday,
start, answer deadline); **Nabídky** compares offers side by side, and the deadline lands in the
calendar feed. Přehled also shows the median number of days until companies answer, overall and per
source.

Roles found elsewhere (referral, recruiter, careers page) are added with **Přidat pozici**. Pasting a URL
tries to fill in title, company and text. Refresh never re-checks or closes these.

## E-mail

The **E-mail** menu on a listing opens a window with the chosen template (intro, follow-up, thank-you, declining an offer) in Czech or English, editable. **Otevřít v poště** opens it in your mail program and logs it in the history at the same time: an intro marks the listing "Odesláno", a follow-up counts as one. If you end up not sending it, the toast has **Zpět**. Attachments cannot travel in a mailto link, so download the CV from the window and drag it into the e-mail.

**Vložit přijatý e-mail…** (same menu) takes a reply you paste in, saves it in the history and, when it reads like a rejection, an interview invitation, an offer or a confirmation of your application, offers the matching status in one click. The rules are simple phrase matches in Czech and English.

### Safety

The API only answers requests from the app itself: unknown `Host` headers, foreign `Origin`s and non-JSON bodies are refused, so a web page open in another tab cannot change your data.

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

## The flow: sort, shortlist, follow up

Opening the app lands on the first step that has something waiting.

1. **Třídit** (`/tridit`): a deck of cards, one per new posting, best match first. Each card
   shows the salary, place, work mode, a one-line summary, up to three pros and cons, the stack,
   key requirements and red flags. Swipe or use the keys: right = interested, left = not for me
   (then one tap says why: pay, stack, place, level, company, role), up = top pick (interested,
   five stars), down = later (comes back last). Tap or Enter opens the full detail, Z undoes.
   On touch screens up and down scroll the card, so top pick and later are buttons there.
2. **Výběr** (`/vyber`): what you said yes to, top picks first. Read the full summary, add a
   note, then write the e-mail or open the ad and mark it as sent. Sent ones move on to the
   usual tracking (Dnes, Tabule).
3. **Dnes** (`/dnes`): follow-ups, interviews and tasks, as before.

The pros, cons and match on the cards are the AI's, judged against "Co od práce chci" in
Settings (free text), your skills, level, town and minimum salary, and the last few postings
you passed on with a reason. Cards are made in the background once the wishes are written;
changing them remakes the cards you have not decided on. Without AI the deck still works, with
the basic facts only.

## AI summaries

Every open posting gets a short Czech summary (company, role, requirements, stack, salary,
benefits, work mode, languages, contract, hiring process, and the AI's view: fit to your
profile, red flags, questions to ask). They are made by Claude Haiku through the Claude Code
CLI (`claude -p`), so they run on your Claude subscription, not on API credits: locally through
your Claude Code login, on a server through `CLAUDE_CODE_OAUTH_TOKEN`.

New postings are summarized two at a time after each refresh (about 10 s each), once
"Co od práce chci" is filled in. A posting is
summarized again only when its text changes, or when you click Přegenerovat. If the CLI is
missing, not logged in or over its limit, the queue pauses and tries again every half hour.
Turn it off in Settings (AI shrnutí inzerátů).

## Hosting

The `Dockerfile` builds one container that serves the app and the API on port 5174. Mount a
persistent volume at `/app/data`, or every redeploy starts with an empty database.

Environment variables:

- `APP_PASSWORD`: turns on the login page (one password, a 30-day cookie, a 15-minute lockout
  after 5 wrong tries). Without it there is no login, which is how `pnpm dev` runs.
- `PUBLIC_HOST`: the domain, e.g. `jobs.example.com`; the request guard refuses other hosts.
- `CLAUDE_CODE_OAUTH_TOKEN`: for the AI summaries; create it with `claude setup-token` on a machine
  where you are logged in to Claude Code. It runs on your Claude subscription.
- `CAREERJET_KEY`, `CAREERJET_USER_IP`, `JOOBLE_KEY`: optional, as in `.env.example`.

With a login, the calendar address in Settings carries a secret token, because calendar apps
cannot log in. Changing the password changes the token and signs everyone out.

To move data to a hosted copy, upload a database file to `POST /api/restore` (form field
`file`) while logged in. The current database is saved to `data/backups/` first.

## Salary estimates

Per company, gross CZK per month, in `data/companies.json`. Each has a `basis`: `inzerát` (stated in
a posting), `Levels.fyi`, `úřad práce` (labour-office listing) or `odhad` (a guess from the market and
the type of company). Edit the file to correct them.
