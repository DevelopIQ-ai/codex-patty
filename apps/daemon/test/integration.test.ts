import { access, chmod, mkdtemp, readFile, stat, symlink, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PattyDaemon, privateDirectory } from '../src/server.js';
import type { FakeAdapter } from '../src/core.js';
let server: Server | undefined;
afterEach(async () => { await new Promise<void>(resolveClose => server?.close(() => resolveClose()) ?? resolveClose()); server = undefined; });
describe('loopback HTTP API', () => {
  it('requires a local key and creates an idempotent run', async () => { const daemon = new PattyDaemon(); daemon.addFakeAccount('one'); server = await daemon.listen(); const address = server.address() as { port: number }; const url = `http://127.0.0.1:${address.port}`; expect((await fetch(`${url}/v1/accounts`)).status).toBe(401); const headers = { authorization: `Bearer ${daemon.key}`, 'content-type': 'application/json' }; const input = { model: 'gpt-5-codex', input: 'hello', idempotencyKey: 'same' }; const one = await fetch(`${url}/v1/runs`, { method: 'POST', headers, body: JSON.stringify(input) }); expect(one.status).toBe(202); const first = await one.json() as { id: string }; const two = await fetch(`${url}/v1/runs`, { method: 'POST', headers, body: JSON.stringify(input) }); expect((await two.json() as { id: string }).id).toBe(first.id); const conflict = await fetch(`${url}/v1/runs`, { method: 'POST', headers, body: JSON.stringify({ ...input, input: 'different' }) }); expect((await conflict.json() as { error: { code: string } }).error.code).toBe('idempotency_conflict'); });
  it('returns a JSON 404 rather than opening SSE for an unknown run', async () => { const daemon = new PattyDaemon(); server = await daemon.listen(); const address = server.address() as { port: number }; const response = await fetch(`http://127.0.0.1:${address.port}/v1/runs/missing/events`, { headers: { authorization: `Bearer ${daemon.key}` } }); expect(response.status).toBe(404); expect(response.headers.get('content-type')).toContain('application/json'); });
  it('refuses remote binding', () => expect(() => new PattyDaemon().listen(0, '0.0.0.0')).toThrow('loopback'));
  it('publishes the built daemon at the bin target', async () => { const manifest = JSON.parse(await readFile(resolve(import.meta.dirname, '../package.json'), 'utf8')) as { bin: { pattyd: string } }; expect(manifest.bin.pattyd).toBe('./dist/src/main.js'); await expect(access(resolve(import.meta.dirname, '..', manifest.bin.pattyd))).resolves.toBeUndefined(); });
});

describe('SSE lifecycle', () => {
  it('retains terminal events and closes the stream', async () => { const daemon = new PattyDaemon(); daemon.addFakeAccount('one'); server = await daemon.listen(); const port = (server.address() as { port: number }).port; const headers = { authorization: `Bearer ${daemon.key}`, 'content-type': 'application/json' }; const created = await fetch(`http://127.0.0.1:${port}/v1/runs`, { method: 'POST', headers, body: JSON.stringify({ model: 'gpt-5-codex', input: 'x' }) }); const { id } = await created.json() as { id: string }; await new Promise(resolve => setTimeout(resolve, 10)); const stream = await fetch(`http://127.0.0.1:${port}/v1/runs/${id}/events`, { headers }); const text = await stream.text(); expect(text).toContain('id: 1'); expect(text).toContain('"type":"completed"'); });
});

it('returns an allowlisted public run DTO', async () => { const daemon = new PattyDaemon(); const account = daemon.addFakeAccount('dto'); server = await daemon.listen(); const port = (server.address() as {port:number}).port; const headers={authorization:`Bearer ${daemon.key}`,'content-type':'application/json'}; const created=await fetch(`http://127.0.0.1:${port}/v1/runs`,{method:'POST',headers,body:JSON.stringify({model:'gpt-5-codex',input:'secret'})}); const {id}=await created.json() as {id:string}; const dto=await (await fetch(`http://127.0.0.1:${port}/v1/runs/${id}`,{headers})).json() as Record<string,unknown>; expect(dto).toHaveProperty('id'); expect(dto).not.toHaveProperty('provider_turn_id'); expect(dto).not.toHaveProperty('fingerprint'); expect(dto).not.toHaveProperty('idempotency_key'); });

