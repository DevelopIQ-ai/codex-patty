# Codex Patty

A local, single-user, Patty-native daemon and CLI that routes work between isolated official Codex app-server accounts. It is **fail-closed for live multi-account use unless the operator-attested local authorization gate is satisfied**. See [docs/provider-authorization.md](docs/provider-authorization.md), [architecture](docs/architecture.md), and [operations](docs/operations.md).

Stack several Codex subscriptions, route each request to the sub with the most headroom, and watch tokens in/out per sub in a loopback web console.

## Local fake-worker demo

```sh
corepack pnpm install
corepack pnpm test:e2e:fake
corepack pnpm --filter @patty/daemon build
node apps/daemon/dist/src/main.js --fake=sub-a --fake=sub-b:0.4
```

Open <http://127.0.0.1:3210/> and paste the one-time `cp_live_…` key the daemon prints. `--fake=<alias>[:<quotaRemaining>]` stacks demo subs so routing and per-sub usage are observable without a provider.

## Console

The daemon serves a single static operator console on loopback. It stacks and removes subs, shows router eligibility with the score inputs (quota headroom, health, active runs), streams a run over SSE, and charts usage: tokens in, tokens out, cached input, reasoning output, and per-sub share. The same data is available headlessly via `patty usage` and `GET /v1/usage`.

Token counts come from the provider's own `thread/tokenUsage/updated` telemetry; the latest snapshot for a run wins, so repeated updates never double-count. The daemon only binds `127.0.0.1`; it never reads Codex `auth.json`, handles OAuth tokens, or calls private endpoints.
