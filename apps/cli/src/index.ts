#!/usr/bin/env node
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isatty } from 'node:tty';
const configPath = process.env.PATTY_CONFIG_PATH ?? join(homedir(), '.config', 'pattystack', 'config.json');
const base = process.env.PATTY_URL ?? 'http://127.0.0.1:3210';
const parsed = new URL(base); if (!['127.0.0.1', '::1', 'localhost'].includes(parsed.hostname)) throw new Error('Patty CLI refuses non-loopback URLs');
const storedKey = (() => { try { return JSON.parse(readFileSync(configPath, 'utf8')).key as string; } catch { return undefined; } })();
const key = process.env.PATTY_API_KEY ?? storedKey;
const pretty = process.env.PATTY_FORMAT === 'pretty' || (process.env.PATTY_FORMAT !== 'json' && isatty(process.stdout.fd));
async function request(path: string, init: RequestInit = {}, format?: (body: unknown) => string) { const response = await fetch(base + path, { ...init, headers: { authorization: `Bearer ${key ?? ''}`, 'content-type': 'application/json', ...init.headers } }); const text = await response.text(); const out = (() => { if (!response.ok || !pretty || !format) return text; try { return format(JSON.parse(text)); } catch { return text; } })(); console.log(out); if (!response.ok) process.exitCode = 1; return { response, text }; }
function formatStatus(body: unknown) { const data = (body as { data?: Array<{ alias: string; tier: string; quotaRemaining: number; health: number; score: number; eligible: boolean; servable: boolean }> }).data ?? []; const rows = data.map((sub, i) => { const marker = i === 0 && sub.eligible && sub.servable ? ' ← next' : ''; return `${sub.alias.padEnd(12)} ${String(Math.round((sub.quotaRemaining ?? 0) * 100)).padStart(4)}%  health ${String(sub.health).padEnd(4)}  score ${String(sub.score).padEnd(7)}${marker}`; }); return rows.join('\n') || 'no subs stacked'; }
function formatUsage(body: unknown) { const d = (body as { data?: { totals?: { totalTokens?: number; runs?: number; cost?: { estimatedCostUsd?: number; unpricedRuns?: number } } } }).data ?? {}; const t = d.totals ?? {}; const cost = t.cost ?? {}; const sub = cost.estimatedCostUsd ?? 0; const unsub = (body as any).data?.cost?.apiUsd ?? 0; return `${t.totalTokens ?? 0} tokens across ${t.runs ?? 0} runs\n$${Number(sub).toFixed(6)} absorbed by your subs\n$${Number(unsub).toFixed(6)} on API fallback`; }
function saveKey(value: string) { mkdirSync(join(configPath, '..'), { recursive: true, mode: 0o700 }); writeFileSync(configPath, JSON.stringify({ key: value }), { mode: 0o600 }); chmodSync(configPath, 0o600); }
const [command, ...args] = process.argv.slice(2);
if (command === 'init') { const supplied = args[0] ?? process.env.PATTY_API_KEY; if (!supplied) throw new Error('pass the one-time cp_live key as `patty init <key>`'); saveKey(supplied); console.log(`saved key to ${configPath}`); }
else if (command === 'accounts' && args[0] === 'list') await request('/v1/accounts');
else if (command === 'accounts' && args[0] === 'add') await request('/v1/accounts/codex/login', { method: 'POST', body: JSON.stringify({ alias: args[1], mode: args[2] ?? 'browser' }) });
else if (command === 'accounts' && args[0] === 'refresh') await request(`/v1/accounts/${args[1]}/refresh`, { method: 'POST' });
else if (command === 'accounts' && args[0] === 'remove') await request(`/v1/accounts/${args[1]}`, { method: 'DELETE' });
else if (command === 'keys' && args[0] === 'list') await request('/v1/api-keys');
else if (command === 'keys' && args[0] === 'create') await request('/v1/api-keys', { method: 'POST', body: JSON.stringify({ name: args.slice(1).join(' ') }) });
else if (command === 'keys' && args[0] === 'limit') { const limit = (value?: string) => value === undefined || value === 'none' ? null : Number(value); await request(`/v1/api-keys/${args[1]}/limits`, { method: 'PUT', body: JSON.stringify({ rpm: limit(args[2]), concurrency: limit(args[3]) }) }); }
else if (command === 'keys' && args[0] === 'revoke') await request(`/v1/api-keys/${args[1]}`, { method: 'DELETE' });
else if (command === 'models') await request('/v1/models');
else if (command === 'usage') await request('/v1/usage', {}, formatUsage);
else if (command === 'status') await request('/v1/router/status', {}, formatStatus);
else if (command === 'doctor') await request('/v1/doctor');
else if (command === 'runs') await request('/v1/runs' + (args.length ? '?' + args.join('&') : ''));
else if (command === 'thread') await request('/v1/threads', { method: 'POST', body: JSON.stringify({ model: args[0], accountId: args[1] }) });
else if (command === 'turn') await request(`/v1/threads/${args[0]}/turns`, { method: 'POST', body: JSON.stringify({ model: args[1], input: args.slice(2).join(' ') }) });
else if (command === 'approve') await request(`/v1/runs/${args[0]}/approvals/${args[1]}`, { method: 'POST', body: JSON.stringify({ approved: args[2] === 'yes' }) });
else if (command === 'events') { const response=await fetch(`${base}/v1/runs/${args[0]}/events`,{headers:{authorization:`Bearer ${key??''}`}}); if(!response.body) throw new Error('SSE unavailable'); for await(const chunk of response.body) process.stdout.write(Buffer.from(chunk).toString()); }
else if (command === 'cancel') await request(`/v1/runs/${args[0]}/cancel`, { method: 'POST' });
else if (command === 'run') await request('/v1/runs', { method: 'POST', body: JSON.stringify({ model: args[0], input: args.slice(1).join(' ') }) });
else { process.exitCode=1; console.error('usage: patty init <key> | accounts add|list|refresh|remove | keys create <name>|list|limit <id> <rpm|none> <concurrency|none>|revoke <id> | models | usage | status | doctor | runs [sub=..] [model=..] [status=..] [limit=..] | thread <model> [account] | turn <thread> <model> <input> | events <run> | approve <run> <approval> yes|no | run <model> <input> | cancel <run>'); }