it('uses strict method dispatch and validates thread turns', async () => { const daemon = new PattyDaemon(); daemon.addFakeAccount('strict'); server = await daemon.listen(); const port=(server.address() as {port:number}).port; const headers={authorization:`Bearer ${daemon.key}`,'content-type':'application/json'}; expect((await fetch(`http://127.0.0.1:${port}/v1/runs`,{method:'PUT',headers})).status).toBe(404);expect((await fetch(`http://127.0.0.1:${port}/v1/runs`,{method:'GET',headers})).status).toBe(200); const thread=await (await fetch(`http://127.0.0.1:${port}/v1/threads`,{method:'POST',headers,body:JSON.stringify({model:'gpt-5-codex'})})).json() as {threadId:string}; expect((await fetch(`http://127.0.0.1:${port}/v1/threads/${thread.threadId}/turns`,{method:'POST',headers,body:JSON.stringify({model:'gpt-5-codex',input:''})})).status).toBe(400); expect((await fetch(`http://127.0.0.1:${port}/v1/threads/${thread.threadId}/turns`,{method:'GET',headers})).status).toBe(405); });
it('rejects cancellation of a terminal run', async () => { const daemon=new PattyDaemon(); daemon.addFakeAccount('terminal'); server=await daemon.listen(); const port=(server.address() as {port:number}).port;const headers={authorization:`Bearer ${daemon.key}`,'content-type':'application/json'};const run=await (await fetch(`http://127.0.0.1:${port}/v1/runs`,{method:'POST',headers,body:JSON.stringify({model:'gpt-5-codex',input:'x'})})).json() as {id:string};await new Promise(resolve=>setTimeout(resolve,10));expect((await fetch(`http://127.0.0.1:${port}/v1/runs/${run.id}/cancel`,{method:'POST',headers})).status).toBe(409); });

it('emits executable Node shebangs for both packaged entrypoints', async () => { const daemonEntry=await readFile(resolve(import.meta.dirname,'../dist/src/main.js'),'utf8'); const cliEntry=await readFile(resolve(import.meta.dirname,'../../cli/dist/index.js'),'utf8'); expect(daemonEntry.startsWith('#!/usr/bin/env node')).toBe(true); expect(cliEntry.startsWith('#!/usr/bin/env node')).toBe(true); });

it('accepts only GET health checks', async () => { const daemon=new PattyDaemon(); server=await daemon.listen(); const port=(server.address() as {port:number}).port; expect((await fetch(`http://127.0.0.1:${port}/healthz`)).status).toBe(200); expect((await fetch(`http://127.0.0.1:${port}/healthz`,{method:'POST'})).status).toBe(405); });

it('rejects non-boolean approval decisions', async () => { const daemon=new PattyDaemon();daemon.addFakeAccount('approval');server=await daemon.listen();const port=(server.address() as {port:number}).port;const headers={authorization:`Bearer ${daemon.key}`,'content-type':'application/json'};const response=await fetch(`http://127.0.0.1:${port}/v1/runs/nope/approvals/a`,{method:'POST',headers,body:JSON.stringify({approved:'false'})});expect(response.status).toBe(400); });

it('exposes authenticated models and router status', async () => { const daemon=new PattyDaemon();daemon.addFakeAccount('pool');server=await daemon.listen();const port=(server.address() as {port:number}).port;const headers={authorization:`Bearer ${daemon.key}`};expect((await fetch(`http://127.0.0.1:${port}/v1/models`,{headers})).status).toBe(200);expect((await fetch(`http://127.0.0.1:${port}/v1/router/status`,{headers})).status).toBe(200); });

it('fails closed before creating account state when live prerequisites are absent', async () => { const keys=['PATTY_ENABLE_LIVE_CODEX','PATTY_AUTHORIZATION_EVIDENCE','PATTY_AUTHORIZATION_SHA256','PATTY_CODEX_COMMAND','PATTY_CODEX_VERSION'] as const;const saved=new Map(keys.map(key=>[key,process.env[key]]));for(const key of keys)delete process.env[key];const daemon=new PattyDaemon();try{await expect(daemon.addCodexAccount('offline','device_code')).rejects.toThrow('verified local authorization evidence and pinned command');expect(daemon.store.accounts()).toEqual([]);expect(daemon.adapters.size).toBe(0);expect(daemon.homes.size).toBe(0);}finally{await daemon.shutdown();for(const [key,value] of saved)value===undefined?delete process.env[key]:process.env[key]=value;} });


it('enforces owner-only, non-symlink Codex home directories', async () => { const root = await mkdtemp(join(tmpdir(), 'patty-home-')); const privateRoot = privateDirectory(join(root, 'accounts')); expect((await stat(privateRoot)).mode & 0o777).toBe(0o700); await symlink(privateRoot, join(root, 'link')); expect(() => privateDirectory(join(root, 'link'))).toThrow('unsafe_account_home'); await chmod(privateRoot, 0o755); expect(privateDirectory(privateRoot)).toBe(privateRoot); expect((await stat(privateRoot)).mode & 0o777).toBe(0o700); });

it('serves the loopback console without a key and reports usage only with one', async () => { const daemon=new PattyDaemon();daemon.addFakeAccount('console');server=await daemon.listen();const port=(server.address() as {port:number}).port;const page=await fetch(`http://127.0.0.1:${port}/`);expect(page.status).toBe(200);expect(page.headers.get('content-type')).toContain('text/html');expect(await page.text()).toContain('Codex Patty');expect((await fetch(`http://127.0.0.1:${port}/v1/usage`)).status).toBe(401); });

