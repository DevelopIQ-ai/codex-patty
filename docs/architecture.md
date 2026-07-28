# Architecture

Patty is a loopback-only, single-user daemon. SQLite WAL stores local API-key hashes, opaque account aliases, model/quota snapshots, thread affinity, run metadata, short selection leases, active capacity, and content-free audit metadata. It does not store prompts, outputs, identities, OAuth tokens, refresh tokens, cookies, or Codex auth files.

A short transactional routing lease prevents simultaneous selection. It is converted atomically to `active_runs` and released before execution; terminal handling atomically decrements active capacity once. Runs persist provider turn IDs, so cancellation uses the documented provider turn identifier rather than Patty's local run ID. The SSE stream provides bounded retained events, sequence IDs, heartbeats, terminal close, and 404 before a stream is opened for an unknown run.

The real `CodexAppServerAdapter` is opt-in and requires an exact expected version matched by its initialization response. It uses isolated `CODEX_HOME`, JSONL stdio RPC, bounded pending request timeouts, redacted stderr, and explicit child shutdown. The present MVP includes only fake-worker E2E coverage; no claim is made that live Codex routing is provider-approved.
