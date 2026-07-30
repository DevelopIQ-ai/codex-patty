# Security policy

## Reporting a vulnerability

Report privately through [GitHub's advisory form](https://github.com/DevelopIQ-ai/codex-patty/security/advisories/new), not a public issue. Expect an acknowledgement within 3 working days and a fix or a decision within 30 days; we will credit you in the release notes unless you would rather stay anonymous.

**Never include credentials in a report** — no `cp_live_…` key, no `auth.json`, no provider API key, no OAuth or refresh token. A redacted request, the daemon's startup line and the steps to reproduce are enough.

## What counts

Patty's whole security story is that it is local and holds no provider secrets, so anything that breaks one of these is in scope:

- Reaching the daemon from off-machine without `PATTY_ALLOW_NON_LOOPBACK=1` and an explicit `PATTY_HOST`, or getting it to bind a wildcard address at all.
- Serving a `/v1/*` request without a valid, unrevoked API key, or one key reading another key's usage, runs or limits.
- Getting a prompt, an output, a tool name or tool arguments written to SQLite or to the logs.
- Reading, moving or exfiltrating a sub's OAuth tokens or `auth.json`, or escaping a sub's isolated `CODEX_HOME`.
- Starting a Codex sub against an unpinned or substituted `codex` binary, or escaping the version check the adapter performs before it speaks to one.
- Recovering a provider API key from `patty.sqlite` — OpenAI-compatible subs store the *name* of an environment variable, never its value.

## What does not

- Anything requiring an attacker who already has your user account on the machine: they can read `~/.patty/patty.sqlite` and the environment, and no local process boundary is claimed.
- Exposing the daemon on a public interface yourself, without a tailnet or TLS in front. The opt-in exists for tailnets; see [docs/deploy.md](docs/deploy.md).
- The `--fake` subs, which are development fixtures with no credentials behind them.
- Provider-side rate limits, quota exhaustion or account actions taken by OpenAI. Those are between you and your provider; see [docs/provider-authorization.md](docs/provider-authorization.md).

## Supported versions

The latest published release only. Patty is pre-1.0 and there are no backports.