it('reports measured token usage per sub after a routed run', async () => { const daemon=new PattyDaemon();const account=daemon.addFakeAccount('measured');server=await daemon.listen();const port=(server.address() as {port:number}).port;const headers={authorization:`Bearer ${daemon.key}`,'content-type':'application/json'};await fetch(`http://127.0.0.1:${port}/v1/runs`,{method:'POST',headers,body:JSON.stringify({model:'gpt-5-codex',input:'count these tokens please'})});await new Promise(resolve=>setTimeout(resolve,10));const {data}=await (await fetch(`http://127.0.0.1:${port}/v1/usage`,{headers})).json() as {data:{totals:{runs:number;inputTokens:number;outputTokens:number};accounts:{accountId:string;alias:string;totalTokens:number}[];runs:{model:string}[]}};expect(data.totals.runs).toBe(1);expect(data.totals.inputTokens).toBeGreaterThan(0);expect(data.totals.outputTokens).toBeGreaterThan(0);expect(data.accounts).toHaveLength(1);expect(data.accounts[0]).toMatchObject({accountId:account.id,alias:'measured'});expect(data.runs[0]).toMatchObject({model:'gpt-5-codex'}); });

it('replays in-flight output text to a subscriber that joins after the turn produced it', async () => { const daemon=new PattyDaemon();daemon.addFakeAccount('replay');server=await daemon.listen();const port=(server.address() as {port:number}).port;const headers={authorization:`Bearer ${daemon.key}`,'content-type':'application/json'};const {id}=await (await fetch(`http://127.0.0.1:${port}/v1/runs`,{method:'POST',headers,body:JSON.stringify({model:'gpt-5-codex',input:'late subscriber'})})).json() as {id:string};await new Promise(resolve=>setTimeout(resolve,10));const stream=await fetch(`http://127.0.0.1:${port}/v1/runs/${id}/events`,{headers});const frames=await stream.text();const deltas=frames.split('\n\n').map(frame=>frame.split('\n').find(line=>line.startsWith('data: '))).filter(Boolean).map(line=>JSON.parse(line!.slice(6)) as {type:string;data?:{text?:string}}).filter(event=>event.type==='delta');expect(deltas).toHaveLength(1);expect(deltas[0]!.data?.text).toBe('fake: late subscriber');expect(daemon.store.db.prepare("SELECT data FROM run_events WHERE run_id=? AND type='delta'").get(id)).toMatchObject({data:JSON.stringify({redacted:true})}); });

it('hides removed subs from accounts, router status, and models while keeping their usage history', async () => { const daemon=new PattyDaemon();const kept=daemon.addFakeAccount('kept');const dropped=daemon.addFakeAccount('dropped');server=await daemon.listen();const port=(server.address() as {port:number}).port;const headers={authorization:`Bearer ${daemon.key}`,'content-type':'application/json'};await fetch(`http://127.0.0.1:${port}/v1/runs`,{method:'POST',headers,body:JSON.stringify({model:'gpt-5-codex',input:'before removal',accountId:dropped.id})});await new Promise(resolve=>setTimeout(resolve,10));expect((await fetch(`http://127.0.0.1:${port}/v1/accounts/${dropped.id}`,{method:'DELETE',headers})).status).toBe(204);const list=await (await fetch(`http://127.0.0.1:${port}/v1/accounts`,{headers})).json() as {data:{id:string}[]};expect(list.data.map(account=>account.id)).toEqual([kept.id]);const router=await (await fetch(`http://127.0.0.1:${port}/v1/router/status`,{headers})).json() as {data:{alias:string}[]};expect(router.data.map(entry=>entry.alias)).toEqual(['kept']);const usage=await (await fetch(`http://127.0.0.1:${port}/v1/usage`,{headers})).json() as {data:{accounts:{alias:string}[]}};expect(usage.data.accounts.map(entry=>entry.alias)).toEqual(['dropped']); });

