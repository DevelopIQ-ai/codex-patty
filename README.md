# Codex Patty

A local, single-user, Patty-native daemon and CLI that routes work between isolated official Codex app-server accounts. It is **fail-closed for live multi-account use unless the operator-attested local authorization gate is satisfied**. See [docs/provider-authorization.md](docs/provider-authorization.md), [architecture](docs/architecture.md), and [operations](docs/operations.md).

## Local fake-worker demo

```sh
corepack pnpm install
corepack pnpm test:e2e:fake
corepack pnpm --filter @patty/daemon build
node apps/daemon/dist/src/main.js --fake
```

The daemon only binds `127.0.0.1`; it never reads Codex `auth.json`, handles OAuth tokens, or calls private endpoints.
