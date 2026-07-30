import { readFileSync } from 'node:fs';
import type { TokenUsage } from '@patty/contracts';

/**
 * USD per million tokens, used to price token counts the providers reported.
 *
 * This is the one number in Patty that is an *estimate*: token counts come from the provider,
 * dollars come from a table that goes stale the moment a vendor changes a price. So the table is
 * overridable, a model that is not in it is reported as unpriced rather than as $0, and every
 * surface says "estimated".
 *
 * Cached input is billed at a discount by every provider that reports it separately, so it is
 * priced separately here too; reasoning output is already inside `outputTokens`.
 */
export type ModelPrice = { input: number; cachedInput?: number; output: number };

/** List prices as published for the API tiers these models are served on. Longest matching prefix wins, so `gpt-5.5-2026-01-01` inherits `gpt-5.5`. */
const defaults: Record<string, ModelPrice> = {
  'gpt-5': { input: 1.25, cachedInput: 0.125, output: 10 },
  'gpt-5-codex': { input: 1.25, cachedInput: 0.125, output: 10 },
  'gpt-5-mini': { input: 0.25, cachedInput: 0.025, output: 2 },
  'gpt-5-nano': { input: 0.05, cachedInput: 0.005, output: 0.4 },
  'gpt-4.1': { input: 2, cachedInput: 0.5, output: 8 },
  'gpt-4.1-mini': { input: 0.4, cachedInput: 0.1, output: 1.6 },
  'gpt-4o': { input: 2.5, cachedInput: 1.25, output: 10 },
  'gpt-4o-mini': { input: 0.15, cachedInput: 0.075, output: 0.6 },
  'o3': { input: 2, cachedInput: 0.5, output: 8 },
  'o4-mini': { input: 1.1, cachedInput: 0.275, output: 4.4 },
};

/**
 * `PATTY_PRICES` names a JSON file of `{"<model or prefix>": {"input":n,"cachedInput":n,"output":n}}`
 * merged over the defaults, which is how an operator prices a self-hosted or newly released model —
 * or writes their own rates down — without waiting on a Patty release.
 */
export function loadPrices(path = process.env.PATTY_PRICES): Record<string, ModelPrice> {
  if (!path) return defaults;
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  const overrides: Record<string, ModelPrice> = {};
  for (const [model, value] of Object.entries(parsed)) {
    const price = value as { input?: unknown; cachedInput?: unknown; output?: unknown };
    if (typeof price?.input !== 'number' || typeof price?.output !== 'number') throw new Error(`price for ${model} needs numeric input and output (USD per million tokens)`);
    overrides[model] = { input: price.input, output: price.output, ...(typeof price.cachedInput === 'number' ? { cachedInput: price.cachedInput } : {}) };
  }
  return { ...defaults, ...overrides };
}

export function priceOf(model: string, prices: Record<string, ModelPrice>) {
  const match = Object.keys(prices).filter(key => model === key || model.startsWith(key)).sort((a, b) => b.length - a.length)[0];
  return match ? prices[match] : undefined;
}

/** Dollars for one turn's counts, or `undefined` when the model has no price — never a misleading zero. */
export function estimateCost(model: string, usage: Pick<TokenUsage, 'inputTokens' | 'cachedInputTokens' | 'outputTokens'>, prices: Record<string, ModelPrice>) {
  const price = priceOf(model, prices);
  if (!price) return undefined;
  const uncachedInput = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  return (uncachedInput * price.input + usage.cachedInputTokens * (price.cachedInput ?? price.input) + usage.outputTokens * price.output) / 1_000_000;
}
