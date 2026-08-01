/**
 * An application asks for the model it was written against — `gpt-5-nano`, `claude-3-5-sonnet`,
 * whatever — and a stack of Codex subscriptions serves none of those names. Aliases are the
 * operator's answer to "who serves this?", so an app can be pointed at Patty without editing it.
 */
export type ModelAliases = Record<string, string>;
const name = /^[\w.:@/-]{1,128}$/;

/**
 * `PATTY_MODEL_ALIASES` is a JSON object of `{"asked-for":"actually-served"}`. `*` is the
 * catch-all for any model nothing in the stack serves. A broken map fails at boot rather than
 * silently routing to the wrong model.
 */
export function loadAliases(raw = process.env.PATTY_MODEL_ALIASES): ModelAliases {
  if (!raw?.trim()) return {};
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error('PATTY_MODEL_ALIASES must be a JSON object of {"asked-for":"served"}'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('PATTY_MODEL_ALIASES must be a JSON object of {"asked-for":"served"}');
  const aliases = parsed as Record<string, unknown>;
  for (const [from, to] of Object.entries(aliases)) {
    if (from !== '*' && !name.test(from)) throw new Error(`PATTY_MODEL_ALIASES: ${from} is not a usable model name`);
    if (typeof to !== 'string' || !name.test(to)) throw new Error(`PATTY_MODEL_ALIASES: ${from} must map to a model name`);
  }
  return aliases as ModelAliases;
}

/**
 * A name the stack actually serves always wins, so stacking a sub that serves the asked-for model
 * quietly stops the aliasing without a config change. Everything else follows the operator's map,
 * and an unmapped name is left alone to fail as the honest `model_unavailable` it is.
 */
export function resolveModel(model: string, aliases: ModelAliases, served: (model: string) => boolean) {
  if (served(model)) return model;
  return aliases[model] ?? aliases['*'] ?? model;
}
