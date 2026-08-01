/**
 * The stdio MCP server Codex spawns for a turn that was offered tools. It owns no tools of its own:
 * it publishes whatever the caller offered and forwards each invocation to the daemon over loopback,
 * blocking until the caller answers. Run by the Codex child process, never by the daemon.
 */
import { createInterface } from 'node:readline';

type Rpc = { id?: string | number; method?: string; params?: { name?: string; arguments?: unknown } };

const url = process.env.PATTY_BRIDGE_URL, token = process.env.PATTY_BRIDGE_TOKEN;
if (!url || !token) { process.stderr.write('patty tool bridge needs PATTY_BRIDGE_URL and PATTY_BRIDGE_TOKEN\n'); process.exit(2); }

const send = (message: unknown) => process.stdout.write(`${JSON.stringify(message)}\n`);
const reply = (id: string | number, result: unknown) => send({ jsonrpc: '2.0', id, result });
const fail = (id: string | number, message: string) => send({ jsonrpc: '2.0', id, error: { code: -32603, message } });

const ask = async (path: string, body?: unknown) => {
  const response = await fetch(`${url}/internal/tool-bridge/${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'x-patty-bridge-token': token, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const payload = await response.json() as { tools?: unknown; output?: string; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message ?? `bridge ${response.status}`);
  return payload;
};

createInterface({ input: process.stdin }).on('line', async line => {
  if (!line.trim()) return;
  let message: Rpc; try { message = JSON.parse(line) as Rpc; } catch { return; }
  const { id, method } = message;
  if (id === undefined) return;
  try {
    if (method === 'initialize') return reply(id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'patty', version: '0.1.0' } });
    if (method === 'tools/list') return reply(id, { tools: (await ask('tools')).tools });
    if (method === 'tools/call') return reply(id, { content: [{ type: 'text', text: (await ask('call', { name: message.params?.name, arguments: message.params?.arguments })).output ?? '' }] });
    if (method === 'ping') return reply(id, {});
    return send({ jsonrpc: '2.0', id, error: { code: -32601, message: `unsupported: ${method}` } });
  } catch (error) { fail(id, (error as Error).message); }
});
