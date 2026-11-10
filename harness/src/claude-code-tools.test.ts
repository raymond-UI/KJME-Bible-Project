import { afterAll, describe, expect, test } from "bun:test";
import { lines, respond, serve, type ToolServer } from "./claude-code-tools.js";

const seen: { token: string | null; body: unknown }[] = [];
const http = Bun.serve({
  hostname: "127.0.0.1", port: 0,
  async fetch(req) {
    seen.push({ token: req.headers.get("x-kjme-token"), body: await req.json() });
    return new Response('{"result":"ok"}', { status: req.headers.get("x-kjme-token") === "t1" ? 200 : 403 });
  },
});
afterAll(() => http.stop(true));

const tool = { name: "lookup", description: "Look something up", parameters: { type: "object" } };
const server = (token = "t1", url = `http://127.0.0.1:${http.port}/`): ToolServer => ({ url, token, tool });
const bytes = async function* (...parts: string[]) { for (const p of parts) yield new TextEncoder().encode(p); };

describe("respond", () => {
  test("initialize echoes the protocol version", async () => {
    expect(await respond(server(), { id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } }))
      .toMatchObject({ id: 1, result: { protocolVersion: "2024-11-05", capabilities: { tools: {} } } });
    expect(await respond(server(), { id: 1, method: "initialize" })).toMatchObject({ result: { protocolVersion: "2025-06-18" } });
  });

  test("tools/list offers the one tool", async () => {
    expect(await respond(server(), { id: 2, method: "tools/list" })).toEqual({
      jsonrpc: "2.0", id: 2, result: { tools: [{ name: "lookup", description: "Look something up", inputSchema: { type: "object" } }] },
    });
  });

  test("tools/call forwards to the harness with the token", async () => {
    const r = await respond(server(), { id: 3, method: "tools/call", params: { name: "lookup", arguments: { q: "x" } } });
    expect(r).toEqual({ jsonrpc: "2.0", id: 3, result: { content: [{ type: "text", text: '{"result":"ok"}' }], isError: false } });
    expect(seen.at(-1)).toEqual({ token: "t1", body: { name: "lookup", args: { q: "x" } } });
  });

  test("a refused or failed call is an error result", async () => {
    expect(await respond(server("bad"), { id: 4, method: "tools/call", params: { name: "lookup" } })).toMatchObject({ result: { isError: true } });
    expect(seen.at(-1)?.body).toEqual({ name: "lookup", args: {} });
    const down = await respond(server("t1", "http://127.0.0.1:1/"), { id: 5, method: "tools/call", params: {} });
    expect(down).toMatchObject({ result: { isError: true } });
    expect(JSON.stringify(down)).toContain("lookup failed");
  });

  test("ping, notifications and unknown methods", async () => {
    expect(await respond(server(), { id: 6, method: "ping" })).toEqual({ jsonrpc: "2.0", id: 6, result: {} });
    expect(await respond(server(), { method: "notifications/initialized" })).toBeNull();
    expect(await respond(server(), { id: 7, method: "toString" })).toMatchObject({ error: { code: -32601 } });
    expect(await respond(server(), { id: 8 })).toMatchObject({ error: { message: "unknown method undefined" } });
  });
});

describe("serve", () => {
  test("lines joins chunks and drops blank lines", async () => {
    const out: string[] = [];
    for await (const l of lines(bytes('{"a":', '1}\n\n  \n{"b":2}\n{"c"'))) out.push(l);
    expect(out).toEqual(['{"a":1}', '{"b":2}']);
  });

  test("answers each request on its own line and skips bad input", async () => {
    const out: string[] = [];
    await serve(server(), bytes('{"id":1,"method":"ping"}\nnot json\n{"method":"notifications/x"}\n{"id":2,"method":"tools/list"}\n'), (l: string) => out.push(l));
    expect(out.map((l) => JSON.parse(l).id).sort()).toEqual([1, 2]);
    expect(out.every((l) => l.endsWith("\n"))).toBe(true);
  });
});
