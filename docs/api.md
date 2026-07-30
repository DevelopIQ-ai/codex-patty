# Local API

## OpenAI-compatible surface

`POST /v1/chat/completions` accepts OpenAI's request body and returns `chat.completion` (or a `chat.completion.chunk` SSE stream with `stream: true`), so an unmodified OpenAI client works against `OPENAI_BASE_URL=http://127.0.0.1:3210/v1` with a `cp_live_…` key. It is a translation over the same coordinator `/v1/runs` uses, so routing, leases, pre-output failover and metering behave identically:

- messages are flattened to the single text input the app-server takes (`role: content`, blank-line separated; a lone user message is passed verbatim), because the provider has no multi-message input;
- `usage` is the provider's own counts mapped to OpenAI's names — `prompt_tokens`/`completion_tokens`/`total_tokens`, with `prompt_tokens_details.cached_tokens` and `completion_tokens_details.reasoning_tokens`. Reasoning output is counted inside `completion_tokens`, as OpenAI reports it;
- `x-patty-sub` and `x-patty-run` name the sub that served the request and the underlying run, so a caller can attribute or debug a response without a second call;
- a failed or cancelled run answers `502` (non-streaming) or an `error` frame before `[DONE]` (streaming);
- unsupported today: tool/function calling, `n>1`, logprobs, images.

`GET /v1/models` returns OpenAI's list shape (`{object:'list',data:[{id,object:'model',owned_by}]}`) with a Patty-specific `subs` array naming which stacked subs can serve each model.

## Routing and quota windows

`GET /v1/router/status[?model=<model>]` returns the live ranking with the inputs behind it: `quotaRemaining` (last provider snapshot), `effectiveQuota`, `resetAt`/`resetsInMs`, `health`, `activeRuns`, `cooldownUntil` and the computed `score`, sorted best-first. Passing `model` evaluates real eligibility for that model instead of just readiness.

Quota is a rolling window, so Patty reads it as one:

- once `resetAt` has passed, a stored `remaining` describes a window that no longer exists, so the sub counts as full again and becomes eligible without waiting for a refresh;
- an unknown `remaining` counts as half — neither trusted nor excluded;
- headroom in a window that is about to roll over is use-it-or-lose-it, so a small `resetUrgency` term (weight .05) breaks ties toward the sooner-resetting sub without overriding real headroom (weight .55).

When a provider rejects a turn with a rate-limit/usage-limit/429 error before any output, Patty marks that sub's quota exhausted, parks it until its own `resetAt` (or 15 minutes if the provider never reported one), and retries the run once on another eligible sub. The attempt is recorded with reason `quota_failover`, so `run_attempts` shows where a request actually ran. If nothing else is eligible the run fails as `quota_exhausted`. Once output has started, Patty does not fail over — replaying a partially streamed answer on another sub would corrupt it.

## API keys and attribution

`POST /v1/api-keys {"name":"puffle-prod"}` issues a named key and returns the secret **once**; `GET /v1/api-keys` lists id, name, prefix, creation, last use and revocation state but never the secret; `DELETE /v1/api-keys/{id}` revokes one key without touching the others. Give every consumer its own key (`puffle-prod`, `puffle-dev`, a laptop, a CI job) and revocation stays surgical.

Every run records the key that started it, and usage inherits that attribution from the run, so `GET /v1/usage` reports totals per key as well as per sub. Attribution survives revocation — history should not rewrite itself — and runs made before named keys existed report `keyId: null`, labelled `unattributed` rather than silently folded into a real key.

## Usage metering

`GET /v1/usage` returns token totals, per-sub aggregates, and the most recent measured runs. Patty persists only provider-reported counts (input, cached input, output, reasoning output, total) keyed by run, sub, and model — never prompts or generated text. A run's row is replaced by each newer provider snapshot, so totals stay exact when a turn reports usage more than once.

## Streaming privacy

Live SSE subscribers receive normalized provider deltas while connected. Patty persists only event ordering/type metadata for `delta` and approval events; it does not persist provider output content. Late SSE replay therefore provides redacted delta markers and terminal semantics, not prior generated text.

## Observability

`GET /metrics` returns Prometheus text exposition (authenticated like every other endpoint, since it names your subs): `patty_subs{state}`, `patty_sub_quota_remaining{sub}`, `patty_sub_quota_reset_seconds{sub}`, `patty_sub_health{sub}`, `patty_sub_active_runs{sub}`, `patty_runs_total{status}`, `patty_run_attempts_total{reason}` — which is where failover shows up as `reason="quota_failover"` — plus `patty_tokens_total{sub,direction}` and `patty_key_tokens_total{key}`. No prompt, output or credential is ever a label or a value.

`GET /v1/runs?sub=&model=&status=&keyId=&since=&limit=` is the run history, newest first, capped at 500 per request, with each run's sub, key, status, attempt count and tokens. `attempts > 1` is the visible fingerprint of a failover.

`GET /v1/doctor` (`patty doctor`) answers the only question a stuck operator has — can anything serve a request, and if not why — as named checks with a `detail` and, when a check fails, a `hint` naming the fix. `patty status` remains the raw router dump.

The daemon writes one JSON line per request to stdout: timestamp, request id, method, path (without the query string), status, duration, and the routed sub and run when there was one. Prompts, outputs, key secrets and query values are never logged. Set `PATTY_LOG_LEVEL=silent` to turn it off.

## Stacking non-Codex providers

`POST /v1/accounts/openai-compatible {"alias":"together","baseUrl":"https://api.together.xyz/v1","apiKeyEnv":"TOGETHER_API_KEY"}` stacks any OpenAI-compatible endpoint — an OpenAI or OpenRouter key, Together/Fireworks, a local Ollama or vLLM — next to your Codex subs behind the same router, metering, failover and OpenAI-compatible surface.

Patty stores the **name of the environment variable**, never the key: the secret is read from the daemon's environment at call time, so a stolen `patty.sqlite` still contains no provider credential. If the variable is unset when a request routes there, the run fails as `upstream_failed` rather than falling back to an unauthenticated call. Models come from the provider's own `/models`, and remaining quota is derived from the standard `x-ratelimit-*` headers — a provider that reports nothing stays "unknown" (counted as half) rather than being assumed full.
