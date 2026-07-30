# Local API

## OpenAI-compatible surface

`POST /v1/chat/completions` accepts OpenAI's request body and returns `chat.completion` (or a `chat.completion.chunk` SSE stream with `stream: true`), so an unmodified OpenAI client works against `OPENAI_BASE_URL=http://127.0.0.1:3210/v1` with a `cp_live_…` key. It is a translation over the same coordinator `/v1/runs` uses, so routing, leases, pre-output failover and metering behave identically:

- messages are flattened to the single text input the app-server takes (`role: content`, blank-line separated; a lone user message is passed verbatim), because the provider has no multi-message input;
- `usage` is the provider's own counts mapped to OpenAI's names — `prompt_tokens`/`completion_tokens`/`total_tokens`, with `prompt_tokens_details.cached_tokens` and `completion_tokens_details.reasoning_tokens`. Reasoning output is counted inside `completion_tokens`, as OpenAI reports it;
- `x-patty-sub` and `x-patty-run` name the sub that served the request and the underlying run, so a caller can attribute or debug a response without a second call;
- a failed or cancelled run answers `502` (non-streaming) or an `error` frame before `[DONE]` (streaming);
- unsupported today: tool/function calling, `n>1`, logprobs, images.

`GET /v1/models` returns OpenAI's list shape (`{object:'list',data:[{id,object:'model',owned_by}]}`) with a Patty-specific `subs` array naming which stacked subs can serve each model.

## Usage metering

`GET /v1/usage` returns token totals, per-sub aggregates, and the most recent measured runs. Patty persists only provider-reported counts (input, cached input, output, reasoning output, total) keyed by run, sub, and model — never prompts or generated text. A run's row is replaced by each newer provider snapshot, so totals stay exact when a turn reports usage more than once.

## Streaming privacy

Live SSE subscribers receive normalized provider deltas while connected. Patty persists only event ordering/type metadata for `delta` and approval events; it does not persist provider output content. Late SSE replay therefore provides redacted delta markers and terminal semantics, not prior generated text.
