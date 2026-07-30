# Provider authorization gate

**Status: operator-attested.** The operator has attested that OpenAI authorization covers this local use. The underlying correspondence was not reviewed by repository maintainers or Vorflux, is not bundled or committed, and must not be inferred from this repository.

Live use remains deliberately fail-closed. It requires all of: `PATTY_ENABLE_LIVE_CODEX=1`; an exact local attestation path and SHA-256 in `PATTY_AUTHORIZATION_EVIDENCE` and `PATTY_AUTHORIZATION_SHA256`; the exact `@openai/codex` 0.145.0 command/version; and, for the live harness, `PATTY_LIVE_TESTS=1`. Patty never reads `auth.json`, transfers credentials, or uses private endpoints.

The live path has been exercised by the attesting operator against two of their own ChatGPT subscriptions. A successful login or a passing local run is not a replacement for authorization evidence.
