#!/usr/bin/env node
// Verifies the packed artifact the way a user meets it: `npx codex-patty` must boot a
// working daemon, and `codex-patty <command>` must reach the CLI, from the packed files only.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const launcher = join(root, 'dist-npm/bin/codex-patty.mjs');
const port = 3999;
const home = await mkdtemp(join(tmpdir(), 'patty-pack-'));
const fail = (message) => { console.error(`pack smoke failed: ${message}`); process.exitCode = 1; };

const daemon = spawn(process.execPath, [launcher, '--fake=packed-sub:0.7:60'], {
  env: { ...process.env, PATTY_DB_PATH: join(home, 'patty.sqlite'), PATTY_PORT: String(port) },
  stdio: ['ignore', 'pipe', 'inherit'],
});
let printed = '';
const key = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`daemon never announced a key: ${printed}`)), 20_000);
  daemon.stdout.on('data', chunk => {
    printed += chunk;
    const line = printed.split('\n').find(candidate => candidate.includes('"listening"'));
    if (line) { clearTimeout(timer); resolve(JSON.parse(line).apiKey); }
  });
});

try {
  const health = await (await fetch(`http://127.0.0.1:${port}/healthz`)).json();
  if (health.ok !== true) fail('healthz did not report ok');

  const completion = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-5-codex', messages: [{ role: 'user', content: 'packaged hello' }] }),
  });
  const body = await completion.json();
  if (completion.status !== 200 || !body.choices?.[0]?.message?.content) fail(`completion failed: ${JSON.stringify(body)}`);
  if (completion.headers.get('x-patty-sub') !== 'packed-sub') fail('routed sub was not reported');

  const cli = spawn(process.execPath, [launcher, 'usage'], {
    env: { ...process.env, PATTY_URL: `http://127.0.0.1:${port}`, PATTY_API_KEY: key },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  let cliOut = '';
  cli.stdout.on('data', chunk => { cliOut += chunk; });
  const cliCode = await new Promise(resolve => cli.on('exit', resolve));
  if (cliCode !== 0) fail(`packed CLI exited ${cliCode}`);
  if (!JSON.parse(cliOut).data?.accounts?.some(account => account.alias === 'packed-sub')) fail(`packed CLI usage lacked the sub: ${cliOut}`);

  if (!process.exitCode) console.log(JSON.stringify({ packedSmoke: 'ok', routedSub: 'packed-sub', text: body.choices[0].message.content }));
} finally {
  daemon.kill('SIGTERM');
  await rm(home, { recursive: true, force: true });
}
