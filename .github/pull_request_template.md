## What this changes

<!-- What behaviour is different, and why. Link the issue if there is one. -->

## Proof it works

<!--
Show the change working: request/response, a console screenshot, or metrics output.
`--fake=<alias>[:<quota>]` stacks fake subs so anything routing-related is reproducible
without a subscription. Pure refactors: say so and paste the passing suites instead.
-->

## Checks

- [ ] `corepack pnpm lint && corepack pnpm typecheck && corepack pnpm openapi:lint`
- [ ] `corepack pnpm test:unit && corepack pnpm test:contract && corepack pnpm test:integration && corepack pnpm test:e2e:fake`
- [ ] A test fails without this change
- [ ] OpenAPI updated if the HTTP surface moved
- [ ] Invariants in [docs/architecture.md](../docs/architecture.md) intact: loopback by default, no prompt/output persistence, no reading of `auth.json` or OAuth tokens, fail-closed live gate
