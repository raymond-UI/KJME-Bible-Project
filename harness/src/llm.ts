// Model gateways: OpenRouter (OpenAI-compatible), Anthropic (Messages API), Claude Code (headless CLI), plus a mock for dry runs.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// Each call runs a tool loop for the `lookup` tool and returns the final text, usage and cost.

export interface ToolDef { name: string; description: string; parameters: Record<string, unknown> }
export type ToolHandler = (name: string, args: any) => Promise<unknown>;
export interface CallRequest {
  agent: string; model: string; system: string; user: string; temperature?: number | null;
  maxTokens: number; tools?: ToolDef[]; onTool?: ToolHandler; maxToolCalls?: number;
  /** OpenRouter only: reasoning control, e.g. {effort: "low"}. */
  reasoning?: unknown;
  /** OpenRouter only: request JSON output (response_format json_object) on turns without tools. */
  jsonMode?: boolean;
  /** Stable per-conversation id, sent where a gateway asks for one (OpenCode Go). */
  session?: string;
}

export class TruncatedError extends Error {}
export interface CallResult {
  text: string; model: string; provider: string;
  usage: { input: number; output: number; cache_read: number; cache_write: number };
  cost_usd: number; tool_calls: number; turns: number;
}
export interface Gateway { name: string; call(req: CallRequest): Promise<CallResult> }

// USD per million tokens (Anthropic pricing page, checked 2026-11-08). Keep in sync with tools/preflight.py.
const ANTHROPIC_PRICES: Record<string, { in: number; cw: number; cr: number; out: number }> = {
  "claude-fable-5-1": { in: 10, cw: 12.5, cr: 0.25, out: 50 },
  "claude-opus-5-5": { in: 4, cw: 5, cr: 0.2, out: 20 },
  "claude-sonnet-5-5": { in: 2, cw: 2.5, cr: 0.1, out: 10 },
  "claude-haiku-5-5": { in: 0.1, cw: 0.125, cr: 0.01, out: 0.5 },
};

async function postJson(url: string, headers: Record<string, string>, body: unknown, tries = 4): Promise<any> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
      const text = await res.text();
      if (res.ok) return JSON.parse(text);
      const retryable = res.status === 429 || res.status >= 500;
      const err = new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
      (err as any).status = res.status;
      if (!retryable) throw err;
      lastErr = err;
    } catch (e: any) {
      if (e?.status && e.status < 500 && e.status !== 429) throw e;
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt + Math.random() * 1000));
  }
  throw lastErr;
}

