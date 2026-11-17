# Sources and refresh

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