describe('restart restore', () => {
  const liveKeys = ['PATTY_ENABLE_LIVE_CODEX', 'PATTY_AUTHORIZATION_EVIDENCE', 'PATTY_AUTHORIZATION_SHA256', 'PATTY_CODEX_COMMAND', 'PATTY_CODEX_VERSION', 'PATTY_ACCOUNT_HOME_ROOT'] as const;
  async function withLive<T>(dir: string, command: string, body: () => Promise<T>) { const saved = new Map(liveKeys.map(key => [key, process.env[key]])); const evidence = join(dir, 'evidence.txt'); await writeFile(evidence, 'attested'); process.env.PATTY_ENABLE_LIVE_CODEX = '1'; process.env.PATTY_AUTHORIZATION_EVIDENCE = evidence; process.env.PATTY_AUTHORIZATION_SHA256 = createHash('sha256').update(await readFile(evidence)).digest('hex'); process.env.PATTY_CODEX_COMMAND = command; process.env.PATTY_CODEX_VERSION = '0.145.0'; process.env.PATTY_ACCOUNT_HOME_ROOT = join(dir, 'accounts'); try { return await body(); } finally { for (const [key, value] of saved) value === undefined ? delete process.env[key] : process.env[key] = value; } }
  const stub = `#!/usr/bin/env node
if(process.argv.includes('--version')){console.log('codex-cli 0.145.0');process.exit(0)}
const rl=require('node:readline').createInterface({input:process.stdin});rl.on('line',line=>{const r=JSON.parse(line),out=x=>process.stdout.write(JSON.stringify(x)+'\\n');if(r.method==='initialize')out({jsonrpc:'2.0',id:r.id,result:{userAgent:'stub',codexHome:process.env.CODEX_HOME,platformFamily:'unix',platformOs:'linux'}});if(r.method==='account/login/start')out({jsonrpc:'2.0',id:r.id,result:{type:'chatgptDeviceCode',loginId:'login-1',verificationUrl:'https://example.invalid',userCode:'CODE'}});if(r.method==='account/logout')out({jsonrpc:'2.0',id:r.id,result:{}});if(r.method==='account/read')out({jsonrpc:'2.0',id:r.id,result:{account:{type:'chatgpt',email:null,planType:'pro'},requiresOpenaiAuth:true}});if(r.method==='model/list')out({jsonrpc:'2.0',id:r.id,result:{data:[{id:'gpt-5-codex',model:'gpt-5-codex'}],nextCursor:null}});if(r.method==='account/rateLimits/read')out({jsonrpc:'2.0',id:r.id,result:{rateLimits:{primary:{usedPercent:25,windowDurationMins:null,resetsAt:100},secondary:null}}});});
`;
  /** Without restore, a sub logged in before a restart is stranded in reconnect_required with no worker. */
  it('re-attaches a persisted sub whose isolated home survives a restart', async () => { const dir = await mkdtemp(join(tmpdir(), 'patty-restore-')); const command = join(dir, 'codex'); await writeFile(command, stub); await chmod(command, 0o700); await withLive(dir, command, async () => { const first = new PattyDaemon(join(dir, 'patty.sqlite')); await first.addCodexAccount('sub-one', 'device_code'); await first.shutdown(); const second = new PattyDaemon(join(dir, 'patty.sqlite')); try { expect(second.adapters.size).toBe(0); expect((await second.restoreCodexAccounts()).map(account => account.alias)).toEqual(['sub-one']); expect(second.store.accounts()[0]).toMatchObject({ alias: 'sub-one', state: 'ready', models: ['gpt-5-codex'] }); expect(second.store.accounts()[0]?.quota.remaining).toBeCloseTo(.75); } finally { await second.shutdown(); } }); });
  it('restores nothing while the live gate is closed', async () => { const saved = new Map(liveKeys.map(key => [key, process.env[key]])); for (const key of liveKeys) delete process.env[key]; const daemon = new PattyDaemon(); try { expect(await daemon.restoreCodexAccounts()).toEqual([]); expect(daemon.adapters.size).toBe(0); } finally { await daemon.shutdown(); for (const [key, value] of saved) value === undefined ? delete process.env[key] : process.env[key] = value; } });
});