export class OpenRouterGateway implements Gateway {
  name = "openrouter";
  constructor(private cfg: any, name?: string) { if (name) this.name = name; }
  async call(req: CallRequest): Promise<CallResult> {
    const keyEnv = this.cfg.api_key_env ?? "OPENROUTER_API_KEY";
    const key = process.env[keyEnv];
    if (!key) throw new Error(`${keyEnv} is not set`);
    const orExtras = this.cfg.openrouter_extras !== false;
    const messages: any[] = [{ role: "system", content: req.system }, { role: "user", content: req.user }];
    const tools = req.tools?.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
    const out: CallResult = { text: "", model: req.model, provider: "", usage: { input: 0, output: 0, cache_read: 0, cache_write: 0 }, cost_usd: 0, tool_calls: 0, turns: 0 };
    for (let turn = 0; turn < 12; turn++) {
      const body: any = { model: req.model, messages, max_tokens: req.maxTokens };
      if (orExtras) { body.usage = { include: true }; body.provider = this.cfg.routing ?? { allow_fallbacks: false, data_collection: "deny", require_parameters: true }; }
      if (req.temperature != null) body.temperature = req.temperature;
      if (req.reasoning && orExtras) body.reasoning = req.reasoning;
      const withTools = !!tools?.length && out.tool_calls < (req.maxToolCalls ?? 8);
      if (withTools) body.tools = tools;
      else if (req.jsonMode) body.response_format = { type: "json_object" };
      const r = await postJson(`${this.cfg.base_url ?? "https://openrouter.ai/api/v1"}/chat/completions`,
        { authorization: `Bearer ${key}`, ...(orExtras ? { "x-title": "KJME pilot" } : {}), ...(this.cfg.headers ?? {}), ...(req.session && this.cfg.session_header ? { [this.cfg.session_header]: req.session } : {}) }, body);
      out.turns++;
      out.model = r.model ?? out.model;
      out.provider = r.provider ?? out.provider;
      out.usage.input += r.usage?.prompt_tokens ?? 0;
      out.usage.output += r.usage?.completion_tokens ?? 0;
      out.usage.cache_read += r.usage?.prompt_tokens_details?.cached_tokens ?? 0;
      const lp = this.cfg.prices?.[req.model];
      out.cost_usd += r.usage?.cost ?? (lp ? ((r.usage?.prompt_tokens ?? 0) * lp.in + (r.usage?.completion_tokens ?? 0) * lp.out) / 1e6 : 0);
      const msg = r.choices?.[0]?.message;
      if (!msg) throw new Error(`OpenRouter: empty response ${JSON.stringify(r).slice(0, 300)}`);
      const calls = msg.tool_calls ?? [];
      if (calls.length && req.onTool) {
        messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls });
        for (const c of calls) {
          out.tool_calls++;
          let args: any = {};
          try { args = JSON.parse(c.function?.arguments || "{}"); } catch { /* keep empty */ }
          const result = await req.onTool(c.function?.name, args);
          messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(result) });
        }
        continue;
      }
      out.text = typeof msg.content === "string" ? msg.content : (msg.content ?? []).map((p: any) => p.text ?? "").join("");
      if (r.choices?.[0]?.finish_reason === "length") {
        const e = new TruncatedError(`output truncated at max_tokens=${req.maxTokens} (reasoning may have used the allowance)`);
        (e as any).result = out;
        throw e;
      }
      return out;
    }
    throw new Error("OpenRouter: tool loop exceeded 12 turns");
  }
}

export class AnthropicGateway implements Gateway {
  name = "anthropic";
  private dropTemperature = false;
  constructor(private cfg: any, name?: string) { if (name) this.name = name; }
  async call(req: CallRequest): Promise<CallResult> {
    const keyEnv = this.cfg.api_key_env ?? "ANTHROPIC_API_KEY";
    const key = process.env[keyEnv];
    if (!key) throw new Error(`${keyEnv} is not set`);
    const caching = this.cfg.prompt_caching?.enabled !== false;
    const system = [{ type: "text", text: req.system, ...(caching ? { cache_control: { type: "ephemeral" } } : {}) }];
    const tools = req.tools?.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
    const messages: any[] = [{ role: "user", content: req.user }];
    const out: CallResult = { text: "", model: req.model, provider: this.name, usage: { input: 0, output: 0, cache_read: 0, cache_write: 0 }, cost_usd: 0, tool_calls: 0, turns: 0 };
    const price = ANTHROPIC_PRICES[req.model];
    for (let turn = 0; turn < 12; turn++) {
      const body: any = { model: req.model, max_tokens: req.maxTokens, system, messages };
      if (req.temperature != null && !this.dropTemperature) body.temperature = req.temperature;
      if (tools?.length && out.tool_calls < (req.maxToolCalls ?? 8)) body.tools = tools;
      let r: any;
      try {
        r = await postJson(`${this.cfg.base_url ?? "https://api.anthropic.com/v1"}/messages`,
          { "x-api-key": key, "anthropic-version": "2023-06-01", ...(this.cfg.bearer ? { authorization: `Bearer ${key}` } : {}), ...(this.cfg.headers ?? {}), ...(req.session && this.cfg.session_header ? { [this.cfg.session_header]: req.session } : {}) }, body);
      } catch (e: any) {
        if (e?.status === 400 && /temperature/i.test(String(e.message)) && !this.dropTemperature) { this.dropTemperature = true; turn--; continue; }
        throw e;
      }
      out.turns++;
      out.model = r.model ?? out.model;
      const u = r.usage ?? {};
      out.usage.input += u.input_tokens ?? 0;
      out.usage.output += u.output_tokens ?? 0;
      out.usage.cache_read += u.cache_read_input_tokens ?? 0;
      out.usage.cache_write += u.cache_creation_input_tokens ?? 0;
      if (price) out.cost_usd += ((u.input_tokens ?? 0) * price.in + (u.output_tokens ?? 0) * price.out +
        (u.cache_read_input_tokens ?? 0) * price.cr + (u.cache_creation_input_tokens ?? 0) * price.cw) / 1e6;
      const content: any[] = r.content ?? [];
      const uses = content.filter((b) => b.type === "tool_use");
      if (r.stop_reason === "tool_use" && uses.length && req.onTool) {
        messages.push({ role: "assistant", content });
        const results = [];
        for (const b of uses) {
          out.tool_calls++;
          const result = await req.onTool(b.name, b.input ?? {});
          results.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(result) });
        }
        messages.push({ role: "user", content: results });
        continue;
      }
      out.text = content.filter((b) => b.type === "text").map((b) => b.text).join("");
      if (r.stop_reason === "max_tokens") {
        const e = new TruncatedError(`output truncated at max_tokens=${req.maxTokens}`);
        (e as any).result = out;
        throw e;
      }
      return out;
    }
    throw new Error("Anthropic: tool loop exceeded 12 turns");
  }
}

