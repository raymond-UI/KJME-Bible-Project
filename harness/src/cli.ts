#!/usr/bin/env bun
// KJME pilot harness CLI. Run: bun src/cli.ts <command> [options]
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { loadEnv, readJson, newId, now } from "./util.js";
import { loadOsis, bookChapters } from "./source.js";
import { Glossary } from "./glossary.js";
import { Reference } from "./reference.js";
import { Store } from "./store.js";
import { Agents, BudgetExceeded } from "./agents.js";
import { AnthropicGateway, MockGateway, OpenRouterGateway } from "./llm.js";
import { mockRespond } from "./mock.js";
import { runBook, acceptedMap, applyAccepted, type PipelineCtx } from "./pipeline.js";
import { consistencyPass } from "./consistency.js";
import { writeReport } from "./report.js";
import { exportViewer } from "./viewer.js";
import { bakeoff, loadPilotAccepted, type Variant } from "./bakeoff.js";
import { auditCheck } from "./auditcheck.js";
import { copyFileSync, mkdirSync } from "node:fs";

const HARNESS = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SYSTEM = resolve(HARNESS, "..");

function args(): { cmd: string; opts: Record<string, string | boolean> } {
  const [cmd = "help", ...rest] = process.argv.slice(2);
  const opts: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith("--")) continue;
    const k = a.slice(2), v = rest[i + 1];
    if (v === undefined || v.startsWith("--")) opts[k] = true; else { opts[k] = v; i++; }
  }
  return { cmd, opts };
}

function context(opts: Record<string, string | boolean>) {
  loadEnv(join(HARNESS, ".env"));
  const configPath = resolve(String(opts.config ?? join(HARNESS, "pilot.config.json")));
  const config = readJson(configPath);
  const runId = String(opts.run ?? config.run_id ?? "pilot");
  const store = new Store(join(HARNESS, "runs", runId), runId);
  const srcPath = join(HARNESS, "data", "source", "eng-kjv.osis.xml");
  if (!existsSync(srcPath)) throw new Error("Source text missing. Run: bun src/cli.ts setup");
  const source = loadOsis(srcPath);
  const glossary = Glossary.open(store.path("glossary.json"), join(SYSTEM, config.glossary?.seed ?? "data/glossary.seed.json"), config.glossary?.ratify_after_uses ?? 3);
  const refDir = resolve(SYSTEM, config.reference?.path ?? "reference/data");
  const reference = new Reference(refDir, source, () => acceptedMap(store));
  const mock = !!opts.mock;
  const gateways = {
    openrouter: new OpenRouterGateway(config.inference?.openrouter ?? {}),
    anthropic: new AnthropicGateway(config.inference?.anthropic ?? {}),
    // OpenCode Go: one key, two wire formats depending on the model.
    "opencode-anthropic": new AnthropicGateway({ ...(config.inference?.opencode ?? {}), base_url: `${config.inference?.opencode?.base_url ?? "https://opencode.ai/inference/go"}/anthropic/v1`, api_key_env: config.inference?.opencode?.api_key_env ?? "OPENCODE_GO_API_KEY", bearer: true }, "opencode-anthropic"),
    "opencode-openai": new OpenRouterGateway({ ...(config.inference?.opencode ?? {}), base_url: `${config.inference?.opencode?.base_url ?? "https://opencode.ai/inference/go"}/openai/v1`, api_key_env: config.inference?.opencode?.api_key_env ?? "OPENCODE_GO_API_KEY", openrouter_extras: false }, "opencode-openai"),
    mock: new MockGateway(mockRespond),
  };
  const agents = new Agents({ systemRoot: SYSTEM, harnessRoot: HARNESS, config, gateways, store, reference, mock });
  const ctx: PipelineCtx = {
    config, store, agents, glossary, reference, source,
    tables: readJson(join(SYSTEM, "data", "archaic-forms.json")),
    locked: readJson(join(SYSTEM, "data", "locked-terms.json")),
    log: (s) => console.log(s),
  };
  return { ctx, config, store, source, reference, configPath, mock };
}

