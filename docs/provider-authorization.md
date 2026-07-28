# Provider authorization gate

**Status: not approved.** This repository deliberately ships only the fake app-server test path. Before any real account is connected or this project is released, the operator must receive affirmative written authorization from OpenAI that covers: a local single-owner daemon; more than one owner-controlled consumer subscription; quota- and health-aware selection; official `codex app-server` browser/device-code login and JSON-RPC only; no credential transfer; and no hosted resale.

A successful login, generic Codex documentation, or silence is not approval. If approval is denied or unclear, do not enable a fallback provider, direct OAuth flow, API-key routing, token import, or a hosted service. Record the written approval, Codex version, schema digest, and successful isolated-account smoke evidence here before setting `PATTY_ENABLE_LIVE_CODEX=1`.

## Local evidence requirement

Even after written authorization is obtained, live mode requires a local evidence file and a separately supplied SHA-256 digest (`PATTY_AUTHORIZATION_EVIDENCE` and `PATTY_AUTHORIZATION_SHA256`) in addition to `PATTY_ENABLE_LIVE_CODEX=1`. This prevents environment-only enablement. The project still has no approved evidence bundled with it, and the live suite remains blocked.