/** Mock gateway: answers from a function, for dry runs without keys. */
export class MockGateway implements Gateway {
  name = "mock";
  constructor(private respond: (req: CallRequest) => string) {}
  async call(req: CallRequest): Promise<CallResult> {
    const text = this.respond(req);
    const input = Math.round((req.system.length + req.user.length) / 4), output = Math.round(text.length / 4);
    return { text, model: req.model, provider: "mock", usage: { input, output, cache_read: 0, cache_write: 0 }, cost_usd: 0, tool_calls: 0, turns: 1 };
  }
}

/**
 * Claude Code gateway: each call pipes the prompt into a headless `claude -p` session on the local login.
 * Claude Code's own system prompt, tools, settings, memory and MCP servers are all switched off; the agent
 * sees only the harness system prompt, the input, and the `lookup` tool (through claude-code-tools.ts).
 * Temperature cannot be set this way. max_tokens is passed as CLAUDE_CODE_MAX_OUTPUT_TOKENS.
 * Cost is Claude Code's reported list-price estimate.
 */
export class ClaudeCodeGateway implements Gateway {
  name = "claude-code";
  private bridge: { url: string; handlers: Map<string, { onTool: ToolHandler; left: number; used: number }> } | null = null;
  private workdir: string | null = null;
  constructor(private cfg: any) {}

  private ensureBridge() {
    if (this.bridge) return this.bridge;
    const handlers = new Map<string, { onTool: ToolHandler; left: number; used: number }>();
    const server = Bun.serve({
      hostname: "127.0.0.1", port: 0,
      async fetch(req) {
        const h = handlers.get(req.headers.get("x-kjme-token") ?? "");
        if (!h) return new Response("unknown call", { status: 403 });
        const { name, args } = await req.json() as { name: string; args: any };
        if (h.left <= 0) return Response.json({ error: "Lookup limit for this batch reached. Answer with what you have." });
        h.left--; h.used++;
        return Response.json(await h.onTool(name, args));
      },
    });
    server.unref();
    this.bridge = { url: `http://127.0.0.1:${server.port}/tool`, handlers };
    return this.bridge;
  }