describe('OpenAI-compatible surface', () => {
  const setup = async () => { const daemon = new PattyDaemon(); daemon.addFakeAccount('sub-a'); server = await daemon.listen(); const { port } = server.address() as { port: number }; return { daemon, url: `http://127.0.0.1:${port}`, headers: { authorization: `Bearer ${daemon.key}`, 'content-type': 'application/json' } }; };

  it('answers a non-streaming chat completion with provider counts and the serving sub', async () => { const { url, headers } = await setup();
    const response = await fetch(`${url}/v1/chat/completions`, { method: 'POST', headers, body: JSON.stringify({ model: 'gpt-5-codex', messages: [{ role: 'system', content: 'be terse' }, { role: 'user', content: 'hi there' }] }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('x-patty-sub')).toBe('sub-a');
    const body = await response.json() as { object: string; choices: { message: { role: string; content: string }; finish_reason: string }[]; usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number; prompt_tokens_details: { cached_tokens: number } } };
    expect(body.object).toBe('chat.completion');
    expect(body.choices[0]?.finish_reason).toBe('stop');
    // The fake worker echoes its flattened input, which proves the transcript reached the provider with both roles.
    expect(body.choices[0]?.message).toEqual({ role: 'assistant', content: 'fake: system: be terse\n\nuser: hi there' });
    expect(body.usage.total_tokens).toBe(body.usage.prompt_tokens + body.usage.completion_tokens);
    expect(body.usage.prompt_tokens).toBeGreaterThan(0);
    expect(body.usage.prompt_tokens_details.cached_tokens).toBe(0);
  });

  it('streams OpenAI chunks and reports usage on the final chunk', async () => { const { url, headers } = await setup();
    const response = await fetch(`${url}/v1/chat/completions`, { method: 'POST', headers, body: JSON.stringify({ model: 'gpt-5-codex', messages: [{ role: 'user', content: [{ type: 'text', text: 'stream me' }] }], stream: true }) });
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const payload = await response.text();
    const chunks = payload.split('\n\n').filter(line => line.startsWith('data: ')).map(line => line.slice(6));
    expect(chunks.at(-1)).toBe('[DONE]');
    const parsed = chunks.slice(0, -1).map(chunk => JSON.parse(chunk) as { object: string; choices: { delta: { role?: string; content?: string }; finish_reason: string | null }[]; usage?: { total_tokens: number } });
    expect(parsed[0]?.choices[0]?.delta.role).toBe('assistant');
    expect(parsed.map(chunk => chunk.choices[0]?.delta.content ?? '').join('')).toBe('fake: stream me');
    expect(parsed.at(-1)?.choices[0]?.finish_reason).toBe('stop');
    expect(parsed.at(-1)?.usage?.total_tokens).toBeGreaterThan(0);
    expect(parsed.every(chunk => chunk.object === 'chat.completion.chunk')).toBe(true);
  });

  it('rejects a request without usable message text', async () => { const { url, headers } = await setup();
    for (const body of [{ model: 'gpt-5-codex' }, { model: 'gpt-5-codex', messages: [] }, { messages: [{ role: 'user', content: 'hi' }] }])
      expect((await fetch(`${url}/v1/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body) })).status).toBe(400);
  });

  it('lists models in OpenAI shape and names the subs serving each one', async () => { const { daemon, url, headers } = await setup();
    daemon.addFakeAccount('sub-b', ['gpt-5-codex', 'gpt-5.5']);
    const body = await (await fetch(`${url}/v1/models`, { headers })).json() as { object: string; data: { id: string; object: string; owned_by: string; subs: string[] }[] };
    expect(body.object).toBe('list');
    expect(body.data.map(model => model.id)).toEqual(['gpt-5-codex', 'gpt-5.5']);
    expect(body.data[0]).toMatchObject({ object: 'model', owned_by: 'codex-patty', subs: ['sub-a', 'sub-b'] });
    expect(body.data[1]?.subs).toEqual(['sub-b']);
  });

  it('meters chat completions into the same per-sub usage report as /v1/runs', async () => { const { url, headers } = await setup();
    await fetch(`${url}/v1/chat/completions`, { method: 'POST', headers, body: JSON.stringify({ model: 'gpt-5-codex', messages: [{ role: 'user', content: 'metered' }] }) });
    const report = await (await fetch(`${url}/v1/usage`, { headers })).json() as { data: { totals: { runs: number; totalTokens: number }; accounts: { alias: string; runs: number }[] } };
    expect(report.data.totals.runs).toBe(1);
    expect(report.data.totals.totalTokens).toBeGreaterThan(0);
    expect(report.data.accounts).toMatchObject([{ alias: 'sub-a', runs: 1 }]);
  });
});

describe('quota failover', () => {
  it('retries a 429 on another sub, parks the burned one until its reset, and still answers the caller', async () => {
    const daemon = new PattyDaemon();
    const burned = daemon.addFakeAccount('burned', ['gpt-5-codex'], .9);
    daemon.addFakeAccount('spare', ['gpt-5-codex'], .5);
    const resetAt = new Date(Date.now() + 3_600_000).toISOString();
    burned.quota = { remaining: .9, resetAt, observedAt: new Date().toISOString() };
    daemon.store.updateAccount(burned);
    (daemon.adapters.get(burned.id) as FakeAdapter).failNext('HTTP 429 rate limit reached');
    server = await daemon.listen();
    const { port } = server.address() as { port: number };
    const headers = { authorization: `Bearer ${daemon.key}`, 'content-type': 'application/json' };
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: 'POST', headers, body: JSON.stringify({ model: 'gpt-5-codex', messages: [{ role: 'user', content: 'survive the 429' }] }) });
    expect(response.status).toBe(200);
    const body = await response.json() as { choices: { message: { content: string } }[] };
    expect(body.choices[0]?.message.content).toBe('fake: survive the 429');
    // The burned sub was picked first (higher quota), so the answer proves the retry landed elsewhere.
    expect(daemon.store.account(burned.id)).toMatchObject({ quota: { remaining: 0, resetAt }, cooldownUntil: resetAt });
    const usage = await (await fetch(`http://127.0.0.1:${port}/v1/usage`, { headers })).json() as { data: { accounts: { alias: string }[] } };
    expect(usage.data.accounts.map(entry => entry.alias)).toEqual(['spare']);
    const attempts = daemon.store.db.prepare('SELECT account_id,attempt,reason FROM run_attempts ORDER BY attempt').all() as { account_id: string; attempt: number; reason: string }[];
    expect(attempts.map(attempt => attempt.reason)).toEqual(['selected', 'quota_failover']);
    expect(attempts[0]?.account_id).toBe(burned.id);
  });

  it('fails the run as quota_exhausted when every sub is out of headroom', async () => {
    const daemon = new PattyDaemon();
    const only = daemon.addFakeAccount('only', ['gpt-5-codex'], .4);
    (daemon.adapters.get(only.id) as FakeAdapter).failNext('usage limit reached', 2);
    server = await daemon.listen();
    const { port } = server.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${daemon.key}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'gpt-5-codex', messages: [{ role: 'user', content: 'nowhere to go' }] }) });
    expect(response.status).toBe(502);
    expect(daemon.store.run(response.headers.get('x-patty-run')!)).toMatchObject({ status: 'failed' });
    expect(daemon.store.account(only.id)?.quota.remaining).toBe(0);
  });

  it('routes to a sub whose window has already rolled over even though its last snapshot read empty', async () => {
    const daemon = new PattyDaemon();
    const stale = daemon.addFakeAccount('stale', ['gpt-5-codex'], 0);
    stale.quota = { remaining: 0, resetAt: new Date(Date.now() - 60_000).toISOString(), observedAt: new Date(Date.now() - 7_200_000).toISOString() };
    daemon.store.updateAccount(stale);
    server = await daemon.listen();
    const { port } = server.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${daemon.key}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'gpt-5-codex', messages: [{ role: 'user', content: 'window rolled over' }] }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('x-patty-sub')).toBe('stale');
  });
});

