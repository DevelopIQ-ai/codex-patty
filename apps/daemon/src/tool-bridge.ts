import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ChatTool, ChatToolCall } from '@patty/contracts';

/**
 * A Codex subscription runs its own agent loop and has no way to be handed the caller's functions
 * over the app-server protocol — but it will start MCP servers named in the thread's config and
 * call their tools. So the caller's tools are published by a tiny stdio MCP server that Codex
 * spawns and that calls back into this daemon over loopback: the model's invocation becomes an
 * ordinary OpenAI `tool_calls` answer, and the turn stays parked mid-flight until the caller sends
 * the results back, which is exactly the shape an OpenAI client already speaks.
 */
export type ToolBridgeSession = { token: string; command: string; args: string[]; env: Record<string, string>; close: () => void };
type Pending = { resolve: (output: string) => void; reject: (error: Error) => void; timer: NodeJS.Timeout };
type Session = { tools: ChatTool[]; onCall: (call: ChatToolCall) => void; pending: Map<string, Pending> };

/** The MCP server Codex spawns; shipped next to the daemon so a packed install has it too. */
export const bridgeScript = () => {
  const beside = fileURLToPath(new URL('./mcp-bridge.js', import.meta.url));
  /** Run straight from the TypeScript sources there is no sibling build output, so the compiled copy stands in. */
  return existsSync(beside) ? beside : fileURLToPath(new URL('../dist/src/mcp-bridge.js', import.meta.url));
};
const callId = () => `call_${randomBytes(12).toString('hex')}`;

export class ToolBridge {
  private readonly sessions = new Map<string, Session>();
  /** Loopback only, and only for as long as a turn is running: the URL the spawned server calls back on. */
  constructor(private readonly baseUrl: () => string, private readonly resultTimeoutMs = Number(process.env.PATTY_TOOL_RESULT_TIMEOUT_MS ?? 300_000)) {}
  open(tools: ChatTool[], onCall: (call: ChatToolCall) => void): ToolBridgeSession {
    const token = randomBytes(24).toString('base64url');
    this.sessions.set(token, { tools, onCall, pending: new Map() });
    return { token, command: process.execPath, args: [bridgeScript()], env: { PATTY_BRIDGE_URL: this.baseUrl(), PATTY_BRIDGE_TOKEN: token }, close: () => this.close(token) };
  }
  list(token: string) {
    const session = this.sessions.get(token);
    if (!session) throw new Error('unknown_bridge_session');
    return session.tools.map(tool => ({ name: tool.function.name, description: tool.function.description ?? '', inputSchema: tool.function.parameters ?? { type: 'object', properties: {} } }));
  }
  /** Hands the invocation to the caller as a tool call and waits for the answer it sends back. */
  call(token: string, name: string, args: unknown) {
    const session = this.sessions.get(token);
    if (!session) throw new Error('unknown_bridge_session');
    if (!session.tools.some(tool => tool.function.name === name)) throw new Error('unknown_tool');
    const id = callId();
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => { session.pending.delete(id); reject(new Error('tool_result_timeout')); }, this.resultTimeoutMs);
      timer.unref?.();
      session.pending.set(id, { resolve, reject, timer });
      session.onCall({ id, type: 'function', function: { name, arguments: typeof args === 'string' ? args : JSON.stringify(args ?? {}) } });
    });
  }
  /** The caller's answer to one call; false when nothing is waiting for it, which is the caller's cue that the turn is gone. */
  settle(id: string, output: string) {
    for (const session of this.sessions.values()) {
      const pending = session.pending.get(id);
      if (!pending) continue;
      clearTimeout(pending.timer); session.pending.delete(id); pending.resolve(output);
      return true;
    }
    return false;
  }
  waiting(id: string) { return [...this.sessions.values()].some(session => session.pending.has(id)); }
  close(token: string) {
    const session = this.sessions.get(token);
    if (!session) return;
    for (const pending of session.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error('turn_ended')); }
    this.sessions.delete(token);
  }
}
