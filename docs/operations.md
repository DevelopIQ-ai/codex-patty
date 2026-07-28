# Operations

Install with `corepack pnpm install`. Run `corepack pnpm lint`, `typecheck`, `test:unit`, `test:contract`, `test:integration`, and `test:e2e:fake` before use. `test:live` reports **blocked** unless both written provider authorization and `PATTY_LIVE_TESTS=1` are present.

For a safe demo, build and run `node apps/daemon/dist/src/main.js --fake`. It prints a `cp_live` key only when its database has no active key; save that one-time value with `patty init <key>`, which writes an owner-only local config fallback. The daemon binds only to loopback. Its default `.patty/` directory is created mode 0700. An explicit `PATTY_DB_PATH` is owned by the operator and Patty never changes permissions on its parent.

The Codex account lifecycle is deliberately disabled unless `PATTY_ENABLE_LIVE_CODEX=1`, `PATTY_CODEX_VERSION` is an exact tested version, and the provider authorization gate has been satisfied. When enabled, account add starts one app-server per opaque alias in an isolated home and uses documented stdio login, snapshot, logout, and shutdown operations. This code has fake-worker coverage only; it is not evidence that provider authorization exists.
