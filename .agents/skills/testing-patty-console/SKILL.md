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
- Provider text is **never persisted**: `run_events` stores deltas as `{"redacted":true}`. Live text survives only in
  `Coordinator.liveTexts`, a bounded in-process buffer (64 KiB cap, dropped 60s after the run goes terminal), and the
  SSE handler substitutes it for the *first* replayed `delta` so a late subscriber still sees the current turn.
  Verifying the output pane is therefore a two-sided check: the pane should show `fake: <prompt>` **exactly once**
  (a missing `replayedText` guard would duplicate it), while the SQLite `run_events` delta row must still read
  `{"redacted":true}`. If the pane is blank, suspect the buffer/subscribe ordering rather than your setup — the console
  must start `subscribe()` concurrently with the `/v1/runs/:id` + `/v1/accounts` metadata fetches, because the fake
  worker emits its delta synchronously. Also note run-meta is composed via a `meta(base, suffix)` helper precisely so
  the concurrent stream cannot clobber the `routed to <alias>` line — assert the whole string
  `run … routed to <alias> · N in / M out tokens · completed`, not just fragments.
- `DELETE /v1/accounts/{id}` (the `remove` button) is a **soft delete**: the row stays in SQLite with `state='removed'`,
  and `/v1/accounts`, `/v1/models` and `/v1/router/status` filter it out while `/v1/usage` deliberately does not.
  So the correct expectation is asymmetric — a removed sub must vanish from the Subs and Router tables **but keep its
  "Usage per sub" row and its contribution to the Usage cards**. Test it by removing a sub that has already served a
  run; that single step catches both a tombstone regression (row lingering with a `removed` pill) and an
  over-aggressive hard-delete/cascade (usage history disappearing).
- Auth sanity checks: `GET /` and `/healthz` are unauthenticated (HTML 200 / `{"ok":true}`); every `/v1/*` route needs
  `authorization: Bearer cp_live_…` and returns 401 otherwise.

## Devin Secrets Needed
- None for fake/`--fake` mode. Live Codex subs (the `Add sub` button) need real provider credentials plus the local
  authorization gate and cannot be tested headlessly.
