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

## Demo mode, named keys, filters, metrics and packaging (PRs #6–#9)
- Fastest full-console setup: `corepack pnpm demo` = build + three fake subs with distinct quota/reset
  (`--fake=work-sub:0.82:190 --fake=personal-sub:0.55:41 --fake=team-sub:0.31:14`) on the default port 3210.
  `--fake=<alias>[:<quota>[:<resetMinutes>]]`. Delete `.patty` first if you need a fresh one-time key, and check
  `ss -ltnp` for a stale daemon holding the default DB before assuming the URL is broken.
- Router explanation (`#routing-why`) reads `next request routes to <alias> — most headroom (a% vs b% vs c%)` and only
  appends the `use-it-or-lose-it` clause when the winner is *also* the soonest to reset — with 82/55/31 it must be
  absent, which is a good discriminator against an always-append implementation.
- With unequal quotas every request goes to the highest-quota sub, even six concurrent ones (fake runs finish before
  the 2-run lease overlaps), so multi-sub run history for the **sub filter** cannot be produced by spamming
  `/v1/chat/completions`. Pin runs instead: `POST /v1/runs {model, input, accountId}` with ids from `/v1/accounts`.
- Named keys: `#key-name` + **Create key** shows the secret once in `#issued`; `Store.keys()` never selects the hash,
  so the table only ever shows `cp_live_<prefix>_…`. Reload the page to prove it is not re-listed. Note the one-time
  line **does** put the full secret on screen — if you are recording, expect it in the video, revoke the key at the end
  and keep it out of screenshots/reports. Run history labels named keys by name but unnamed ones by raw `key_…` id,
  while "Usage per key" shows `cp_live_<prefix>` — cosmetic inconsistency, not a bug.
- Revoking is asymmetric like sub removal: `revoked` state + 401 for that secret, but its "Usage per key" row and
  history stay; Doctor's `active_keys` count drops, so it reflects live state.
- The history **limit** select's smallest option is 25, so with <25 runs it cannot demonstrate truncation — verify the
  wired parameter directly (`GET /v1/runs?limit=2`) and say so rather than claiming a UI pass.
- `/metrics` needs the bearer key (401 otherwise) and returns `text/plain; version=0.0.4`. Strongest assertion is
  cross-checking a label against the UI, e.g. `patty_key_tokens_total{key="puffle-prod"}` == that key's UI total.
- Packaging: `corepack pnpm pack:npm` → `dist-npm` (no `node_modules`); `node dist-npm/bin/codex-patty.mjs` with no
  args / `start` / `up` / `--…` starts the daemon, any other word (e.g. `usage`) delegates to the packed CLI with
  `PATTY_URL`/`PATTY_API_KEY`. Always give it its own `PATTY_PORT` + `PATTY_DB_PATH` so it cannot reuse the demo DB,
  and confirm the CLI output really came from that daemon (alias/run count).
- Bind guard is startup-time only (`assertBindable`): wildcard (`0.0.0.0`, `::`, empty) always throws
  "refusing to bind a wildcard address", and a non-loopback host without `PATTY_ALLOW_NON_LOOPBACK=1` throws
  "refusing to bind <host>: loopback is the default". Never attempt a *successful* non-loopback bind on a shared box.
  Watch out: a bare `nvm use 22` can silently fail ("No .nvmrc file found") and leave you on Node 22.12, whose
  `node:sqlite` error looks like a crash unrelated to the guard — check `node -v` before interpreting failures.

## Live Codex mode (real ChatGPT subs)
Live mode is gated fail-closed by `PattyDaemon.liveCodexCommand()`: it returns a command only when
`PATTY_ENABLE_LIVE_CODEX=1`, `PATTY_CODEX_VERSION=0.145.0`, `PATTY_CODEX_COMMAND` is set, and the file at
`PATTY_AUTHORIZATION_EVIDENCE` hashes to `PATTY_AUTHORIZATION_SHA256`. A launcher script exporting those plus
`PATTY_DB_PATH`/`PATTY_ACCOUNT_HOME_ROOT` (e.g. `run-patty-live.sh` writing to `~/.patty-live/`) is the practical way to
run it; keep live state in its own DB/home root so fake-mode testing cannot clobber real logins.
- **Never click `remove` on a live sub.** `removeAccount` calls `adapter.logout()` and `rmSync(home)` — it destroys the
  real ChatGPT login, and re-adding it needs an interactive browser sign-in. Test removal with fake subs only.
- Live runs cost the user's real quota. Agree a hard run cap up front, keep prompts tiny (`Reply with exactly: ok`) and
  pick the cheapest real model in the list (e.g. a `*-mini`).
- Real usage is provider-reported, not `estimateUsage`: a two-word prompt still bills ~10k–13k input tokens because of
  the Codex system prompt, plus non-zero `cachedInputTokens`/`reasoningOutputTokens`. So a five-figure `N in` is itself
  proof you hit a real provider rather than the fake worker. The strong assertion is **arithmetic reconciliation**:
  snapshot `/v1/usage` before the run, then check card totals == baseline + the exact `N in / M out` from the run-meta
  line, `runs` +1, and only the routed sub's per-sub row changing.
