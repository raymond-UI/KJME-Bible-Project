#!/usr/bin/env bun
// MCP server (stdio) that Claude Code starts for one agent call. It exposes the harness `lookup` tool and
// forwards every call to the harness process over loopback HTTP, so lookups are logged and limited there.
// Env: KJME_TOOL_URL, KJME_TOOL_TOKEN, KJME_TOOL_DEF (the tool definition as JSON).

export interface ToolServer { url: string; token: string; tool: { name: string; description: string; parameters: unknown } }
interface Msg { id?: unknown; method?: string; params?: { protocolVersion?: string; name?: string; arguments?: unknown } }

async function callTool(s: ToolServer, p: Msg["params"]) {
  try {
    const r = await fetch(s.url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-kjme-token": s.token },
      body: JSON.stringify({ name: p?.name, args: p?.arguments ?? {} }),
    });
    return { content: [{ type: "text", text: await r.text() }], isError: !r.ok };
  } catch (e) {
    return { content: [{ type: "text", text: `lookup failed: ${(e as Error)?.message ?? e}` }], isError: true };
  }
}

const methods: Record<string, (s: ToolServer, m: Msg) => unknown> = {
  initialize: (_s, m) => ({ protocolVersion: m.params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "kjme", version: "1.0.0" } }),
  "tools/list": (s) => ({ tools: [{ name: s.tool.name, description: s.tool.description, inputSchema: s.tool.parameters }] }),
  "tools/call": (s, m) => callTool(s, m.params),
  ping: () => ({}),
};

/** The JSON-RPC reply to one message, or null for a notification, which needs none. */
export async function respond(s: ToolServer, m: Msg): Promise<object | null> {
  if (m.id === undefined) return null;
  const fn = Object.hasOwn(methods, m.method ?? "") ? methods[m.method!] : undefined;
  if (!fn) return { jsonrpc: "2.0", id: m.id, error: { code: -32601, message: `unknown method ${m.method}` } };
  return { jsonrpc: "2.0", id: m.id, result: await fn(s, m) };
}

/** Split a byte stream into its complete, non-empty lines. */
export async function* lines(chunks: AsyncIterable<Uint8Array>): AsyncGenerator<string> {
  const dec = new TextDecoder();
  let buf = "";
  for await (const chunk of chunks) {
    buf += dec.decode(chunk, { stream: true });
    const parts = buf.split("\n");
    buf = parts.pop()!;
    for (const l of parts) if (l.trim()) yield l.trim();
  }
}

const parse = (line: string): Msg | null => { try { return JSON.parse(line) as Msg; } catch { return null; } };

export async function serve(s: ToolServer, input: AsyncIterable<Uint8Array>, write: (line: string) => void) {
  const pending: Promise<void>[] = [];
  for await (const line of lines(input)) {
    const m = parse(line);
    if (m) pending.push(respond(s, m).then((r) => { if (r) write(JSON.stringify(r) + "\n"); }));
  }
  await Promise.all(pending);
}

if (import.meta.main) {
  const env = process.env;
  const s: ToolServer = { url: env.KJME_TOOL_URL!, token: env.KJME_TOOL_TOKEN!, tool: JSON.parse(env.KJME_TOOL_DEF ?? "{}") };
  void serve(s, Bun.stdin.stream(), (l) => process.stdout.write(l));
}
