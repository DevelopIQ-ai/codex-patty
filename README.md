# Codex Patty

**Stack all your Codex subscriptions on one machine and route every request to whichever one has headroom left.**

Patty is a local, loopback-only daemon that holds several signed-in Codex/ChatGPT subscriptions ("subs"), picks one per request based on remaining quota, health and in-flight load, streams the answer back, and meters tokens in/out per sub using the provider's own counters. It ships a web console and a CLI. No cloud service, no proxy, no credential handling — each sub lives in its own isolated `CODEX_HOME` and only the official [Codex app-server](https://developers.openai.com/codex) protocol is used.

![Codex Patty console: three stacked subs, router scores, a streamed run and per-sub token metering](docs/images/console.png)

## Try it in 60 seconds (no subscription needed)

```sh
npx codex-patty --fake=work-sub:0.82:190 --fake=personal-sub:0.55:41 --fake=team-sub:0.31:14
```

Or from a clone, which is the same thing with three demo subs pre-set:

```sh
corepack pnpm install
corepack pnpm demo
```

Open <http://127.0.0.1:3210/> and paste the one-time `cp_live_…` key the daemon printed. `--fake=<alias>[:<quotaRemaining>[:<minutesUntilReset>]]` stacks fake subs, so routing, streaming and per-sub metering are all observable without touching a real account. That's exactly what the screenshot above shows.

## Use it with real subs

Live mode is deliberately **fail-closed**: it starts only when you have attested locally that your OpenAI authorization covers running your own subscriptions this way, and only against the exact pinned `@openai/codex` version. See [docs/provider-authorization.md](docs/provider-authorization.md) for what that means and why.

```sh
export PATTY_ENABLE_LIVE_CODEX=1
export PATTY_CODEX_COMMAND=$PWD/node_modules/.bin/codex
export PATTY_CODEX_VERSION=0.145.0
export PATTY_AUTHORIZATION_EVIDENCE=$HOME/.patty/authorization.txt   # your own attestation file
export PATTY_AUTHORIZATION_SHA256=$(sha256sum $HOME/.patty/authorization.txt | cut -d' ' -f1)
npx codex-patty
```

Then add each subscription from the console's **Add sub** box (or `patty accounts add <alias>`), sign in in the browser window Codex opens, and repeat per sub. Logins live in each sub's isolated `CODEX_HOME`, so they survive restarts — the daemon re-attaches a worker to every stored sub at boot and prints what it recovered:

```
{"listening":{"address":"127.0.0.1","port":3210},"restoredSubs":["work-sub","personal-sub"]}
```

## Point any OpenAI client at your stack

Patty speaks OpenAI's chat-completions API, so anything that talks to OpenAI can drive your stacked subs with two environment variables:

```sh
export OPENAI_BASE_URL=http://127.0.0.1:3210/v1
export OPENAI_API_KEY=cp_live_...        # a key from `patty keys create puffle-prod`
```

```python
from openai import OpenAI
client = OpenAI()
print(client.chat.completions.create(model="gpt-5-codex",
      messages=[{"role": "user", "content": "hello"}]).choices[0].message.content)
```

Streaming (`stream=True`) yields standard `chat.completion.chunk` events; `usage` on the final chunk carries the provider's own counts. Every response includes an `x-patty-sub` header naming the sub that served it, and `GET /v1/models` lists each model with the subs that can serve it. Requests here route, meter and fail over exactly like `/v1/runs`.

Not yet supported: tool/function calling, `n>1`, logprobs, and images.

## Install and keep it running

```sh
npm i -g codex-patty     # or just use npx
codex-patty              # starts the daemon (alias: pattyd)
codex-patty usage        # any other argument is a CLI command (alias: patty)
```

One dependency-free package ships the daemon, the CLI and the console. To keep it up, run it under your OS supervisor — it is a plain long-running Node process that only listens on loopback:

```ini
# ~/.config/systemd/user/codex-patty.service   →  systemctl --user enable --now codex-patty
[Service]
ExecStart=%h/.local/share/npm/bin/codex-patty
Environment=PATTY_DB_PATH=%h/.patty/patty.sqlite
Restart=on-failure
[Install]
WantedBy=default.target
```

On macOS use a launchd agent with the same command. Full details, including the live-mode variables a service needs, are in [docs/operations.md](docs/operations.md).

## What it does

| | |
| --- | --- |
| **Stacking** | Any number of subs, each isolated in its own `CODEX_HOME`; add and remove them at runtime. |
| **Routing** | Per-request selection on remaining quota, health, in-flight runs and model eligibility, under a short transactional lease so two requests can't grab the same slot. Quota is read as the rolling window it is: a sub whose window has already reset counts as full again, and headroom about to expire is preferred as use-it-or-lose-it. The console names the winner and why ("most headroom, 82% vs 55% vs 31%"), so a routing decision is never a black box. |
| **Failover** | A sub that answers with a 429/usage-limit error is parked until its own reset and the run is retried on another eligible sub, before any output has streamed. |
| **Streaming** | Runs stream over SSE with sequence IDs, heartbeats, replay for late subscribers, and cancellation by the provider's own turn ID. |
| **Keys** | One named key per consumer (`patty keys create puffle-prod`), revocable independently, with usage attributed per key as well as per sub — so you can see what your prod app spent versus your laptop. |
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
