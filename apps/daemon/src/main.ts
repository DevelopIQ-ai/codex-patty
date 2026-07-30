#!/usr/bin/env node
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { PattyDaemon } from './server.js';
const defaultDbPath = '.patty/patty.sqlite';
const dbPath = process.env.PATTY_DB_PATH ?? defaultDbPath;
// Only Patty's own default directory is permission-managed; an explicit path is operator-owned.
if (dbPath === defaultDbPath) { mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 }); chmodSync(dirname(dbPath), 0o700); }
const daemon = new PattyDaemon(dbPath);
// `--fake` stacks one demo sub; repeat `--fake=<alias>[:<quotaRemaining>]` to stack several and watch routing choose between them.
for (const argument of process.argv.filter(value => value === '--fake' || value.startsWith('--fake='))) {
  const [alias = 'fake-primary', remaining] = argument.slice('--fake'.length).replace(/^=/, '').split(':');
  daemon.addFakeAccount(alias || 'fake-primary', ['gpt-5-codex'], remaining === undefined ? 1 : Number(remaining));
}
const server = await daemon.listen(Number(process.env.PATTY_PORT ?? 3210));
console.log(JSON.stringify({ listening: server.address(), ...(daemon.key ? { apiKey: daemon.key, warning: 'API key shown once; store it securely' } : { warning: 'existing local Patty key required; no new key was issued' }) }));
const shutdown = () => void daemon.shutdown().finally(() => server.close(() => process.exit(0)));
process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
