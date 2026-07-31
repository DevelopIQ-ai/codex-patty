# Codex app-server protocol subset

This is the auditable subset used by Patty, generated from the official `@openai/codex` **0.145.0** app-server protocol. It deliberately contains neither credentials nor private endpoints.

Generation was performed with the exact pinned CLI:

```sh
/tmp/pattystack-live-bin/node_modules/.bin/codex app-server generate-ts --out /tmp/codex-ts
/tmp/pattystack-live-bin/node_modules/.bin/codex app-server generate-json-schema --out /tmp/codex-schema
node scripts/canonical-schema-digest.mjs /tmp/codex-schema/codex_app_server_protocol.v2.schemas.json
```

Source schema: `codex_app_server_protocol.v2.schemas.json`
Canonical JSON SHA-256: `02d8bf6651cd504bff0335f566c011e51ba77c5cc0538cb64ca7ac57739a1597`

The checked-in files are copied verbatim from those outputs. A reproducibility contract test canonicalizes the source fixture twice and verifies this digest. Contract fixtures validate the exercised JSON-RPC envelopes and outbound `thread/start` and `turn/start` shapes against the checked-in JSON schemas. Refresh this subset only after explicitly updating the CLI pin and recorded digest.
