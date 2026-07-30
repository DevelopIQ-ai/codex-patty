---
name: testing-patty-console
description: How to build, run and manually test the @patty/daemon loopback daemon and its operator console (subs, routing, token usage metering) locally.
---

# Testing the Codex Patty daemon + operator console

## Toolchain (both steps are required — defaults fail)
- Node **22.23+**: `source ~/.nvm/nvm.sh && nvm use 22`. The repo uses unflagged `node:sqlite`;
  Node 22.12 (a common default) fails to start the daemon.
- pnpm via corepack: `npm i -g corepack@latest` first — older corepack versions fail pnpm signature verification.
- Build everything: `corepack pnpm build` (runs `pnpm -r build`, ~30s).

## Running a test daemon with fake subs
```bash
rm -rf .patty   # only needed if you want a fresh one-time API key
PATTY_PORT=3211 node apps/daemon/dist/src/main.js --fake=sub-a --fake=sub-b:0.4
```
- Prints JSON on stdout with a one-time `apiKey` (`cp_live_…`). It is printed **only when the DB has no active
  key**, so either keep the key or delete `.patty/` before restarting.
- `--fake=<alias>[:<quotaRemaining>]` — the optional suffix sets `quota.remaining` (0.4 → "40%" in the UI).
- SQLite file lives at `.patty/patty.sqlite` (note: `.sqlite`, not `.db`). Read it with
  `node -e "const {DatabaseSync}=require('node:sqlite'); …"` under Node 22 for evidence
  (useful tables: `runs`, `threads`, `usage_events`, `run_events`).
- Use a distinct `PATTY_PORT` if another instance may already be running (default is 3210).

## Console
- Open `http://127.0.0.1:<port>/` (also served at `/ui`). There is **no login**: paste the `cp_live_…` key into the
  header API-key field and click **Connect**; it is cached in `localStorage` under `patty.key`, and the status text
  next to the button becomes `connected`.
- The whole console is a single inlined document in `apps/daemon/src/ui.ts` — read that file for element ids
  (`#health`, `#auth`, `#accounts`, `#router`, `#model`, `#pin-thread`, `#send`, `#run-meta`, `#output`,
  `#per-account`, `#recent`). Editing the console requires a rebuild (it is compiled into `dist`).

## Things worth knowing when asserting behaviour
- Token counts with fake subs are deterministic (`estimateUsage` in `core.ts`): `ceil(words * 1.3)`, min 1, for both
  the prompt and the `fake: <prompt>` echo. Use this to write exact expected numbers instead of "non-zero".
- Routing score is quota-dominant (`quota*.55 + health*.25 + headroom*.15 + tiny jitter`), so a
  `100%` sub beats a `40%` sub essentially always. Consequence: **thread-affinity ("keep thread") cannot be
  discriminated in the UI with unequal quotas** — both threaded and unthreaded sends land on the same sub anyway.
  To make it a real test, give both subs equal quota (e.g. `--fake=a:0.5 --fake=b:0.5`) or verify the shared
  `thread_id`/`account_id` in `.patty/patty.sqlite`.
- Persisted deltas are stored **redacted** (`{"redacted":true}`); only live SSE deltas carry text. Because the console
  subscribes to `/v1/runs/{id}/events` only after 2–3 sequential API calls, the instantaneous fake-worker delta is
  already gone and the output pane may stay empty. If you see a blank output pane, this race (not your setup) is the
  likely cause — check `curl -H "authorization: Bearer $KEY" .../v1/runs/<id>/events` to see whether the delta
  arrived redacted.
- `DELETE /v1/accounts/{id}` (the `remove` button) is a soft delete: it sets `state='removed'` and the row **stays
  visible** in the Subs and Router tables. Do not assume the row disappears.
- Auth sanity checks: `GET /` and `/healthz` are unauthenticated (HTML 200 / `{"ok":true}`); every `/v1/*` route needs
  `authorization: Bearer cp_live_…` and returns 401 otherwise.

## Devin Secrets Needed
- None for fake/`--fake` mode. Live Codex subs (the `Add sub` button) need real provider credentials plus the local
  authorization gate and cannot be tested headlessly.