async function main() {
  const { cmd, opts } = args();
  switch (cmd) {
    case "setup": {
      execFileSync("bash", [join(HARNESS, "scripts", "fetch-source.sh")], { stdio: "inherit" });
      if (!existsSync(join(SYSTEM, "reference", "data", "MANIFEST.json")) || opts.force)
        execFileSync("bash", [join(SYSTEM, "reference", "fetch.sh")], { stdio: "inherit" });
      else console.log("Reference library already present (use --force to refetch).");
      return;
    }
    case "preflight": {
      loadEnv(join(HARNESS, ".env"));
      const cfg = resolve(String(opts.config ?? join(HARNESS, "pilot.config.json")));
      const extra = ["--verses", String(opts.verses ?? 104)];
      if (opts.credit) extra.push("--credit", String(opts.credit));
      try { execFileSync("python3", [join(SYSTEM, "tools", "preflight.py"), cfg, ...extra], { stdio: "inherit" }); }
      catch { process.exitCode = 1; }
      // Key and connectivity checks
      for (const [name, env] of [["OpenRouter", "OPENROUTER_API_KEY"], ["Anthropic", "ANTHROPIC_API_KEY"]])
        console.log(`${name} key: ${process.env[env] ? "set" : "MISSING"} (${env})`);
      return;
    }
    case "run": {
      const { ctx, config, store, source, reference, mock } = context(opts);
      const book = String(opts.book ?? config.scope?.books?.[0] ?? "PHP");
      const chapters = opts.chapters ? String(opts.chapters).split(",").map(Number) : (config.scope?.chapters ?? bookChapters(source, book));
      console.log(`KJME run ${store.state.run_id}: ${book} chapters ${chapters.join(",")}${mock ? " (MOCK MODEL)" : ""}`);
      console.log(`Reference: greek=${reference.available.greek} lexicon=${reference.available.lexicon} english=${reference.available.english}. Budget $${config.budget?.max_usd ?? "none"}.`);
      try { await runBook(ctx, book, chapters); }
      catch (e) { if (e instanceof BudgetExceeded) console.log(`Stopped: ${e.message}. Resume with the same command after raising the budget.`); else throw e; }
      if (!opts["skip-consistency"]) {
        const n = await consistencyPass(ctx, book);
        console.log(`Consistency pass: ${n} drift groups judged.`);
      }
      writeReport(store, source);
      console.log(`Spend: $${store.state.spend_usd.toFixed(3)}. Report: ${store.path("report.md")}  Viewer data: ${store.path("viewer-data.json")}`);
      return;
    }
    case "status": {
      const { store } = context(opts);
      const counts: Record<string, number> = {};
      for (const b of Object.values(store.state.batches)) counts[b.state] = (counts[b.state] ?? 0) + 1;
      console.log(JSON.stringify({ run: store.state.run_id, spend_usd: +store.state.spend_usd.toFixed(3), batches: counts }, null, 2));
      const latestEsc = [...new Map(store.all("escalations").map((e) => [e.id, e])).values()];
      for (const e of latestEsc.filter((e) => e.status === "open"))
        console.log(`open escalation ${e.batch_id} [${e.trigger}]: ${e.question} (recommended ${e.recommended_candidate ?? "n/a"})`);
      return;
    }
    case "resolve": {
      // Human decision on an escalated batch: --batch <id> --select <candidate id> [--by <name>] [--note <text>]
      const { ctx, store, source } = context(opts);
      const batch = String(opts.batch), pick = String(opts.select ?? "recommended");
      const esc = [...new Map(store.all("escalations").map((e) => [e.id, e])).values()].filter((e) => e.batch_id === batch && e.status === "open" && e.trigger !== "glossary_conflict").pop();
      if (!esc) throw new Error(`no open escalation for ${batch}`);
      const id = pick === "recommended" ? esc.recommended_candidate : pick;
      const cand = store.all("candidates").filter((c) => c.id === id).pop();
      if (!cand) throw new Error(`candidate ${id} not found`);
      const by = String(opts.by ?? ctx.config.release?.editors?.[0] ?? "human-editor");
      const decisionId = newId("D");
      store.add("decisions", { id: decisionId, batch_id: batch, decided_by: by, outcome: "select", winner: id, final_verses: cand.verses, rationale: String(opts.note ?? `Human resolution of escalation ${esc.id}.`), confidence: 1, supersedes: esc.decision_id, at: now() });
      store.add("escalations", { ...esc, status: "resolved", resolved_by: by, resolution: id, resolved_at: now() });
      applyAccepted(ctx, batch, decisionId, cand.verses, []);
      writeReport(store, source);
      console.log(`Resolved ${batch} with ${id} (by ${by}).`);
      return;
    }
    case "report": {
      const { store, source } = context(opts);
      writeReport(store, source);
      console.log(`Report: ${store.path("report.md")}  Viewer data: ${store.path("viewer-data.json")}`);
      return;
    }
    case "export-viewer": {
      // A run directory (default runs/<run id>), or any saved record such as ../pilot/philippians-001.
      const srcPath = join(HARNESS, "data", "source", "eng-kjv.osis.xml");
      if (!existsSync(srcPath)) throw new Error("Source text missing. Run: bun src/cli.ts setup");
      const config = readJson(resolve(String(opts.config ?? join(HARNESS, "pilot.config.json"))));
      const runId = String(opts.run ?? config.run_id ?? "pilot");
      const dir = opts.dir ? resolve(String(opts.dir)) : join(HARNESS, "runs", runId);
      if (!existsSync(join(dir, "accepted.json"))) throw new Error(`no accepted.json in ${dir}`);
      const out = resolve(String(opts.out ?? join(SYSTEM, "viewer", "public", "data")));
      const r = exportViewer(new Store(dir, runId), loadOsis(srcPath), out);
      console.log(`Viewer data: ${r.file}${r.issues ? ` (${r.issues} display issues; see viewer-verification.json)` : ""}`);
      return;
    }
    case "consistency": {
      const { ctx, config, store, source } = context(opts);
      const n = await consistencyPass(ctx, String(opts.book ?? config.scope?.books?.[0] ?? "PHP"));
      writeReport(store, source);
      console.log(`Consistency pass: ${n} drift groups judged.`);
      return;
    }
    case "auditcheck": {
      // Replay the reference auditor's reviews through another model: --model claude-haiku-5-5 --gateway opencode-anthropic
      const cfgPath = resolve(String(opts.config ?? join(HARNESS, "bakeoff.config.json")));
      const bcfg = readJson(cfgPath);
      const refRun = String(opts.ref ?? bcfg.run_id);
      const runId = String(opts.run ?? "auditcheck-001");
      const runDir = join(HARNESS, "runs", runId);
      mkdirSync(runDir, { recursive: true });
      if (!existsSync(join(runDir, "glossary.json"))) copyFileSync(join(HARNESS, "runs", refRun, "glossary.json"), join(runDir, "glossary.json"));
      const { ctx, store } = context({ ...opts, config: cfgPath, run: runId });
      const model = String(opts.model ?? "claude-haiku-5-5"), gateway = String(opts.gateway ?? "opencode-anthropic");
      const md = await auditCheck(ctx, join(HARNESS, "runs", refRun), loadPilotAccepted(join(HARNESS, "runs", bcfg.from_run ?? "pilot-php-001", "accepted.json")),
        { gateway, model, label: String(opts.label ?? model) }, opts.batches ? String(opts.batches).split(",") : undefined);
      console.log(md);
      console.log(`Spend recorded: $${store.state.spend_usd.toFixed(3)}`);
      return;
    }
    case "bakeoff": {
      // Compare translator models on chosen passages: --batches a,b --from <pilot run id>
      const bcfg = readJson(resolve(String(opts.config ?? join(HARNESS, "bakeoff.config.json"))));
      const runDir = join(HARNESS, "runs", String(opts.run ?? bcfg.run_id));
      const from = String(opts.from ?? bcfg.from_run);
      mkdirSync(runDir, { recursive: true });
      // Start from the pilot's glossary, so every model sees the same knowledge.
      if (!existsSync(join(runDir, "glossary.json"))) copyFileSync(join(HARNESS, "runs", from, "glossary.json"), join(runDir, "glossary.json"));
      const { ctx, store } = context({ ...opts, config: resolve(String(opts.config ?? join(HARNESS, "bakeoff.config.json"))), run: String(opts.run ?? bcfg.run_id) });
      const batches = String(opts.batches ?? bcfg.batches.join(",")).split(",");
      const md = await bakeoff(ctx, loadPilotAccepted(join(HARNESS, "runs", from, "accepted.json")), batches, bcfg.variants as Variant[], bcfg.focus ?? {});
      console.log(md.split("\n## Contested")[0]);
      console.log(`Spend: $${store.state.spend_usd.toFixed(3)}. Report: ${store.path("bakeoff.md")}`);
      return;
    }
    default:
      console.log(`KJME pilot harness

  setup                       fetch the KJV source and the reference library
  preflight [--credit 200]    check models, keys and estimated cost
  run [--chapters 1] [--mock] [--run <id>] [--skip-consistency]
                              run the pipeline (resumable: re-run the same command)
  status                      batch states, spend, open escalations
  resolve --batch <id> --select <candidate id|recommended> [--by <name>] [--note <text>]
  consistency                 re-run the consistency pass
  report                      rebuild report.md and viewer-data.json
  export-viewer [--run <id> | --dir <path>] [--out <dir>]
                              copy a run's viewer data into the web app (../viewer/public/data)

  Common: --config <path> (default pilot.config.json), --run <id>`);
  }
}

// Bun's fetch honours HTTPS_PROXY natively. Node's ignores it unless NODE_USE_ENV_PROXY=1 is set at startup, so
// under Node with a proxy configured, re-run this process with the flag (corporate or sandbox proxies).
const proxied = !process.versions.bun && (process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy);
if (proxied && !process.env.NODE_USE_ENV_PROXY) {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
    stdio: "inherit", env: { ...process.env, NODE_USE_ENV_PROXY: "1", NODE_NO_WARNINGS: "1" },
  });
  process.exit(r.status ?? 1);
} else {
  main().catch((e) => { console.error(e?.stack ?? e); process.exit(1); });
}
