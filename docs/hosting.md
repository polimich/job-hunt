# Hosting

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