- Readiness does **not** require `!requiresOpenaiAuth`. A genuinely signed-in codex 0.145.0 account using ChatGPT
  tokens (`auth.json` has `tokens.access_token` with `OPENAI_API_KEY: null`) reports `requiresOpenaiAuth: true`, so
  `waitForAccount` keys off the `account` object alone. If live subs are stuck in `pending_login` with empty model
  lists, suspect that condition rather than the login itself.
- Restart restore: `restoreCodexAccounts()` runs before `listen()` and re-attaches an app-server worker to every
  persisted non-removed sub whose home dir still exists, printing `restoredSubs` in the startup JSON; a sub whose
  worker fails to start becomes `reconnect_required`. To test it, restart the daemon and assert the startup line lists
  **all** logged-in aliases and that they return `ready` with real models/quota — then send a run to confirm the
  restored worker is functional, not merely labelled ready. Restarting is safe (DB, homes and the API key persist), but
  note `restoredSubs` only lists subs that existed at boot: a sub added *after* startup will be missing from an older
  log line, which is expected, not a bug.
- Killing the daemon with `pkill -f "dist/src/main.js"` also matches and kills the shell running the command (exit
  -1). Run the `pkill` in its own call, verify with `pgrep -af 'dist/src/mai[n].js'`, then start the replacement with
  `setsid nohup … > /tmp/patty-live.log 2>&1 &` and give it ~15–20s for the workers to hand back model/quota data.
- When checking the browser console for errors after live login work, remember the ChatGPT sign-in tab is a noisy
  third-party page (Statsig/Datadog/Turnstile "Failed to fetch" errors). Re-read the log in a fresh tab that only
  loaded `http://127.0.0.1:<port>/` before blaming the console.

## Tiered routing (primary vs fallback)
- `--fake=<alias>[:<quota>[:<minutesUntilReset>[:<tier>]]]` — the 4th field stacks a `fallback` sub, e.g.
  `--fake=api-credit:1::fallback`. Codex and fake subs default to `primary`; `POST /v1/accounts/openai-compatible`
  defaults to `fallback` and takes `"tier"`.
- The discriminating assertion is a fallback sub with the **highest** score staying idle: give it `1` quota against
  primaries at `0.62`/`0.41`, then check `x-patty-sub` names a primary. A plain score sort would pick the fallback,
  so this is what proves tiers are not scored against each other.
- Forcing a primary sub ineligible: write a future `cooldown_until` on the `accounts` row. Editing `quota` in SQLite is
  unreliable — the fake adapter re-snapshots it, so the Subs table keeps showing the original percentage. Cooldown is
  the dependable lever; expect Router `Eligible` to read no and the explanation to name the spillover.
- `GET /v1/router/status` reports `tier`, `state` and `servable` (quota/cooldown eligibility against the sub's own
  models, independent of any `?model=` filter — the console's Eligible column reads `servable`, not `eligible`).
  `/metrics` exposes `patty_sub_servable{sub,tier}`, which is the cleanest signal that spillover has started.
- Cross-tier 429 failover has no runtime fault-injection hook; it is covered by `FakeAdapter.failNext` in
  `test/integration.test.ts` rather than through the console.

## Per-API-key admission control (rpm / concurrency)
- Limits live in SQLite (`api_keys.rpm` / `.concurrency`), so the restart-persistence assertion needs a
  **file-backed** DB: `PATTY_DB_PATH=/tmp/<dir>/patty.sqlite`. Relaunch with the *same* `--fake=` arguments,
  otherwise the fake subs come back `reconnect_required` and it looks like a restore bug.
- `PUT /v1/api-keys/{id}/limits` replaces the whole policy; the console's Req/min and Concurrent inputs PUT both
  fields on every change. The discriminating assertion is clearing one field: `/metrics` should drop only
  `patty_key_limit_rpm{key=…}` while `patty_key_limit_concurrency{key=…}` survives.
- **A concurrency queue is invisible against the built-in fake worker** — it settles synchronously, so a burst never
  shows `queued>0`. Stack a slow OpenAI-compatible provider instead (a ~4 s `chat/completions` + a `/models` route is
  enough; a fixture exists at `/tmp/slowprovider.mjs`, port 4320) and send that sub's model. The adapter snapshots the
  provider at add time and requires the env var named by `apiKeyEnv` to exist in the *daemon's* env (e.g.
  `SLOW_KEY=sk-local-placeholder`), or the add returns `invalid_request`.
- Expect completion times in bands: with `concurrency:N` against a 4 s provider, a burst finishes N at a time every
  ~4 s and every request returns 200. `Load now` renders `"<inFlight> running · <queued> queued"` in red only while
  requests are actually waiting, so refresh the console 1–2 s into the burst — refresh late and you only see
  `N running`.