  /** An empty directory to run in, so no project CLAUDE.md or memory is picked up. */
  private cwd(): string {
    if (!this.workdir) this.workdir = mkdtempSync(join(tmpdir(), "kjme-cc-"));
    return this.workdir;
  }

  async call(req: CallRequest): Promise<CallResult> {
    const bin = this.cfg.bin ?? process.env.CLAUDE_BIN ?? "claude";
    const dir = this.cwd();
    const token = crypto.randomUUID();
    const sysFile = join(dir, `${token}.system.md`);
    writeFileSync(sysFile, req.system);
    const args = ["-p", "--model", req.model, "--system-prompt-file", sysFile, "--output-format", "json",
      "--tools", "", "--setting-sources", "", "--strict-mcp-config", "--disable-slash-commands", "--no-session-persistence"];
    const effort = (req.reasoning as any)?.effort;
    if (effort) args.push("--effort", String(effort));
    let handler: { onTool: ToolHandler; left: number; used: number } | undefined;
    if (req.tools?.length && req.onTool) {
      const b = this.ensureBridge();
      handler = { onTool: req.onTool, left: req.maxToolCalls ?? 8, used: 0 };
      b.handlers.set(token, handler);
      const t = req.tools[0];
      const mcp = { mcpServers: { kjme: { type: "stdio", command: process.execPath, args: [join(import.meta.dir, "claude-code-tools.ts")],
        env: { KJME_TOOL_URL: b.url, KJME_TOOL_TOKEN: token, KJME_TOOL_DEF: JSON.stringify(t) } } } };
      args.push("--mcp-config", JSON.stringify(mcp), "--allowedTools", `mcp__kjme__${t.name}`);
    }
    // A clean environment: no parent Claude Code session, and no API key, so the call uses the local login.
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) if (v !== undefined && !/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_PID|CLAUDE_AGENT_SDK|CLAUDE_EFFORT)/.test(k)) env[k] = v;
    if (!this.cfg.use_api_key) delete env.ANTHROPIC_API_KEY;
    env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = String(req.maxTokens);
    try {
      const proc = Bun.spawn([bin, ...args], { cwd: dir, env, stdin: new Blob([req.user]), stdout: "pipe", stderr: "pipe" });
      const timer = setTimeout(() => proc.kill(), (this.cfg.timeout_s ?? 900) * 1000);
      const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
      clearTimeout(timer);
      let r: any;
      try { r = JSON.parse(stdout); } catch { throw new Error(`claude exited ${code}: ${(stderr || stdout).slice(0, 500)}`); }
      const usage = { input: 0, output: 0, cache_read: 0, cache_write: 0 };
      for (const m of Object.values<any>(r.modelUsage ?? {})) {
        usage.input += m.inputTokens ?? 0; usage.output += m.outputTokens ?? 0;
        usage.cache_read += m.cacheReadInputTokens ?? 0; usage.cache_write += m.cacheCreationInputTokens ?? 0;
      }
      const out: CallResult = {
        text: String(r.result ?? ""), model: Object.keys(r.modelUsage ?? {})[0] ?? req.model, provider: "claude-code",
        usage, cost_usd: Number(r.total_cost_usd ?? 0), tool_calls: handler?.used ?? 0, turns: Number(r.num_turns ?? 1),
      };
      if (r.is_error) {
        const e: any = new Error(`claude: ${r.subtype ?? "error"} ${r.api_error_status ?? ""} ${String(r.result ?? "").slice(0, 400)}`);
        if (r.api_error_status) e.message = `HTTP ${r.api_error_status}: ${e.message}`;
        e.result = out;
        throw e;
      }
      if (r.stop_reason === "max_tokens") {
        const e = new TruncatedError(`output truncated at max_tokens=${req.maxTokens}`);
        (e as any).result = out;
        throw e;
      }
      return out;
    } finally {
      if (handler) this.bridge?.handlers.delete(token);
      rmSync(sysFile, { force: true });
    }
  }
}
