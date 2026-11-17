# AI summaries and application kits

Both are optional and run through the Claude Code CLI on the owner's Claude subscription.

## AI summaries

Every open posting gets a short Czech summary (company, role, requirements, stack, salary,
benefits, work mode, languages, contract, hiring process, and the AI's view: fit to your
profile, red flags, questions to ask). They are made by Claude Haiku through the Claude Code
CLI (`claude -p`), so they run on your Claude subscription, not on API credits: locally through
your Claude Code login, on a server through `CLAUDE_CODE_OAUTH_TOKEN`.

New postings are summarized three at a time after each refresh (about 15 s each), once
"Co od práce chci" is filled in. When only the wishes change, postings that already have a
summary are just judged again (pros, cons, match: about 7 s each), and the deck shows cards
as soon as the first one is ready. A posting is
summarized again only when its text changes, or when you click Přegenerovat. If the CLI is
missing, not logged in or over its limit, the queue pauses and tries again every half hour.
Turn it off in Settings (AI shrnutí inzerátů).

## Application kits

Every posting on the shortlist gets an application kit, made in the background by Claude Sonnet
(about a minute each, two at a time), once "Můj profil" in Settings is filled in:

- **Company research** from the web: what they do, product, engineering, recent news, who
  hires, things to refer to, with source links. Kept per company for 30 days.
- **Drafts** in the posting's language: the e-mail (subject "Name – exact title", 3–5 sentences
  in the body), answers for forms (message, why us, about me, start date, salary), a LinkedIn
  note.
- **CV advice**: a summary for the top of the CV, what to move up, the posting's keywords you
  have and those you lack. Edit the advice, then "Vygenerovat CV na míru" writes a CV from your
  profile along it; `/cv/:id` shows it as a plain one-column page to save as PDF (text, so
  application systems can read it).
- **First call**: what they will likely ask, what to know, what to ask.

The drafts are a starting point: recruiters spot unedited AI text, so rewrite them in your own
words. Everything about you comes only from "Můj profil" (the button there reads a first
version from an uploaded CV); what is missing shows up as `[doplň: …]` and in a list of gaps,
never invented. The start date goes into every draft, the salary only where it is asked for.

Two separate calls keep this safe. The one that searches the web (WebSearch only, no page
fetching from the server) is told nothing about you, only the company and the posting. The one
that writes gets your profile and no tools. Reading the CV runs in an empty folder holding only
a copy of that file. Turn kits off in Settings (Připravovat přihlášky pro Výběr); `KIT_MODEL`
changes the model.
