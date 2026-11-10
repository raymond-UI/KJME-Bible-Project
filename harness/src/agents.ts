// Build agent prompts from the system's documents and run agents with validation, retries, tools and logging.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import AjvModule from "ajv";
const Ajv: any = (AjvModule as any).default ?? AjvModule;
import { extractJson, newId, now, sha256, stripFrontmatter } from "./util.js";
import { StopRun, TruncatedError, type Gateway, type ToolDef } from "./llm.js";
import type { Store } from "./store.js";
import type { Reference } from "./reference.js";

const CONTRACTS: Record<string, string> = {
  translator: `
## Output contract (harness)

Return one JSON object and nothing else, in this shape:

{"verses":[{"id":"<verse id>","text":"<your full updated verse>","changes":[{"kjv":"<exact contiguous words from the KJV verse>","update":"<the exact words that replace them in your text>","category":"archaic_word|shifted_meaning|syntax|spelling|punctuation|verb_form|pronoun_sg|pronoun_pl","reason":"<one sentence, cite a rule>","glossary_id":"<id or null>","uncertain":false,"evidence":[{"lookup_id":"<id>","note":"<what it showed>"}]}]}],"glossary_proposals":[{"kjv_form":"","sense":"","update":"<text or KEEP>","category":"","example":"<verse id>"}],"notes":""}

Harness rules:
- Include every verse of the batch, in order, with the same ids.
- Start from each verse's \`mechanical\` text. The pronoun and table verb-form updates already in it are logged by the harness. Do not log them.
- Log every other difference between the KJV text and your text. \`kjv\` is copied exactly from the KJV verse (not the mechanical draft). \`update\` appears exactly in your text. Keep each change as small as it can be; group words only when they change together.
- Offsets, italics and pronoun number marks are computed by the harness. Never write a marker such as "you(pl)" into the text.
- Preloaded Greek (NT) or Hebrew (OT) is in \`reference.original\` when you have reference access. Cite it in evidence as \`pre:<verse id>\`. Tool lookups return their own lookup_id.`,

  reviewer: `
## Output contract (harness)

Return one JSON object and nothing else, in this shape:

{"candidates":[{"label":"A","gates":{"G1":"pass|fail","G2":"pass|fail","G3":"pass|fail","G4":"pass|fail","G5":"pass|fail"},"gate_notes":["<verse id: span: rule>"],"scores":{"S1":1-5,"S2":1-5,"S3":1-5,"S4":1-5} or null,"change_comments":[{"change_id":"c3","verdict":"agree|disagree|alternative","alternative_text":"<text or null>","reason":"<cite rule>"}]}],"ranking":["<labels of candidates that pass every gate, best first>"],"summary":"<at most 3 sentences>","round2_changes":[{"item":"","from":"","to":"","reason":""}]}

Harness rules:
- Judge every candidate label in the input, including M (the mechanical draft).
- change_id refers to the ids in each candidate's change list. Changes marked auto are mechanical.
- The harness computes weighted totals. Do not compute them.
- G2 to G4 come from each candidate's check report. Copy them unless you see an error, and say so in gate_notes.
- round2_changes is only for round 2.`,

  coordinator: `
## Output contract (harness)

Return one JSON object and nothing else, in this shape:

{"outcome":"select|merge|escalate","winner":"<candidate id or null>","final_verses":[],"glossary_proposals":[{"kjv_form":"","sense":"","update":"<text or KEEP>","category":"","example":"<verse id>"}],"rationale":"<at most 5 sentences>","cites":["<review ids and rules>"],"confidence":0.0,"doubts":[],"escalation":null}

Harness rules:
- Use candidate ids from the input, not reviewer labels. \`eligible\` lists the candidates you may select.
- For merge, give final_verses exactly like a translator's verses, and add \`source\` to each change: the candidate id, or \`review:<review id>\`, it came from. The harness rejects any change not found in an eligible candidate or a reviewer alternative.
- For escalate, set escalation to {"trigger":"<one of the triggers below>","question":"","plain_question":"","context":"","focus_verses":["<verse id>"],"disputed":[{"verse_id":"<verse id>","kjv":"<KJV wording in question>"}],"options":[{"label":"","ref":"<candidate id>"}],"recommendation":"<candidate id and why>"}.
  - trigger: no_eligible (no candidate is eligible), g1_dispute (reviewers still disagree on a G1 gate), escalate_only_term (a change touches an escalate-only term), uncertain_sense (the sense of a word is in doubt), or low_confidence (you cannot choose with confidence). Use exactly one of these words.
  - question: the technical question, for the record.
  - plain_question: one sentence a reader with no knowledge of the rules can answer. Name the word and the verse. No rule codes, gate names or Greek.
  - context: two or three plain sentences: what the word meant in 1611, how it reads today, and what each real option does. No rule codes.
  - focus_verses: only the verses the decision is about.
  - disputed: every KJV word or phrase the question is about, by verse. Until a human decides, the harness keeps the batch's undisputed edits and holds only these at the mechanical draft, so name each one, and nothing else.
- doubts: when you select or merge but are not sure, list each word you are unsure of as {"verse_id":"","kjv":"<KJV wording>","question":"<one plain sentence a human can answer>"}. If your confidence is below the harness threshold the batch escalates on these doubts, so a low confidence with no doubts gives the human nothing to decide. Leave it empty when you are sure.
- Propose glossary entries for new decisions, including KEEP decisions.`,

  "consistency-editor": `
## Output contract (harness)

Return one JSON object and nothing else:

{"verdict":"patch|no_change","reason":"<at most 2 sentences>","patches":[{"verse_id":"","text":"<full updated verse>","changes":[{"kjv":"","update":"","category":"","reason":"","glossary_id":null}]}],"glossary_proposals":[]}`,
};