describe('router status', () => {
  it('explains the ranking with quota windows rather than a redacted score', async () => {
    const daemon = new PattyDaemon();
    const roomy = daemon.addFakeAccount('roomy', ['gpt-5-codex'], .8);
    const tight = daemon.addFakeAccount('tight', ['gpt-5-codex'], .2);
    tight.quota = { remaining: .2, resetAt: new Date(Date.now() + 1_800_000).toISOString(), observedAt: new Date().toISOString() };
    daemon.store.updateAccount(tight);
    server = await daemon.listen();
    const { port } = server.address() as { port: number };
    const body = await (await fetch(`http://127.0.0.1:${port}/v1/router/status?model=gpt-5-codex`, { headers: { authorization: `Bearer ${daemon.key}` } })).json() as { data: { alias: string; eligible: boolean; effectiveQuota: number; resetsInMs?: number; score: number }[] };
    expect(body.data.map(entry => entry.alias)).toEqual(['roomy', 'tight']);
    expect(body.data.every(entry => entry.eligible)).toBe(true);
    expect(body.data[0]?.score).toBeGreaterThan(body.data[1]!.score);
    expect(body.data[0]?.effectiveQuota).toBeCloseTo(.8);
    expect(body.data[0]?.resetsInMs).toBeUndefined();
    expect(body.data[1]?.resetsInMs).toBeGreaterThan(1_700_000);
    expect(daemon.store.account(roomy.id)?.alias).toBe('roomy');
  });

  it('marks a model nobody serves as ineligible without hiding the sub', async () => {
    const daemon = new PattyDaemon();
    daemon.addFakeAccount('only-codex', ['gpt-5-codex']);
    server = await daemon.listen();
    const { port } = server.address() as { port: number };
    const body = await (await fetch(`http://127.0.0.1:${port}/v1/router/status?model=gpt-4o`, { headers: { authorization: `Bearer ${daemon.key}` } })).json() as { data: { alias: string; ready: boolean; eligible: boolean }[] };
    expect(body.data).toMatchObject([{ alias: 'only-codex', ready: true, eligible: false }]);
  });
});

describe('multiple API keys', () => {
  it('issues named keys, attributes usage to the caller, and revokes one without affecting the other', async () => {
    const daemon = new PattyDaemon();
    daemon.addFakeAccount('shared', ['gpt-5-codex']);
    server = await daemon.listen();
    const { port } = server.address() as { port: number };
    const bootstrap = { authorization: `Bearer ${daemon.key}`, 'content-type': 'application/json' };
    const issue = async (name: string) => await (await fetch(`http://127.0.0.1:${port}/v1/api-keys`, { method: 'POST', headers: bootstrap, body: JSON.stringify({ name }) })).json() as { id: string; name: string; key: string; warning: string };
    const prod = await issue('puffle-prod');
    const dev = await issue('puffle-dev');
    expect(prod).toMatchObject({ name: 'puffle-prod', warning: 'secret shown once; store it securely' });
    const complete = async (key: string, content: string) => await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'gpt-5-codex', messages: [{ role: 'user', content }] }) });
    expect((await complete(prod.key, 'from prod')).status).toBe(200);
    expect((await complete(prod.key, 'from prod again')).status).toBe(200);
    expect((await complete(dev.key, 'from dev')).status).toBe(200);
    const usage = await (await fetch(`http://127.0.0.1:${port}/v1/usage`, { headers: bootstrap })).json() as { data: { keys: { keyId: string; name: string; runs: number }[] } };
    expect(usage.data.keys).toMatchObject([{ keyId: prod.id, name: 'puffle-prod', runs: 2 }, { keyId: dev.id, name: 'puffle-dev', runs: 1 }]);
    expect((await fetch(`http://127.0.0.1:${port}/v1/api-keys/${prod.id}`, { method: 'DELETE', headers: bootstrap })).status).toBe(204);
    expect((await complete(prod.key, 'revoked')).status).toBe(401);
    expect((await complete(dev.key, 'still fine')).status).toBe(200);
  });

  it('lists keys with their state and never re-exposes a secret', async () => {
    const daemon = new PattyDaemon();
    server = await daemon.listen();
    const { port } = server.address() as { port: number };
    const headers = { authorization: `Bearer ${daemon.key}`, 'content-type': 'application/json' };
    const issued = await (await fetch(`http://127.0.0.1:${port}/v1/api-keys`, { method: 'POST', headers, body: JSON.stringify({ name: 'ci' }) })).json() as { id: string; key: string };
    await fetch(`http://127.0.0.1:${port}/v1/api-keys/${issued.id}`, { method: 'DELETE', headers });
    const listed = await (await fetch(`http://127.0.0.1:${port}/v1/api-keys`, { headers })).json() as { data: { id: string; name: string | null; prefix: string; revoked_at: string | null }[] };
    const ci = listed.data.find(entry => entry.id === issued.id);
    expect(ci).toMatchObject({ name: 'ci' });
    expect(ci?.revoked_at).not.toBeNull();
    expect(JSON.stringify(listed)).not.toContain(issued.key);
    expect(JSON.stringify(listed)).not.toContain(issued.key.slice(-12));
  });
});

