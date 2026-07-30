# Codex Patty

**Stack all your Codex subscriptions on one machine and route every request to whichever one has headroom left.**

Patty is a local, loopback-only daemon that holds several signed-in Codex/ChatGPT subscriptions ("subs"), picks one per request based on remaining quota, health and in-flight load, streams the answer back, and meters tokens in/out per sub using the provider's own counters. It ships a web console and a CLI. No cloud service, no proxy, no credential handling — each sub lives in its own isolated `CODEX_HOME` and only the official [Codex app-server](https://developers.openai.com/codex) protocol is used.

![Codex Patty in 20 seconds: three stacked subs plus an API-credit fallback, the router explaining its choice, a request routed and answered, and tokens metered per sub](docs/images/demo.webp)

<sub>Three fake subs and an API-credit fallback, live: quota windows, the router naming the winner and why, a request routed to `codex-work`, and its tokens metered. Reproduce it with `corepack pnpm demo`.</sub>

![Codex Patty console: three stacked subs, router scores, a streamed run and per-sub token metering](docs/images/console.png)

## Setup

Hand this to your coding agent (Codex, Claude Code, Cursor, aider — anything with a shell). It sets Patty up, proves it works without touching a real account, and stops before anything that needs your hands.

````text
Set up codex-patty (https://github.com/DevelopIQ-ai/codex-patty) on this machine for me.

1. Check `node -v` is >= 22.5 — the store uses `node:sqlite` and older Node fails with
   "No such built-in module: node:sqlite". If it is older, install Node 22 (nvm, volta,
   brew, whatever this machine already uses) and use it for everything below.
2. Start it with three fake subs so nothing real is touched:
       npx codex-patty --fake=work-sub:0.82:190 --fake=personal-sub:0.55:41 --fake=team-sub:0.31:14
   The daemon prints a one-time `cp_live_…` API key on its first line. Save it — it is
   shown once. It listens on http://127.0.0.1:3210 and nothing else can reach it.
3. Prove it end to end with that key:
       curl -s http://127.0.0.1:3210/v1/models -H "authorization: Bearer $KEY"
       curl -s http://127.0.0.1:3210/v1/chat/completions -H "authorization: Bearer $KEY" \
         -H 'content-type: application/json' \
         -d '{"model":"gpt-5-codex","messages":[{"role":"user","content":"hello"}]}' -i
   Report back the answer and the `x-patty-sub` response header, which names the sub that
   served it. Then open http://127.0.0.1:3210/ and paste the key into the console.
4. Tell me the two env vars to point any OpenAI client at it:
       OPENAI_BASE_URL=http://127.0.0.1:3210/v1
       OPENAI_API_KEY=<the cp_live_… key>
   and create a named key per consumer with `patty keys create <name>`.
5. Then STOP and tell me these two things need me, because you cannot do them:
   - Adding my real subscriptions: live mode is fail-closed and needs
     PATTY_ENABLE_LIVE_CODEX=1, a pinned PATTY_CODEX_COMMAND/PATTY_CODEX_VERSION, and an
     authorization-evidence file I write and attest to myself
     (see docs/provider-authorization.md). Each sub then signs in through a browser.
   - Keeping it running as a service, if I want that (docs/operations.md), or putting it
     on an always-on box for an app to use (docs/deploy.md).

Rules: do not weaken the loopback default, do not create the authorization-evidence file
on my behalf, and do not put any API key in a file you commit.
````

Doing it by hand is the same four lines: `npx codex-patty --fake=…` (or `corepack pnpm install && corepack pnpm demo` from a clone), open <http://127.0.0.1:3210/>, paste the printed key. `--fake=<alias>[:<quotaRemaining>[:<minutesUntilReset>]]` stacks fake subs, so routing, streaming and per-sub metering are all observable without touching a real account — that is exactly what the animation above shows.

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

**Tool calling works** — pass `tools` and `tool_choice` as you would to OpenAI, and a turn that calls one comes back with `finish_reason: "tool_calls"`, `content: null` and the assembled `tool_calls` (streaming emits them in a delta first). Because tool calling is a provider capability rather than something Patty can fake, only subs whose provider honours it are eligible for such a request; if nothing stacked can serve the model with tools, you get a plain `400 model_unavailable` instead of a silently toolless answer. Tool calls are content, so they are never written to the store — only the fact that a call happened.

Not yet supported: `n>1`, logprobs, and images.

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

Patty listens on loopback only unless you explicitly opt in (`PATTY_ALLOW_NON_LOOPBACK=1` plus a specific `PATTY_HOST`; wildcards are always refused). On macOS use a launchd agent with the same command. Full details, including the live-mode variables a service needs, are in [docs/operations.md](docs/operations.md).

To run it on a box and point an app at it — one always-on machine, subs logged in over an SSH tunnel or device code, reachable over a tailnet or behind TLS — follow [docs/deploy.md](docs/deploy.md). Serverless platforms can't host Patty itself (each sub is a long-lived process with a logged-in home on disk), but they make perfectly good clients of it.

## What it does

| | |
| --- | --- |
| **Stacking** | Any number of Codex subs, plus any OpenAI-compatible endpoint (OpenAI, OpenRouter, Together, a local Ollama) via `POST /v1/accounts/openai-compatible` with the key referenced by env-var name, never stored. Any number of subs, each isolated in its own `CODEX_HOME`; add and remove them at runtime. |
| **Routing** | Per-request selection on remaining quota, health, in-flight runs and model eligibility, under a short transactional lease so two requests can't grab the same slot. Quota is read as the rolling window it is: a sub whose window has already reset counts as full again, and headroom about to expire is preferred as use-it-or-lose-it. The console names the winner and why ("most headroom, 82% vs 55% vs 31%"), so a routing decision is never a black box. |
| **Tiers** | Subs are `primary` (your stack) or `fallback` (metered API credit, the default for `POST /v1/accounts/openai-compatible`). Every eligible primary sub is exhausted before a fallback sub serves anything, and traffic returns to the stack the moment a quota window rolls over — so an API key is the safety net that keeps you answering when all ten subs are rate limited, not a competitor for their headroom. |
| **Failover** | A sub that answers with a 429/usage-limit error is parked until its own reset and the run is retried on another eligible sub — including across into the fallback tier — before any output has streamed. |
| **Streaming** | Runs stream over SSE with sequence IDs, heartbeats, replay for late subscribers, and cancellation by the provider's own turn ID. |
| **Keys** | One named key per consumer (`patty keys create puffle-prod`), revocable independently, with usage attributed per key as well as per sub — so you can see what your prod app spent versus your laptop. |
| **Limits** | Cap a key with `patty keys limit <id> <req/min> <concurrent>`, or in the console. A burst over the cap **waits in that key's queue** instead of failing, and only what still can't be served gets a `429` with `Retry-After` — so one app's traffic spike can't drain the stack or starve another key. Concurrency counts runs in flight, not sockets. |
| **Metering** | Tokens in / cached in / out / reasoning out / total, per run and per sub, taken from the provider's `thread/tokenUsage/updated` telemetry rather than estimated. Latest snapshot per run wins, so repeated updates never double-count. |
| **What it saved you** | Those counts priced in dollars: the console shows what the turns your subs served *would* have cost at API list price (money your subscriptions absorbed) next to what the fallback API subs actually spent. Dollars are the one estimated number, so a model with no local price is reported as unpriced, never as free — and `PATTY_PRICES=prices.json` lets you set your own rates. |
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
