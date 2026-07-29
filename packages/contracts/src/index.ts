/** Stable provider-neutral data exposed by the Patty API. */
export type AccountState = 'pending_login' | 'ready' | 'login_failed' | 'reconnect_required' | 'draining' | 'removed';
export type Quota = { remaining?: number; resetAt?: string; observedAt: string };
export type Account = { id: string; alias: string; state: AccountState; models: string[]; quota: Quota; health: number; activeRuns: number; cooldownUntil?: string };
export type RunRequest = { model: string; input: string; capabilities?: string[]; accountId?: string; idempotencyKey?: string; threadId?: string };
export type PattyEvent = { version: 1; type: 'started' | 'delta' | 'approval_required' | 'completed' | 'failed' | 'cancelled'; runId: string; data?: unknown };
export type PattyErrorCode = 'invalid_request' | 'unauthorized' | 'idempotency_conflict' | 'no_eligible_account' | 'model_unavailable' | 'account_reconnect_required' | 'account_cooldown' | 'approval_timeout' | 'upstream_overloaded' | 'upstream_failed' | 'protocol_incompatible';
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