describe('observability', () => {
  it('exposes Prometheus metrics covering quota windows, failover reasons and token totals', async () => {
    const daemon = new PattyDaemon();
    const burned = daemon.addFakeAccount('burned', ['gpt-5-codex'], .9);
    daemon.addFakeAccount('spare', ['gpt-5-codex'], .5);
    burned.quota = { remaining: .9, resetAt: new Date(Date.now() + 600_000).toISOString(), observedAt: new Date().toISOString() };
    daemon.store.updateAccount(burned);
    (daemon.adapters.get(burned.id) as FakeAdapter).failNext('HTTP 429 usage limit');
    server = await daemon.listen();
    const { port } = server.address() as { port: number };
    const headers = { authorization: `Bearer ${daemon.key}`, 'content-type': 'application/json' };
    await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: 'POST', headers, body: JSON.stringify({ model: 'gpt-5-codex', messages: [{ role: 'user', content: 'metrics run' }] }) });
    const response = await fetch(`http://127.0.0.1:${port}/metrics`, { headers });
    expect(response.headers.get('content-type')).toContain('text/plain');
    const body = await response.text();
    expect(body).toContain('# TYPE patty_sub_quota_remaining gauge');
    expect(body).toMatch(/patty_sub_quota_remaining\{sub="burned"\} 0\b/);
    expect(body).toMatch(/patty_sub_quota_reset_seconds\{sub="burned"\} \d+/);
    expect(body).toMatch(/patty_run_attempts_total\{reason="quota_failover"\} 1/);
    expect(body).toMatch(/patty_runs_total\{status="completed"\} 1/);
    expect(body).toMatch(/patty_tokens_total\{sub="spare",direction="input"\} \d+/);
    expect((await fetch(`http://127.0.0.1:${port}/metrics`)).status).toBe(401);
  });

  it('filters run history by sub, model and status', async () => {
    const daemon = new PattyDaemon();
    daemon.addFakeAccount('one', ['gpt-5-codex']);
    daemon.addFakeAccount('two', ['gpt-5-codex']);
    server = await daemon.listen();
    const { port } = server.address() as { port: number };
    const headers = { authorization: `Bearer ${daemon.key}`, 'content-type': 'application/json' };
    for (const content of ['first', 'second', 'third']) await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: 'POST', headers, body: JSON.stringify({ model: 'gpt-5-codex', messages: [{ role: 'user', content }] }) });
    const history = async (query: string) => (await (await fetch(`http://127.0.0.1:${port}/v1/runs${query}`, { headers })).json() as { data: { runId: string; alias: string; status: string; model: string; attempts: number }[] }).data;
    const all = await history('');
    expect(all).toHaveLength(3);
    expect(all.every(entry => entry.status === 'completed' && entry.attempts === 1)).toBe(true);
    expect(await history('?status=failed')).toHaveLength(0);
    expect(await history('?model=gpt-4o')).toHaveLength(0);
    expect(await history('?limit=1')).toHaveLength(1);
    const sub = all[0]!.alias;
    expect((await history(`?sub=${sub}`)).every(entry => entry.alias === sub)).toBe(true);
    expect(await history('?sub=nobody')).toHaveLength(0);
  });

  it('reports actionable doctor checks instead of a bare router dump', async () => {
    const empty = new PattyDaemon();
    server = await empty.listen();
    let port = (server.address() as { port: number }).port;
    const read = async (daemon: PattyDaemon, at: number) => await (await fetch(`http://127.0.0.1:${at}/v1/doctor`, { headers: { authorization: `Bearer ${daemon.key}` } })).json() as { data: { ok: boolean; checks: { check: string; ok: boolean; hint?: string }[] } };
    const bare = await read(empty, port);
    expect(bare.data.ok).toBe(false);
    expect(bare.data.checks.find(check => check.check === 'subs_stacked')).toMatchObject({ ok: false });
    expect(bare.data.checks.find(check => check.check === 'subs_stacked')?.hint).toContain('--fake');
    server.close();

    const stacked = new PattyDaemon();
    stacked.addFakeAccount('healthy', ['gpt-5-codex']);
    server = await stacked.listen();
    port = (server.address() as { port: number }).port;
    const ready = await read(stacked, port);
    expect(ready.data.ok).toBe(true);
    expect(ready.data.checks.map(check => check.check)).toEqual(['subs_stacked', 'subs_servable', 'models_discovered', 'live_codex', 'active_keys', 'store_writable']);
    expect(ready.data.checks.filter(check => check.hint !== undefined).map(check => check.check)).toEqual(['live_codex']);
  });
});