const OUTPUT_SCHEMA: Record<string, string> = {
  translator: "translator-output.json", reviewer: "reviewer-output.json",
  coordinator: "coordinator-output.json", "consistency-editor": "consistency-output.json",
};

export function roleOf(agent: string): string {
  if (agent.startsWith("translator-")) return "translator";
  if (agent.startsWith("reviewer-")) return "reviewer";
  return agent;
}

const LOOKUP_TOOL: ToolDef = {
  name: "lookup",
  description: "Offline reference library (reference/REFERENCE.md). Use only to settle what the KJV English meant in 1611. functions: original(verse_id) -> the KJV's own Greek (NT) or Hebrew (OT) words, with any variant where the KJV's Hebrew edition may differ; lexicon(strongs) -> brief lexicon entry; english_1611(headword) -> early modern English dictionaries; occurrences(kjv_form, limit) -> other KJV verses with that form and their accepted KJME text.",
  parameters: {
    type: "object",
    properties: {
      function: { type: "string", enum: ["original", "lexicon", "english_1611", "occurrences"] },
      verse_id: { type: "string" }, strongs: { type: "string" }, headword: { type: "string" },
      kjv_form: { type: "string" }, limit: { type: "integer" },
    },
    required: ["function"],
  },
};

export class BudgetExceeded extends StopRun {}
export { StopRun };

export interface AgentContext {
  systemRoot: string; harnessRoot: string; config: any; gateways: Record<string, Gateway>;
  store: Store; reference: Reference; mock: boolean;
}

export class Agents {
  private prompts = new Map<string, { text: string; hash: string }>();
  private ajv = new Ajv({ allErrors: true, strict: false });
  private validators = new Map<string, any>();
  constructor(private ctx: AgentContext) {}

  systemPrompt(agent: string): { text: string; hash: string } {
    if (this.prompts.has(agent)) return this.prompts.get(agent)!;
    const file = join(this.ctx.systemRoot, "agents", `${agent}.md`);
    const { meta, body } = stripFrontmatter(readFileSync(file, "utf8"));
    const ctxFiles = (meta.context ?? "").replace(/[[\]]/g, "").split(",").map((s) => s.trim()).filter(Boolean);
    const parts: string[] = [];
    for (const f of ctxFiles) parts.push(`<document path="${f}">\n${stripFrontmatter(readFileSync(join(this.ctx.systemRoot, f), "utf8")).body}\n</document>`);
    if (meta.extends) parts.push(stripFrontmatter(readFileSync(join(this.ctx.systemRoot, meta.extends), "utf8")).body);
    parts.push(body);
    parts.push(CONTRACTS[roleOf(agent)] ?? "");
    const text = parts.join("\n\n");
    const v = { text, hash: sha256(text) };
    this.prompts.set(agent, v);
    return v;
  }

