import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { createInterface } from 'node:readline';
import type { PattyEvent, ProviderAdapter, Quota } from '@patty/contracts';

type Rpc = { id?: unknown; method?: unknown; params?: unknown; result?: unknown; error?: { message?: unknown } };
type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout };
type TurnRef = { threadId: string; emit: (event: PattyEvent) => void };
type Approval = { method: string; requestId: string | number; turnId?: string };
type QueuedTurnMessage = PattyEvent | { approval: Approval };
type RateWindow = { usedPercent?: number; resetsAt?: number | null };
const approvalMethods = new Set(['item/commandExecution/requestApproval', 'item/fileChange/requestApproval', 'applyPatchApproval', 'execCommandApproval']);

/** Official Codex CLI 0.145.0 app-server JSONL adapter. */
export class CodexAppServerAdapter extends EventEmitter implements ProviderAdapter {
  private child?: ChildProcessWithoutNullStreams; private next = 0; private stopping = false;
  private readonly pending = new Map<number, Pending>(); private readonly turns = new Map<string, TurnRef>(); private readonly earlyEvents = new Map<string, QueuedTurnMessage[]>(); private readonly earlyApprovalsByThread = new Map<string, Approval[]>(); private readonly approvals = new Map<string, Approval>(); private loginId?: string;
  constructor(private readonly command: string, private readonly args: string[], private readonly home: string, private readonly expectedVersion: string, private readonly rpcTimeoutMs = 30_000) { super(); if (expectedVersion !== '0.145.0') throw new Error('a pinned Codex 0.145.0 version is required'); }
  async start() {
    if (this.child) return;
    let version: string; try { version = execFileSync(this.command, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { throw new Error('protocol_incompatible: Codex version could not be verified'); }
    if (version !== `codex-cli ${this.expectedVersion}`) throw new Error(`protocol_incompatible: expected Codex ${this.expectedVersion}`);
    const expectedHome = realpathSync(this.home);
    const child = spawn(this.command, this.args, { env: { ...process.env, CODEX_HOME: expectedHome }, stdio: 'pipe' }); this.child = child;
    child.once('error', error => this.stop(error)); child.stdin.on('error', error => this.stop(error)); child.once('exit', () => this.stop(new Error('app-server exited')));
    createInterface({ input: child.stdout }).on('line', line => this.receive(line)); child.stderr.on('data', () => undefined);
    try {
      const initialized = await this.rpc('initialize', { clientInfo: { name: 'codex-patty', version: '0.1.0' }, capabilities: null }) as { userAgent?: string; codexHome?: string };
      let initializedHome: string | undefined; try { if (typeof initialized.codexHome === 'string') initializedHome = realpathSync(initialized.codexHome); } catch { initializedHome = undefined; }
      if (typeof initialized.userAgent !== 'string' || initializedHome !== expectedHome) throw new Error('protocol_incompatible: invalid initialize response');
      this.notify('initialized');
    } catch (error) { await this.shutdown(); throw error; }
  }
  private receive(line: string) {
    let message: Rpc; try { message = JSON.parse(line) as Rpc; } catch { this.emit('protocolError', 'malformed_frame'); return; }
    if ((typeof message.id === 'string' || typeof message.id === 'number') && typeof message.method === 'string') { this.serverRequest(message.id, message.method, message.params); return; }
    if (typeof message.id === 'number') { const pending = this.pending.get(message.id); if (!pending) return; clearTimeout(pending.timer); this.pending.delete(message.id); message.error ? pending.reject(new Error(String(message.error.message ?? 'rpc error'))) : pending.resolve(message.result); return; }
    if (typeof message.method === 'string') this.notification(message.method, message.params);
  }
  private notification(method: string, params: unknown) {
    const value = params as { threadId?: string; turnId?: string; turn?: { id?: string; status?: string }; delta?: string; rateLimits?: { primary?: RateWindow | null; secondary?: RateWindow | null } } | undefined;
    const turnId = value?.turnId ?? value?.turn?.id;
    const event = method === 'turn/started' ? { version: 1 as const, type: 'started' as const, runId: turnId! } : method === 'item/agentMessage/delta' ? { version: 1 as const, type: 'delta' as const, runId: turnId!, data: { text: value?.delta } } : method === 'turn/completed' ? { version: 1 as const, type: value?.turn?.status === 'completed' ? 'completed' as const : 'failed' as const, runId: turnId!, data: value?.turn?.status === 'completed' ? undefined : { providerStatus: value?.turn?.status } } : undefined;
    if (event && turnId) { const ref = this.turns.get(turnId); if (ref) { ref.emit(event); if (method === 'turn/completed') this.clearTurn(turnId); } else { const queued = this.earlyEvents.get(turnId) ?? []; queued.push(event); this.earlyEvents.set(turnId, queued); if (method === 'turn/completed' && value?.threadId) this.clearQueuedThread(value.threadId); } }
    else if (method === 'account/rateLimits/updated') this.emit('quota', this.quota(value?.rateLimits));
    else if (method === 'account/login/completed') this.emit('login', { method, params });
    else this.emit('notification', { method, params });
  }
  private serverRequest(id: string | number, method: string, params: unknown) {
    if (!approvalMethods.has(method)) { this.respondError(id, -32601, `unsupported server request: ${method}`); return; }
    const value = params as { turnId?: string; conversationId?: string } | undefined; const turnId = value?.turnId; const ref = turnId ? this.turns.get(turnId) : value?.conversationId ? [...this.turns.entries()].find(([, candidate]) => candidate.threadId === value.conversationId)?.[1] : undefined;
    const resolvedTurnId = turnId ?? [...this.turns.entries()].find(([, candidate]) => candidate === ref)?.[0]; const approval = { method, requestId: id, turnId: resolvedTurnId };
    if (!turnId && value?.conversationId && !ref) { const queued = this.earlyApprovalsByThread.get(value.conversationId) ?? []; queued.push(approval); this.earlyApprovalsByThread.set(value.conversationId, queued); return; }
    if (!resolvedTurnId) { this.respond(id, this.approvalResult(approval, false)); return; }
    if (!ref) { const queued = this.earlyEvents.get(turnId!) ?? []; queued.push({ approval }); this.earlyEvents.set(turnId!, queued); return; }
    this.approvals.set(String(id), approval); ref.emit({ version: 1, type: 'approval_required', runId: resolvedTurnId, data: { approvalId: String(id) } });
  }
  private approvalResult(approval: Approval, approved: boolean) { if (approval.method === 'applyPatchApproval' || approval.method === 'execCommandApproval') return { decision: approved ? 'approved' : 'abort' }; return { decision: approved ? 'accept' : 'decline' }; }
  private respond(id: string | number, result: unknown) { this.child?.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`); }
  private respondError(id: string | number, code: number, message: string) { this.child?.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`); }
  private notify(method: string) { this.child?.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method })}\n`); }
  private quota(rateLimits: { primary?: RateWindow | null; secondary?: RateWindow | null } | undefined): Quota {
    const windows = [rateLimits?.primary, rateLimits?.secondary].filter((window): window is RateWindow => typeof window?.usedPercent === 'number' && Number.isFinite(window.usedPercent));
    if (!windows.length) return { observedAt: new Date().toISOString() };
    const restrictive = windows.reduce((worst, window) => { const usage = Math.max(0, Math.min(100, window.usedPercent!)); const worstUsage = Math.max(0, Math.min(100, worst.usedPercent!)); return usage > worstUsage || (usage === worstUsage && (window.resetsAt ?? -Infinity) > (worst.resetsAt ?? -Infinity)) ? window : worst; });
    return { remaining: Math.max(0, Math.min(1, 1 - restrictive.usedPercent! / 100)), resetAt: typeof restrictive.resetsAt === 'number' && Number.isFinite(restrictive.resetsAt) ? new Date(restrictive.resetsAt * 1000).toISOString() : undefined, observedAt: new Date().toISOString() };
  }
  private rpc(method: string, params?: unknown): Promise<unknown> { if (!this.child) return Promise.reject(new Error('worker not started')); if (this.pending.size >= 128) return Promise.reject(new Error('upstream_overloaded')); const requestId = ++this.next; this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: requestId, method, ...(params === undefined ? {} : { params }) })}\n`); return new Promise((resolve, reject) => { const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error('rpc timeout')); }, this.rpcTimeoutMs); this.pending.set(requestId, { resolve, reject, timer }); }); }
  private deny(approval: Approval) { this.respond(approval.requestId, this.approvalResult(approval, false)); }
  private clearQueuedThread(threadId: string) { for (const approval of this.earlyApprovalsByThread.get(threadId) ?? []) this.deny(approval); this.earlyApprovalsByThread.delete(threadId); }
  private clearTurn(turnId: string) { this.turns.delete(turnId); for (const message of this.earlyEvents.get(turnId) ?? []) if ('approval' in message) this.deny(message.approval); this.earlyEvents.delete(turnId); for (const [id, approval] of this.approvals) if (approval.turnId === turnId) { this.deny(approval); this.approvals.delete(id); } }
  private stop(reason: Error) { for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(reason); } this.pending.clear(); for (const turnId of this.turns.keys()) this.clearTurn(turnId); for (const messages of this.earlyEvents.values()) for (const message of messages) if ('approval' in message) this.deny(message.approval); this.earlyEvents.clear(); for (const approvals of this.earlyApprovalsByThread.values()) for (const approval of approvals) this.deny(approval); this.earlyApprovalsByThread.clear(); for (const approval of this.approvals.values()) this.deny(approval); this.approvals.clear(); this.child = undefined; if (!this.stopping) this.emit('exit', reason); }
  async login(mode: 'browser' | 'device_code') { const result = await this.rpc('account/login/start', mode === 'device_code' ? { type: 'chatgptDeviceCode' } : { type: 'chatgpt' }) as { authUrl?: string; verificationUrl?: string; userCode?: string; loginId?: string }; this.loginId = result.loginId; return { url: result.authUrl ?? result.verificationUrl, code: result.userCode, loginId: result.loginId }; }
  async cancelLogin(loginId?: string) { if (loginId ?? this.loginId) await this.rpc('account/login/cancel', { loginId: loginId ?? this.loginId }); }
  private async account() { return this.rpc('account/read', {}) as Promise<{ account: { type?: string; email?: string | null } | null; requiresOpenaiAuth: boolean }>; }
  async identityFingerprint() { const account = await this.account(); if (!account.account) throw new Error('account_not_authenticated'); return createHash('sha256').update(`${account.account.type ?? ''}:${account.account.email ?? ''}`).digest('hex'); }
  async waitForAccount(timeoutMs = 30_000) { const deadline = Date.now() + timeoutMs; while (Date.now() < deadline) { const result = await this.account(); if (result.account && !result.requiresOpenaiAuth) return result; await new Promise(resolve => setTimeout(resolve, 500)); } throw new Error('account_login_not_ready'); }
  async snapshot() { await this.waitForAccount(); const models = await this.rpc('model/list', {}) as { data: { model?: string; id?: string }[] }; const limits = await this.rpc('account/rateLimits/read') as { rateLimits: { primary?: RateWindow | null; secondary?: RateWindow | null } }; return { models: models.data.map(model => model.model ?? model.id).filter((model): model is string => Boolean(model)), capabilities: [], quota: this.quota(limits.rateLimits) }; }
  async createThread(model: string) { return (await this.rpc('thread/start', { model, ephemeral: true }) as { thread: { id: string } }).thread.id; }
  async run(threadId: string | undefined, model: string, input: string, emit: (event: PattyEvent) => void) { const activeThreadId = threadId ?? await this.createThread(model); const result = await this.rpc('turn/start', { threadId: activeThreadId, model, input: [{ type: 'text', text: input, text_elements: [] }] }) as { turn: { id: string } }; this.turns.set(result.turn.id, { threadId: activeThreadId, emit }); const legacy = this.earlyApprovalsByThread.get(activeThreadId) ?? []; this.earlyApprovalsByThread.delete(activeThreadId); for (const approval of legacy) { approval.turnId = result.turn.id; this.approvals.set(String(approval.requestId), approval); emit({ version: 1, type: 'approval_required', runId: result.turn.id, data: { approvalId: String(approval.requestId) } }); } let terminal = false; for (const message of this.earlyEvents.get(result.turn.id) ?? []) { if ('approval' in message) { this.approvals.set(String(message.approval.requestId), message.approval); emit({ version: 1, type: 'approval_required', runId: result.turn.id, data: { approvalId: String(message.approval.requestId) } }); } else { emit(message); terminal ||= message.type === 'completed' || message.type === 'failed' || message.type === 'cancelled'; } } if (terminal) this.clearTurn(result.turn.id); else this.earlyEvents.delete(result.turn.id); return { turnId: result.turn.id }; }
  async interrupt(providerTurnId: string) { const ref = this.turns.get(providerTurnId); if (!ref) throw new Error('unknown_turn'); await this.rpc('turn/interrupt', { threadId: ref.threadId, turnId: providerTurnId }); }
  async approve(approvalId: string, approved: boolean) { const approval = this.approvals.get(approvalId); if (!approval) throw new Error('unknown_approval'); this.approvals.delete(approvalId); this.respond(approval.requestId, this.approvalResult(approval, approved)); }
  async logout() { await this.rpc('account/logout'); } async health() { return Boolean(this.child); }
  async shutdown() { const child = this.child; if (!child) return; this.stopping = true; this.stop(new Error('worker shut down')); child.kill('SIGTERM'); const exited = await new Promise<boolean>(resolve => { const timer = setTimeout(() => resolve(false), 1_000); child.once('exit', () => { clearTimeout(timer); resolve(true); }); }); if (!exited) { child.kill('SIGKILL'); await new Promise<void>(resolve => child.once('exit', () => resolve())); } this.stopping = false; }
}