describe('OpenAI-compatible provider adapter', () => {
  const upstream = (handler: (path: string, body: unknown) => Response): typeof fetch => (async (input: string | URL | Request, init?: RequestInit) => handler(new URL(String(input)).pathname, init?.body ? JSON.parse(String(init.body)) : undefined)) as unknown as typeof fetch;
  const sse = (chunks: string[]) => new Response(new ReadableStream({ start(controller) { for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk)); controller.close(); } }), { headers: { 'x-ratelimit-remaining-requests': '40', 'x-ratelimit-limit-requests': '100', 'x-ratelimit-reset-requests': '120s' } });

  it('stacks a third-party endpoint, streams its answer and meters its reported usage', async () => {
    const daemon = new PattyDaemon();
    const fetchImpl = upstream((path) => path.endsWith('/models')
      ? new Response(JSON.stringify({ data: [{ id: 'llama-3.3-70b' }, { id: 'gpt-4o-mini' }] }), { headers: { 'content-type': 'application/json', 'x-ratelimit-remaining-requests': '40', 'x-ratelimit-limit-requests': '100' } })
      : sse(['data: {"choices":[{"delta":{"content":"hello "}}]}\n', 'data: {"choices":[{"delta":{"content":"from llama"}}]}\n', 'data: {"usage":{"prompt_tokens":11,"completion_tokens":3,"total_tokens":14}}\n', 'data: [DONE]\n']));
    process.env.PATTY_TEST_PROVIDER_KEY = 'sk-not-a-real-key';
    const account = await daemon.addOpenAiCompatibleAccount('together', 'https://api.example.invalid/v1', 'PATTY_TEST_PROVIDER_KEY', fetchImpl);
    expect(account.models).toEqual(['llama-3.3-70b', 'gpt-4o-mini']);
    expect(account.quota.remaining).toBeCloseTo(.4);

    server = await daemon.listen();
    const { port } = server.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${daemon.key}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'llama-3.3-70b', messages: [{ role: 'user', content: 'hi' }] }) });
    const body = await response.json() as { choices: { message: { content: string } }[]; usage: { prompt_tokens: number; completion_tokens: number } };
    expect(response.status).toBe(200);
    expect(response.headers.get('x-patty-sub')).toBe('together');
    expect(body.choices[0]!.message.content).toBe('hello from llama');
    expect(body.usage).toMatchObject({ prompt_tokens: 11, completion_tokens: 3 });
    const usage = await (await fetch(`http://127.0.0.1:${port}/v1/usage`, { headers: { authorization: `Bearer ${daemon.key}` } })).json() as { data: { accounts: { alias: string; totalTokens: number }[] } };
    expect(usage.data.accounts).toMatchObject([{ alias: 'together', totalTokens: 14 }]);
    delete process.env.PATTY_TEST_PROVIDER_KEY;
  });

  it('never persists the provider secret and refuses to run without it', async () => {
    const daemon = new PattyDaemon();
    const fetchImpl = upstream(() => new Response(JSON.stringify({ data: [{ id: 'm' }] }), { headers: { 'content-type': 'application/json' } }));
    process.env.PATTY_TEST_PROVIDER_KEY = 'sk-not-a-real-key';
    await daemon.addOpenAiCompatibleAccount('byok', 'https://api.example.invalid/v1', 'PATTY_TEST_PROVIDER_KEY', fetchImpl);
    delete process.env.PATTY_TEST_PROVIDER_KEY;
    expect(JSON.stringify(daemon.store.accounts())).not.toContain('sk-');
    const dumped = daemon.store.db.prepare('SELECT * FROM accounts').all().map(row => JSON.stringify(row)).join('');
    expect(dumped).not.toContain('sk-not-a-real-key');
    expect(dumped).toContain('byok');
    server = await daemon.listen();
    const { port } = server.address() as { port: number };
    const response = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${daemon.key}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }) });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: { code: 'upstream_failed' } });
    expect(daemon.store.runHistory()).toMatchObject([{ alias: 'byok', status: 'failed' }]);
  });

  it('rejects an unusable configuration instead of storing a broken sub', async () => {
    const daemon = new PattyDaemon();
    await expect(daemon.addOpenAiCompatibleAccount('bad', 'ftp://example.invalid', 'KEY')).rejects.toThrow(/http/);
    await expect(daemon.addOpenAiCompatibleAccount('bad', 'https://example.invalid/v1', 'not a var name')).rejects.toThrow(/environment variable/);
    expect(daemon.store.accounts()).toHaveLength(0);
  });
});
