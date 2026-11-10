import { afterEach, describe, expect, test } from "bun:test";
import { isUsageLimit, postJson, StopRun, UsageLimit } from "./llm.js";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
function serve(...replies: [number, string, Record<string, string>?][]) {
  const seen: number[] = [];
  globalThis.fetch = (async () => {
    const [status, body, headers] = replies[Math.min(seen.length, replies.length - 1)]!;
    seen.push(status);
    return new Response(body, { status, headers });
  }) as unknown as typeof fetch;
  return seen;
}
const waits: number[] = [];
const noWait = async (ms: number) => { waits.push(ms); };

describe("postJson", () => {
  test("retries a rate limit and a server error, then returns", async () => {
    const seen = serve([429, "slow down"], [503, "busy"], [200, '{"ok":1}']);
    expect(await postJson("u", {}, {}, 6, noWait)).toEqual({ ok: 1 });
    expect(seen).toEqual([429, 503, 200]);
  });
  test("waits as long as retry-after asks, up to two minutes", async () => {
    waits.length = 0;
    serve([429, "x", { "retry-after": "90" }], [429, "x", { "retry-after": "9999" }], [200, "{}"]);
    await postJson("u", {}, {}, 6, noWait);
    expect(waits[0]).toBe(90_000);
    expect(waits[1]).toBe(120_000);
  });
  test("stops the run when rate limits outlast the retries", async () => {
    serve([429, "rate_limit_error"]);
    const e = await postJson("u", {}, {}, 3, noWait).catch((x) => x);
    expect(e).toBeInstanceOf(UsageLimit);
    expect(e).toBeInstanceOf(StopRun);
  });
  test("stops the run at once when credit runs out", async () => {
    const seen = serve([400, '{"error":{"message":"Your credit balance is too low to access the Anthropic API."}}']);
    expect(await postJson("u", {}, {}, 6, noWait).catch((x) => x)).toBeInstanceOf(UsageLimit);
    expect(seen.length).toBe(1);
  });
  test("other client errors fail the call, not the run", async () => {
    serve([400, "bad request"]);
    const e = await postJson("u", {}, {}, 6, noWait).catch((x) => x);
    expect(e).not.toBeInstanceOf(StopRun);
    expect(e.status).toBe(400);
  });
});

test("isUsageLimit reads claude -p error replies", () => {
  expect(isUsageLimit({ api_error_status: 429 })).toBe(true);
  expect(isUsageLimit({ result: "Claude AI usage limit reached|1762790400" })).toBe(true);
  expect(isUsageLimit({ result: "You've hit your limit · resets 3pm" })).toBe(true);
  expect(isUsageLimit({ api_error_status: 500, result: "Overloaded" })).toBe(false);
});

describe("AnthropicGateway", () => {
  test("sends effort, and drops it for the run if the API refuses it", async () => {
    const { AnthropicGateway } = await import("./llm.js");
    process.env.TEST_ANTHROPIC_KEY = "k";
    const bodies: any[] = [];
    globalThis.fetch = (async (_u: string, init: any) => {
      const b = JSON.parse(init.body); bodies.push(b);
      if (b.output_config) return new Response('{"error":{"message":"output_config.effort: not supported"}}', { status: 400 });
      return new Response(JSON.stringify({ model: "m", stop_reason: "end_turn", content: [{ type: "text", text: "ok" }], usage: {} }), { status: 200 });
    }) as unknown as typeof fetch;
    const g = new AnthropicGateway({ api_key_env: "TEST_ANTHROPIC_KEY" });
    const req = { system: "s", user: "u", model: "claude-haiku-5-5", maxTokens: 10, temperature: 0.2, reasoning: { effort: "medium" } } as any;
    expect((await g.call(req)).text).toBe("ok");
    expect(bodies.map((b) => !!b.output_config)).toEqual([true, false]);
    expect(bodies[1].temperature).toBe(0.2);
    await g.call(req);
    expect(bodies.length).toBe(3);
  });
});
