# Local API

## Usage metering

`GET /v1/usage` returns token totals, per-sub aggregates, and the most recent measured runs. Patty persists only provider-reported counts (input, cached input, output, reasoning output, total) keyed by run, sub, and model — never prompts or generated text. A run's row is replaced by each newer provider snapshot, so totals stay exact when a turn reports usage more than once.

## Streaming privacy

Live SSE subscribers receive normalized provider deltas while connected. Patty persists only event ordering/type metadata for `delta` and approval events; it does not persist provider output content. Late SSE replay therefore provides redacted delta markers and terminal semantics, not prior generated text.
