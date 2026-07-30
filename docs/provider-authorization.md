# Using your own subscriptions

Patty runs the subscriptions **you** already pay for, on **your** machine. It does that through the official Codex CLI: Patty starts `codex app-server`, you sign in through the browser window Codex opens, and Codex keeps the login in its own directory. Patty never reads `auth.json`, never copies a token anywhere, and never calls an endpoint the Codex client does not call.

That means the relationship is still between you and OpenAI, exactly as it is when you run `codex` by hand. Nothing here grants you rights you did not already have, and nothing here takes any away.

Two things worth knowing before you point a product at it:

- **Your plan is yours.** Running your own subscriptions through one local router is the same seats doing the same work. Using them to serve inference to *other people* is a different question, and it is a question about your plan's terms, not about Patty.
- **Quota is finite.** Patty spreads load, it does not create capacity. When every subscription is inside its reset window the honest answer is that no sub can serve the request — which is why a metered API key as the fallback tier is worth setting up if something depends on always getting an answer.

The one hard technical requirement is the Codex CLI version: Patty speaks the app-server protocol, which changes between releases, so it refuses a version it was not built against rather than misbehaving later. `patty doctor` reports which Codex it found.
