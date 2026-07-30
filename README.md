# Codex Patty

**Stack all your Codex subscriptions on one machine and route every request to whichever one has headroom left.**

Patty is a local, loopback-only daemon that holds several signed-in Codex/ChatGPT subscriptions ("subs"), picks one per request based on remaining quota, health and in-flight load, streams the answer back, and meters tokens in/out per sub using the provider's own counters. It ships a web console and a CLI. No cloud service, no proxy, no credential handling — each sub lives in its own isolated `CODEX_HOME` and only the official [Codex app-server](https://developers.openai.com/codex) protocol is used.

![Codex Patty console: three stacked subs, router scores, a streamed run and per-sub token metering](docs/images/console.png)

## Try it in 60 seconds (no subscription needed)

```sh
corepack pnpm install
corepack pnpm build
node apps/daemon/dist/src/main.js --fake=work-sub:0.82 --fake=personal-sub:0.55 --fake=team-sub:0.31
```

Open <http://127.0.0.1:3210/> and paste the one-time `cp_live_…` key the daemon printed. `--fake=<alias>[:<quotaRemaining>]` stacks fake subs, so routing, streaming and per-sub metering are all observable without touching a real account. That's exactly what the screenshot above shows.

## Use it with real subs

Live mode is deliberately **fail-closed**: it starts only when you have attested locally that your OpenAI authorization covers running your own subscriptions this way, and only against the exact pinned `@openai/codex` version. See [docs/provider-authorization.md](docs/provider-authorization.md) for what that means and why.

```sh
export PATTY_ENABLE_LIVE_CODEX=1
export PATTY_CODEX_COMMAND=$PWD/node_modules/.bin/codex
export PATTY_CODEX_VERSION=0.145.0
export PATTY_AUTHORIZATION_EVIDENCE=$HOME/.patty/authorization.txt   # your own attestation file
export PATTY_AUTHORIZATION_SHA256=$(sha256sum $HOME/.patty/authorization.txt | cut -d' ' -f1)
node apps/daemon/dist/src/main.js
```

Then add each subscription from the console's **Add sub** box (or `patty accounts add <alias>`), sign in in the browser window Codex opens, and repeat per sub. Logins live in each sub's isolated `CODEX_HOME`, so they survive restarts — the daemon re-attaches a worker to every stored sub at boot and prints what it recovered:

```
{"listening":{"address":"127.0.0.1","port":3210},"restoredSubs":["work-sub","personal-sub"]}
```

## What it does

| | |
| --- | --- |
| **Stacking** | Any number of subs, each isolated in its own `CODEX_HOME`; add and remove them at runtime. |
| **Routing** | Per-request selection on remaining quota, health, in-flight runs and model eligibility, under a short transactional lease so two requests can't grab the same slot. The console shows every score input, so a routing decision is never a black box. |
| **Streaming** | Runs stream over SSE with sequence IDs, heartbeats, replay for late subscribers, and cancellation by the provider's own turn ID. |
| **Metering** | Tokens in / cached in / out / reasoning out / total, per run and per sub, taken from the provider's `thread/tokenUsage/updated` telemetry rather than estimated. Latest snapshot per run wins, so repeated updates never double-count. |
| **Thread affinity** | Pin a conversation to the sub that started it so multi-turn context isn't lost to routing. |
| **Console + CLI** | One static loopback page for humans; `patty accounts|models|usage|status|doctor` and a JSON API for everything else. |
| **Privacy** | Prompts and outputs are never persisted — SQLite keeps aliases, quota snapshots, run metadata and token counts only. Patty never reads `auth.json`, moves OAuth tokens, or calls private endpoints. |

## Layout

```
apps/daemon    router, store, SSE coordinator, Codex app-server adapter, console
apps/cli       patty CLI
packages/contracts        shared types + OpenAPI description
packages/codex-protocol   schemas generated from the official app-server protocol
```

Read [architecture](docs/architecture.md) for the design decisions, [api](docs/api.md) for the HTTP surface, [operations](docs/operations.md) for running it, and [security](docs/security.md) for the boundary.

## Development

```sh
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm openapi:lint
corepack pnpm test:unit && corepack pnpm test:contract && corepack pnpm test:integration && corepack pnpm test:e2e:fake
```

Node >=22.5 is required (the store uses `node:sqlite`). Contract tests run against fixtures generated from the official 0.145.0 protocol schemas, so they fail loudly when Patty drifts from the provider's shapes. `test:live` is opt-in and needs real subs plus the authorization gate above.

Issues and PRs welcome — especially routing strategies, cost views, and adapters. MIT licensed.
