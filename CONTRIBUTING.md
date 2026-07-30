# Contributing

Patty is small on purpose. Contributions that keep it that way are very welcome. By taking part you agree to the [code of conduct](CODE_OF_CONDUCT.md); to report a vulnerability, use [SECURITY.md](SECURITY.md) rather than a public issue.

## The rules

1. **Open an issue before a large change.** Bug fixes, docs and tests need no permission. A new route, a new dependency, a new provider adapter or anything touching routing deserves a design conversation first, so nobody spends a weekend on a PR that gets declined.
2. **One change per pull request**, branched off `main`, with a title that says what changed rather than which files moved.
3. **Never break an invariant** in [docs/architecture.md](docs/architecture.md): loopback-only by default, no prompt/output/tool content persisted or logged, no reading of `auth.json` or OAuth tokens, no private provider endpoints, and the live gate stays fail-closed. A PR that loosens one of these to make something else easier will be declined even if the something else is good.
4. **Prove it.** Every PR shows the change working — real request/response, console screenshot, or test output — not a description of it. A behaviour change needs a test that fails without the patch.
5. **Green before review.** The commands below all pass locally; CI runs exactly them, and `main` requires them.
6. **No new runtime dependencies.** The published package is dependency-free and stays that way; dev dependencies need a reason in the PR.
7. **Never commit a secret.** No `cp_live_…` key, provider key, `auth.json`, or `.env` — not in code, tests, fixtures, screenshots or issue text.
8. **Review is required.** `main` is protected: every change lands by PR with an owner's approval ([CODEOWNERS](.github/CODEOWNERS)) and passing checks. No direct pushes, no force-pushes.
9. **Say what you used.** AI-assisted patches are fine and mostly what this repo is; you are still responsible for understanding and testing every line you submit.
10. **MIT.** Contributions are licensed under the repository's [LICENSE](LICENSE).

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
- Add a line to the `Unreleased` section of [CHANGELOG.md](CHANGELOG.md) for anything a user would notice.

## Releasing

Publishing is a tag, not a manual `npm publish`: bump `version` in the root `package.json`, move the `Unreleased` CHANGELOG entries under it, then push `vX.Y.Z`. The `release` workflow reruns every suite, fails if the tag and `package.json` disagree, and publishes `dist-npm` with provenance using the `NPM_TOKEN` repository secret (an npm automation token). `workflow_dispatch` runs everything except the publish, which is the way to check a release before tagging.

## Good first areas

- Routing strategies (quota-reset awareness, cost weighting, sticky sessions).
- Cost/spend views on top of the existing per-sub token metering.
- Console UX: charts over time, filtering runs by sub or model.
- Additional provider adapters behind the existing `ProviderAdapter` interface.

## Reporting bugs

Include the daemon's startup line, the failing request or console action, and whether you were on fake or live subs. Never paste credentials, `auth.json`, or `cp_live_…` keys into an issue.