- Every rpm assertion needs a **freshly created key**: the rolling 60 s window counts all requests already started by
  that key, so a reused key is instantly over a small limit. With `rpm:2`, requests 3+ are denied immediately (the
  ~60 s wait exceeds `PATTY_KEY_QUEUE_WAIT_MS=20000`) and return 429 + integer `Retry-After` + `error.retryAfterMs`.
- Per-sub concurrency (`active 0/2`) is a *separate* gate from per-key limits. If only one sub serves the model you
  are hammering, an unlimited key's request can be rejected with `400 invalid_request` because no sub is servable —
  don't misread that as a key-limit failure. For key-isolation tests, keep the saturated key's concurrency below the
  sub's cap (e.g. `1`) so the second key still has a sub slot.
- openai-compatible runs used to record Model `—` and 0 tokens in Run history; as of the cost work they are metered
  from the provider's own `usage` block (e.g. 42 in / 11 out shows up per run). If you see `—`/0 again, that is a
  regression, not expected behaviour.

## Tool/function calling (`/v1/chat/completions`)
- There is **no console UI path for `tools`** — the Inference box cannot send them. Verify tool calling with
  authenticated shell requests plus SQLite reads, and use Run history only to show which sub served the tool runs.
- Use a tool-capable fixture provider (see `/home/ubuntu/tool-provider.mjs`: model `tooly-1`, streams the arguments in
  **two** SSE fragments). The split fragments are the discriminator: a non-assembling implementation yields truncated
  or duplicated `arguments`, so assert the exact assembled JSON string, not just that `tool_calls` exists.
- Expected non-streaming shape: `message.content: null`, `message.tool_calls[...]`, `finish_reason: "tool_calls"`.
  Streaming emits an extra chunk with index-stamped `choices[0].delta.tool_calls` before the `finish_reason` chunk.
- Redaction: `run_events` rows of type `delta` **and** `tool_calls` must store exactly `{"redacted":true}`. Query the
  `data` column (not `payload`), and use single-quoted SQL literals — `"tool_calls"` is parsed as an identifier.
  A good leak check is `SELECT count(*) FROM run_events WHERE data LIKE '%<arg value>%' OR data LIKE '%<fn name>%'`.
- Capability gating: only subs advertising `tools` are eligible; otherwise the API returns non-retryable
  `400 model_unavailable`. To test it, rewrite the account's capabilities in SQLite to drop `tools`, then prove the
  same model **without** `tools` still returns 200 — otherwise you have only proven the provider is dead. Restore
  `["chat","tools"]` afterwards.

## Cost / $ view and `PATTY_PRICES`
- Console cost cards are `#t-saved` (absorbed by your subs), `#t-api` (spent on API fallback), `#t-cost` (estimated
  total) and the `#cost-note` sentence; `#per-account` and `#per-key` gain an `Est. cost` column with a
  `+N unpriced` badge.
- A model with no price must be reported as **unpriced**, never `$0`: `cost.unpricedRuns`/`unpricedModels` populated and
  each such run's `estimatedCostUsd: null`. A fixture model like `tooly-1` is unpriced by default, which makes the
  unpriced state easy to produce; the priced state needs `PATTY_PRICES`.
- Prices are **USD per million tokens** and are loaded once at `Store` construction, so `PATTY_PRICES` changes require a
  daemon restart — restart against the same `PATTY_DB_PATH` so existing usage rows get re-priced.
- Put a shorter decoy prefix in the prices file (e.g. `"tooly"` at an absurd rate alongside `"tooly-1"`) to prove
  longest-prefix-wins; a wrong implementation produces a cost ~100x off.
- Cached input is priced at `cachedInput` for the cached portion and `input` for the remainder. No fixture reports
  cached tokens, so insert a synthetic `usage_events` row (e.g. 1,000,000 input / 400,000 cached / 0 output) and assert
  the exact figure (with 1.25/0.125 that is `$0.80`; `$1.25` means cached billed at full rate, `$0.75` means ignored).
  Delete the row afterwards — it also shows up as an `unattributed` key row in Usage per key.
- Tier decides the bucket: `primary` cost → `subscriptionUsd` (list-price-equivalent, not spend), `fallback` → `apiUsd`.
  Cross-check `/metrics` `patty_estimated_cost_usd_total{sub,tier}` and `patty_unpriced_runs` against the cards.
- A malformed prices file must fail at boot: the process exits non-zero with `price for <model> needs numeric input and
  output` and never listens. Assert the port is closed too, so a silent fallback to the built-in table cannot pass.

## Devin Secrets Needed
- None for fake/`--fake` mode.
- Live mode needs no Devin secret, but does need operator-supplied material that cannot be self-served: real logged-in
  Codex account homes, the authorization-evidence file plus its `PATTY_AUTHORIZATION_SHA256`, and the daemon's
  one-time `cp_live_…` API key. Ask for those (and for a live run budget) rather than attempting an `Add sub` login,
  which requires an interactive browser sign-in.
