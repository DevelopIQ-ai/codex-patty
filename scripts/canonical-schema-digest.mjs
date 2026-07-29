import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const canonicalize = value => Array.isArray(value) ? `[${value.map(canonicalize).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}` : JSON.stringify(value);
const input = process.argv[2];
if (!input) throw new Error('usage: canonical-schema-digest.mjs <schema.json>');
process.stdout.write(`${createHash('sha256').update(canonicalize(JSON.parse(readFileSync(input, 'utf8')))).digest('hex')}\n`);
