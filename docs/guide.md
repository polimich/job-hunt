# User guide

The interface is in Czech; this guide uses the Czech names of pages and buttons.

## The flow: sort, shortlist, follow up

Opening the app lands on the first step that has something waiting.

1. **Třídit** (`/tridit`): a deck of cards, one per new posting, best match first. Each card
   shows the salary, place, work mode, a one-line summary, up to three pros and cons, the stack,
   key requirements and red flags. Swipe or use the keys: right = interested, left = not for me
   (then one tap says why: pay, stack, place, level, company, role), up = top pick (interested,
   five stars), down = later (comes back last). Tap or Enter opens the full detail, Z undoes.
   On touch screens up and down scroll the card, so top pick and later are buttons there.
2. **Výběr** (`/vyber`): what you said yes to, top picks first. Read the full summary, add a
   note, then open the application (Přihláška) prepared for it.
3. **Přihláška** (`/prihlaska/:id`): the same four steps for every company, e-mail or form:
   get to know the company, adjust the CV, write the message, send and log it. Sent ones move
   on to the usual tracking (Dnes, Tabule).
4. **Dnes** (`/dnes`): follow-ups, interviews and tasks, as before.

The pros, cons and match on the cards are the AI's, judged against "Co od práce chci" in
Settings (free text), your skills, level, town and minimum salary, and the last few postings
you passed on with a reason. Cards are made in the background once the wishes are written;
changing them remakes the cards you have not decided on. Without AI the deck still works, with
the basic facts only.

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

## Salary estimates

Each company has an estimated range, gross CZK per month, with a `basis`: `inzerát` (stated in a
posting), `Levels.fyi`, `úřad práce` (labour-office listing) or `odhad` (a guess from the market and
the type of company).
