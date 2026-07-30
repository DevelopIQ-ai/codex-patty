# Contributing

Patty is small on purpose. Contributions that keep it that way are very welcome.

## Setup

```sh
corepack pnpm install     # Node >=22.5 (the store uses node:sqlite)
corepack pnpm build
```

Nothing here needs a Codex subscription: `--fake=<alias>[:<quotaRemaining>]` stacks fake subs, and every suite except `test:live` runs against fixtures or fake workers.

## Before opening a PR

```sh
corepack pnpm lint && corepack pnpm typecheck && corepack pnpm openapi:lint
corepack pnpm test:unit && corepack pnpm test:contract && corepack pnpm test:integration && corepack pnpm test:e2e:fake
```

CI runs exactly this. Please also:

- Keep the invariants in [docs/architecture.md](docs/architecture.md) intact — loopback-only binding, no prompt/output persistence, no reading of `auth.json` or OAuth tokens, and the fail-closed live gate.
- Add a test that fails without your change. Contract tests come from the official protocol schemas in `packages/codex-protocol/generated`, so provider-shape changes belong there rather than in hand-written mocks.
- Update `packages/contracts/openapi/codex-patty.openapi.yaml` when you touch the HTTP surface.

## Good first areas

- Routing strategies (quota-reset awareness, cost weighting, sticky sessions).
- Cost/spend views on top of the existing per-sub token metering.
- Console UX: charts over time, filtering runs by sub or model.
- Additional provider adapters behind the existing `ProviderAdapter` interface.

## Reporting bugs

Include the daemon's startup line, the failing request or console action, and whether you were on fake or live subs. Never paste credentials, `auth.json`, or `cp_live_…` keys into an issue.
