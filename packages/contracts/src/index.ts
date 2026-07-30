/** Stable provider-neutral data exposed by the Patty API. */
export type AccountState = 'pending_login' | 'ready' | 'login_failed' | 'reconnect_required' | 'draining' | 'removed';
export type Quota = { remaining?: number; resetAt?: string; observedAt: string };
/** Subs are tried a tier at a time: every eligible `primary` sub is exhausted before any `fallback` sub is used, so metered API credit only pays for what the stacked subscriptions could not. */
export type AccountTier = 'primary' | 'fallback';
export type Account = { id: string; alias: string; state: AccountState; models: string[]; quota: Quota; health: number; activeRuns: number; cooldownUntil?: string; tier: AccountTier };
/** Per-key admission control. `rpm` caps requests started in a rolling minute, `concurrency` caps runs in flight at once; an unset limit is unlimited. Requests over a limit wait in the key's queue rather than failing immediately. */
export type KeyLimits = { rpm?: number; concurrency?: number };
export type KeyPressure = { keyId: string; name: string | null; inFlight: number; queued: number; throttled: number } & KeyLimits;
export type RunRequest = { model: string; input: string; capabilities?: string[]; accountId?: string; idempotencyKey?: string; threadId?: string };
export type PattyEvent = { version: 1; type: 'started' | 'delta' | 'usage' | 'approval_required' | 'completed' | 'failed' | 'cancelled'; runId: string; data?: unknown };
/** Provider-reported token counts for a single turn. Counts are metadata, never generated content. */
export type TokenUsage = { inputTokens: number; cachedInputTokens: number; outputTokens: number; reasoningOutputTokens: number; totalTokens: number };
export type UsageTotals = TokenUsage & { runs: number };
export type AccountUsage = UsageTotals & { accountId: string; alias: string };
export type RunUsage = TokenUsage & { runId: string; accountId: string; alias: string; model: string; observedAt: string; keyId: string | null; keyName: string | null };
export type KeyUsage = UsageTotals & { keyId: string | null; name: string | null; prefix: string | null };
export type UsageReport = { totals: UsageTotals; accounts: AccountUsage[]; keys: KeyUsage[]; runs: RunUsage[] };
export type PattyErrorCode = 'invalid_request' | 'unauthorized' | 'idempotency_conflict' | 'no_eligible_account' | 'rate_limited' | 'model_unavailable' | 'account_reconnect_required' | 'account_cooldown' | 'approval_timeout' | 'upstream_overloaded' | 'upstream_failed' | 'protocol_incompatible';
export type PattyError = { error: { code: PattyErrorCode; message: string; requestId: string; retryable: boolean; retryAfterMs?: number } };

/** All real implementations must use documented app-server RPC only. */
export interface ProviderAdapter {
  login(mode: 'browser' | 'device_code'): Promise<{ url?: string; code?: string }>;
  cancelLogin(): Promise<void>;
  snapshot(): Promise<{ models: string[]; quota: Quota; capabilities?: string[] }>;
  createThread(model: string): Promise<string>;
  /** Resolves as soon as the provider accepts the turn, with its cancellation ID. */
  run(threadId: string | undefined, model: string, input: string, onEvent: (event: PattyEvent) => void): Promise<{ turnId: string }>;
  interrupt(providerTurnId: string): Promise<void>;
  approve(approvalId: string, approved: boolean): Promise<void>;
  logout(): Promise<void>;
  health(): Promise<boolean>;
  /** Stops worker resources without reading or deleting Codex-managed credentials. */
  shutdown(): Promise<void>;
}