  private validator(agent: string) {
    const role = roleOf(agent);
    if (!this.validators.has(role)) {
      const schema = JSON.parse(readFileSync(join(this.ctx.harnessRoot, "schemas", OUTPUT_SCHEMA[role]), "utf8"));
      this.validators.set(role, this.ajv.compile(schema));
    }
    return this.validators.get(role);
  }

  hasReference(agent: string): boolean {
    return (this.ctx.config.reference?.access ?? []).includes(agent);
  }

  async run(agent: string, input: any, opts: { batch_id: string; purpose: string; override?: Record<string, unknown>; meta?: { cost: number; seconds: number; tool_calls: number; calls: number; model_served?: string } }): Promise<any> {
    const cfg = { ...(this.ctx.config.agents?.[agent] ?? {}), ...(this.ctx.config.agents_feedback?.[agent] ?? {}), ...(opts.override ?? {}) };
    if (!cfg.model) throw new Error(`no model configured for ${agent}`);
    const budget = this.ctx.config.budget?.max_usd ?? Infinity;
    if (this.ctx.store.state.spend_usd >= budget) throw new BudgetExceeded(`budget of $${budget} reached`);
    const gw = this.ctx.mock ? this.ctx.gateways.mock : this.ctx.gateways[cfg.gateway ?? "openrouter"];
    if (!gw) throw new Error(`gateway ${cfg.gateway} not configured`);
    const sys = this.systemPrompt(agent);
    const tools = this.hasReference(agent) && !this.ctx.mock ? [LOOKUP_TOOL] : undefined;
    const maxLookups = this.ctx.config.reference?.max_lookups_per_agent_per_batch ?? 8;
    const validate = this.validator(agent);
    const baseUser = JSON.stringify(input);
    const baseHash = sha256(baseUser);

    // Replay: a successful call with the same agent, prompt and input is reused, so a re-run after a
    // late failure does not pay for the same calls twice. Disable with config.replay_cache: false.
    if (this.ctx.config.replay_cache !== false && !this.ctx.mock) {
      const hit = this.cached(agent, sys.hash, baseHash, cfg.model);
      if (hit) {
        try {
          const parsed = extractJson(hit.output);
          if (validate(parsed)) {
            this.ctx.store.add("events", { id: newId("ev"), type: "agent_call_replayed", agent, purpose: opts.purpose, batch_id: opts.batch_id, replay_of: hit.id, at: now() });
            return parsed;
          }
        } catch { /* fall through to a live call */ }
      }
    }

    const retries = this.ctx.config.agent_retries ?? 2;
    const models = [cfg.model, ...(cfg.fallback_model ? [cfg.fallback_model] : [])];
    let lastErr = "";
    for (const model of models) {
      let user = baseUser;
      let maxTokens = cfg.max_tokens ?? 8000;
      for (let attempt = 0; attempt <= retries; attempt++) {
        if (this.ctx.store.state.spend_usd >= budget) throw new BudgetExceeded(`budget of $${budget} reached`);
        const started = now();
        const eventId = newId("ev");
        const base = { id: eventId, type: "agent_call", agent, purpose: opts.purpose, batch_id: opts.batch_id, attempt: attempt + 1, gateway: gw.name, model_requested: model, fallback: model !== cfg.model, prompt_hash: sys.hash, base_input_hash: baseHash, input_hash: sha256(user), max_tokens: maxTokens, started_at: started };
        try {
          const res = await gw.call({
            agent, model, system: sys.text, user, temperature: cfg.temperature ?? null,
            maxTokens, tools, maxToolCalls: maxLookups, reasoning: cfg.reasoning, jsonMode: !!cfg.json_mode, session: `${opts.batch_id}:${agent}`,
            onTool: async (name, args) => this.lookup(name, args, agent, opts.batch_id),
          });
          this.ctx.store.addSpend(res.cost_usd);
          if (opts.meta) { opts.meta.cost += res.cost_usd; opts.meta.calls++; opts.meta.tool_calls += res.tool_calls; opts.meta.seconds += (Date.now() - Date.parse(started)) / 1000; opts.meta.model_served = res.model; }
          let parsed: any, error = "";
          try {
            parsed = extractJson(res.text);
            if (!validate(parsed)) error = this.ajv.errorsText(validate.errors, { separator: "; " });
          } catch (e: any) { error = String(e.message ?? e); }
          this.ctx.store.add("events", {
            ...base, model_served: res.model, provider: res.provider, usage: res.usage, cost_usd: res.cost_usd,
            tool_calls: res.tool_calls, turns: res.turns, finished_at: now(), ok: !error, error: error || undefined, output: res.text,
          });
          if (!error) return parsed;
          lastErr = error;
          user = baseUser + `\n\nYour previous reply failed validation: ${error.slice(0, 1500)}\nReply again with one JSON object only, following the output contract.`;
        } catch (e: any) {
          if (e instanceof StopRun) throw e;
          lastErr = String(e.message ?? e);
          const partial = (e as any).result;
          if (partial) this.ctx.store.addSpend(partial.cost_usd ?? 0);
          if (opts.meta) { opts.meta.cost += partial?.cost_usd ?? 0; opts.meta.calls++; opts.meta.seconds += (Date.now() - Date.parse(started)) / 1000; }
          this.ctx.store.add("events", { ...base, finished_at: now(), ok: false, error: lastErr, ...(partial ? { usage: partial.usage, cost_usd: partial.cost_usd, model_served: partial.model, provider: partial.provider } : {}) });
          if (e instanceof TruncatedError) {
            maxTokens = Math.min(Math.round(maxTokens * 1.6), cfg.max_tokens_cap ?? 48000);
            user = baseUser + `\n\nYour previous reply was cut off before it finished. Think briefly, then reply with one JSON object only.`;
            continue;
          }
          if (/HTTP 4(0[0-3]|04)/.test(lastErr)) break; // auth, bad request, unknown model: retrying will not help
        }
      }
      if (model !== models[models.length - 1]) this.ctx.store.add("events", { id: newId("ev"), type: "fallback", agent, batch_id: opts.batch_id, from: model, to: models[models.indexOf(model) + 1], reason: lastErr.slice(0, 300), at: now() });
    }
    throw new Error(`${agent} failed (${models.join(" then ")}): ${lastErr.slice(0, 500)}`);
  }

