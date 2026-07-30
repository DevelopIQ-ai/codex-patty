#!/usr/bin/env node
// Builds the single publishable `codex-patty` package from the workspace outputs.
// The daemon and CLI import @patty/contracts for types only, so the compiled JS has
// no runtime dependencies and both can ship as one dependency-free package.
import { cp, mkdir, readFile, rm, writeFile, chmod } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist-npm');
const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version;

await rm(out, { recursive: true, force: true });
await mkdir(join(out, 'bin'), { recursive: true });
await cp(join(root, 'apps/daemon/dist/src'), join(out, 'daemon'), { recursive: true });
await cp(join(root, 'apps/cli/dist'), join(out, 'cli'), { recursive: true });
for (const file of ['README.md', 'LICENSE']) await cp(join(root, file), join(out, file));

const launcher = `#!/usr/bin/env node
// \`npx codex-patty\` starts the daemon; anything else is a CLI command, so one
// package covers both without asking people to learn two binary names.
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const [first, ...rest] = process.argv.slice(2);
const daemon = first === undefined || first === 'start' || first === 'up' || first.startsWith('--');
const argv = daemon ? (first === undefined ? [] : first.startsWith('--') ? [first, ...rest] : rest) : [first, ...rest];
const child = spawn(process.execPath, [join(here, '..', daemon ? 'daemon/main.js' : 'cli/index.js'), ...argv], { stdio: 'inherit' });
child.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
`;
await writeFile(join(out, 'bin/codex-patty.mjs'), launcher);
await chmod(join(out, 'bin/codex-patty.mjs'), 0o755);

await writeFile(join(out, 'package.json'), `${JSON.stringify({
  name: 'codex-patty',
  version,
  description: 'Stack your own Codex/ChatGPT subscriptions behind one local, OpenAI-compatible endpoint.',
  license: 'MIT',
  type: 'module',
  engines: { node: '>=22.5' },
  bin: { 'codex-patty': './bin/codex-patty.mjs', patty: './cli/index.js', pattyd: './daemon/main.js' },
  files: ['bin', 'cli', 'daemon', 'README.md', 'LICENSE'],
  repository: { type: 'git', url: 'git+https://github.com/DevelopIQ-ai/codex-patty.git' },
  keywords: ['codex', 'openai', 'router', 'quota', 'local', 'openai-compatible'],
}, null, 2)}\n`);

console.log(JSON.stringify({ packed: out, version, bins: ['codex-patty', 'patty', 'pattyd'] }));
