import { createHash } from 'node:crypto';
import { chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, writeSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const version = '0.145.0';
const required = ['PATTY_LIVE_TESTS', 'PATTY_ENABLE_LIVE_CODEX', 'PATTY_AUTHORIZATION_EVIDENCE', 'PATTY_AUTHORIZATION_SHA256', 'PATTY_CODEX_COMMAND', 'PATTY_CODEX_VERSION', 'PATTY_LIVE_ACCOUNT_ROOT'];
class LiveBlockedError extends Error {}
const blocked = message => { console.error(`BLOCKED: ${message}`); process.exit(2); };
const bounded = (promise, ms, label) => new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error(`${label}_timeout`)), ms); promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); }); });
const privateDirectory = path => { mkdirSync(path, { recursive: true, mode: 0o700 }); const entry = lstatSync(path); if (!entry.isDirectory() || entry.isSymbolicLink() || (typeof process.getuid === 'function' && entry.uid !== process.getuid())) blocked('account root must be an owner-only non-symlink directory'); chmodSync(path, 0o700); return resolve(path); };
for (const key of required) if (!process.env[key]) blocked(`missing ${key}`);
if (process.env.PATTY_LIVE_TESTS !== '1' || process.env.PATTY_ENABLE_LIVE_CODEX !== '1') blocked('explicit test and live enablement are both required');
if (process.env.PATTY_CODEX_VERSION !== version) blocked(`PATTY_CODEX_VERSION must be ${version}`);
if (!existsSync(process.env.PATTY_AUTHORIZATION_EVIDENCE) || createHash('sha256').update(readFileSync(process.env.PATTY_AUTHORIZATION_EVIDENCE)).digest('hex') !== process.env.PATTY_AUTHORIZATION_SHA256) blocked('local authorization attestation path and digest do not match');
try { if (execFileSync(process.env.PATTY_CODEX_COMMAND, ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() !== `codex-cli ${version}`) blocked('configured Codex command is not the exact pinned version'); } catch { blocked('configured Codex command cannot be version-checked'); }

const root = privateDirectory(process.env.PATTY_LIVE_ACCOUNT_ROOT);
const { CodexAppServerAdapter } = await import('../apps/daemon/dist/src/codex.js');
const { Coordinator, Router, Store, now } = await import('../apps/daemon/dist/src/core.js');
const homes = ['one', 'two'].map(alias => privateDirectory(join(root, alias)));
const adapters = homes.map(home => new CodexAppServerAdapter(process.env.PATTY_CODEX_COMMAND, ['app-server'], home, version));
const tty = () => { if (!process.stdin.isTTY || !process.stderr.isTTY) throw new LiveBlockedError('interactive device-code login requires a TTY and never writes challenges to redirected streams'); try { return openSync('/dev/tty', 'w'); } catch { throw new LiveBlockedError('interactive device-code login requires /dev/tty'); } };
const writeChallenge = (fd, index, challenge) => writeSync(fd, `Complete account ${index + 1} device-code login:\n${challenge.url}\nCode: ${challenge.code}\n`);
const waitForLogin = adapter => { let timer; let listener; const promise = new Promise((resolve, reject) => { listener = event => { clearTimeout(timer); adapter.off('login', listener); event.params?.success ? resolve() : reject(new Error('login_failed')); }; timer = setTimeout(() => { adapter.off('login', listener); reject(new Error('login_timeout')); }, 15 * 60_000); adapter.on('login', listener); }); return { promise, cancel: () => { clearTimeout(timer); if (listener) adapter.off('login', listener); } }; };
const waitForTerminal = async (store, runId) => { const deadline = Date.now() + 120_000; while (Date.now() < deadline) { const status = store.publicRun(runId)?.status; if (status === 'completed') return; if (status === 'failed' || status === 'cancelled') throw new Error('turn_failed'); await new Promise(resolve => setTimeout(resolve, 250)); } throw new Error('turn_timeout'); };
try {
  for (const adapter of adapters) await bounded(adapter.start(), 30_000, 'initialize');
  const existing = await Promise.all(adapters.map(adapter => adapter.waitForAccount(2_000).then(() => true, () => false)));
  if (existing.some(ready => !ready)) {
    if (process.env.PATTY_LIVE_INTERACTIVE !== '1') throw new LiveBlockedError('one or more persistent account homes are not logged in; set PATTY_LIVE_INTERACTIVE=1 in a TTY to begin device-code login');
    const fd = tty();
    try { for (let index = 0; index < adapters.length; index++) if (!existing[index]) { const waiter = waitForLogin(adapters[index]); try { const challenge = await adapters[index].login('device_code'); if (!challenge.url || !challenge.code || !challenge.loginId) throw new Error('incomplete_login_challenge'); writeChallenge(fd, index, challenge); await waiter.promise; } catch (error) { waiter.cancel(); throw error; } } } finally { writeSync(fd, 'Device-code login flow ended.\n'); closeSync(fd); }
  }
  const fingerprints = await Promise.all(adapters.map(adapter => bounded(adapter.identityFingerprint(), 30_000, 'identity')));
  if (new Set(fingerprints).size !== adapters.length) throw new Error('account_identity_not_distinct');
  const snapshots = await Promise.all(adapters.map(adapter => bounded(adapter.snapshot(), 30_000, 'snapshot')));
  if (snapshots.some(snapshot => !snapshot.models.length)) throw new Error('no_models');
  const model = snapshots[0].models.find(candidate => snapshots.every(snapshot => snapshot.models.includes(candidate)));
  if (!model) throw new Error('no_common_model');
  const store = new Store(':memory:'); const accounts = snapshots.map((snapshot, index) => ({ id: `live-${index + 1}`, alias: `live-${index + 1}`, state: 'ready', models: snapshot.models, quota: snapshot.quota, health: 1, activeRuns: 0 }));
  for (const account of accounts) store.addAccount(account);
  const coordinator = new Coordinator(store, new Router(store), new Map(accounts.map((account, index) => [account.id, adapters[index]])));
  // Verify pinned execution on each isolated account and an unpinned routed execution through Patty itself.
  for (const account of accounts) { const run = await coordinator.start({ model, input: 'Reply with exactly: ok', accountId: account.id }); if (store.publicRun(run)?.accountId !== account.id) throw new Error('pinned_route_mismatch'); await waitForTerminal(store, run); }
  const routed = await coordinator.start({ model, input: 'Reply with exactly: ok' }); if (!accounts.some(account => account.id === store.publicRun(routed)?.accountId)) throw new Error('router_account_missing'); await waitForTerminal(store, routed);
  await coordinator.shutdown();
  console.error('Live harness passed: persistent homes were reused and Coordinator routing was exercised. No live evidence is recorded by this repository.');
} catch (error) {
  if (error instanceof LiveBlockedError) {
    console.error(`BLOCKED: ${error.message}`);
    process.exitCode = 2;
  } else {
    console.error('LIVE HARNESS FAILED; persistent account homes were retained for explicit operator resumption.');
    process.exitCode = 1;
  }
} finally { await Promise.allSettled(adapters.map(adapter => adapter.shutdown())); }