  private cache: Map<string, any> | null = null;
  private cached(agent: string, promptHash: string, inputHash: string, model: string): any | undefined {
    if (!this.cache) {
      this.cache = new Map();
      for (const e of this.ctx.store.all("events"))
        if (e.type === "agent_call" && e.ok && e.base_input_hash && e.output) this.cache.set(`${e.agent}|${e.model_requested}|${e.prompt_hash}|${e.base_input_hash}`, e);
    }
    return this.cache.get(`${agent}|${model}|${promptHash}|${inputHash}`);
  }

  private async lookup(name: string, args: any, agent: string, batchId: string): Promise<unknown> {
    const ref = this.ctx.reference;
    let result: unknown;
    if (name !== "lookup") result = { error: `unknown tool ${name}` };
    else switch (args.function) {
      case "original": result = ref.original(String(args.verse_id ?? "")); break;
      case "lexicon": result = ref.lexicon(String(args.strongs ?? "")); break;
      case "english_1611": result = ref.english1611(String(args.headword ?? "")); break;
      case "occurrences": result = ref.occurrences(String(args.kjv_form ?? ""), Number(args.limit ?? 10)); break;
      default: result = { error: `unknown function ${args.function}` };
    }
    const lookup_id = newId("L");
    this.ctx.store.add("lookups", { lookup_id, agent, batch_id: batchId, query: args, at: now(), result });
    return { lookup_id, result };
  }
}
