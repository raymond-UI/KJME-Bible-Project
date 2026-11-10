// Model bake-off: run several translator models on the same passages, judge every candidate in one
// anonymized review per reviewer, and rank the models. Separate run directory; nothing is accepted.
import { existsSync, writeFileSync } from "node:fs";
import { StopRun } from "./agents.js";
import { batchInput, candidateView, type PipelineCtx } from "./pipeline.js";
import { materialize, mechanicalRaw } from "./checks.js";
import { planBatches } from "./batching.js";
import { pretagVerse } from "./pretag.js";
import { chapterVerses } from "./source.js";
import { readJson, seededShuffle, pool, now, newId } from "./util.js";
import { reference as ref } from "./books.js";

export interface Variant { key: string; agent: string; model: string; reasoning?: unknown; max_tokens?: number; role: string }

interface Score {
  batch: string; variant: string; checks_first: boolean; checks_final: boolean; repaired: boolean;
  auditor: { G1: string; G2: string } | null; scorer: { G1: string; G2: string } | null; weighted: number | null;
  cost: number; seconds: number; tool_calls: number; error?: string; notes: string[];
}

const W = (s: any) => (s && ["S1", "S2", "S3", "S4"].every((k) => typeof s[k] === "number") ? (s.S1 * 0.4 + s.S2 * 0.3 + s.S3 * 0.2 + s.S4 * 0.1) / 5 : null);

export async function bakeoff(ctx: PipelineCtx, pilotAccepted: Record<string, any>, batchIds: string[], variants: Variant[], focus: Record<string, string[]>): Promise<string> {
  const { store, agents } = ctx;
  const scores: Score[] = [];
  const renderings: Record<string, Record<string, string>> = {};
  for (const bid of batchIds) {
    const [book, chs] = bid.split(".");
    const ch = +chs;
    const verses = chapterVerses(ctx.source, book, ch).map((v) => pretagVerse(v, ctx.tables, ctx.locked, ctx.glossary));
    const plans = planBatches(verses, ctx.config.batch?.min_verses ?? 2, ctx.config.batch?.max_verses ?? 6);
    const pi = plans.findIndex((p) => p.id === bid);
    if (pi < 0) { ctx.log(`${bid}: not found`); continue; }
    const plan = plans[pi];
    const prev = plans.slice(Math.max(0, pi - 2), pi).map((p) => ({ batch_id: p.id, text: p.verses.map((v) => pilotAccepted[v.id]?.text ?? v.text).join(" ") }));
    ctx.log(`${bid} (${plan.verses.map((v) => v.verse).join(",")})`);

    // Translate with every variant
    const made = await pool(variants, 5, async (va) => {
      const meta = { cost: 0, seconds: 0, tool_calls: 0, calls: 0 } as any;
      const id = `${bid}.${va.key}`;
      const input = batchInput(ctx, plan, prev, agents.hasReference(va.agent));
      const override: Record<string, unknown> = { model: va.model, reasoning: va.reasoning, max_tokens: va.max_tokens ?? 24000, fallback_model: undefined };
      try {
        const raw = await agents.run(va.agent, input, { batch_id: bid, purpose: `bakeoff:${va.key}`, override, meta });
        let m = materialize(raw, { id, batch_id: bid, author: va.key, attempt: 1 }, plan.verses, ctx.tables, ctx.glossary);
        const first = m.report.passed;
        if (!first) {
          const failures = m.report.results.filter((r) => r.severity === "hard").map((r) => `${r.check} ${r.verse_id ?? ""}: ${r.detail}`);
          try {
            const raw2 = await agents.run(va.agent, { ...input, repair: { previous_output: raw, failed_checks: failures, instruction: "Your candidate failed these code checks. Fix them and return the full output again." } }, { batch_id: bid, purpose: `bakeoff-repair:${va.key}`, override, meta });
            m = materialize(raw2, { id, batch_id: bid, author: va.key, attempt: 2 }, plan.verses, ctx.tables, ctx.glossary);
          } catch (e: any) { if (e instanceof StopRun) throw e; }
        }
        store.add("candidates", m.candidate); store.add("check_reports", m.report);
        ctx.log(`  ${va.key}: checks ${first ? "pass" : m.report.passed ? "pass after repair" : "FAIL"} $${meta.cost.toFixed(4)} ${meta.seconds.toFixed(0)}s`);
        return { va, m, first, meta };
      } catch (e: any) {
        if (e instanceof StopRun) throw e;
        ctx.log(`  ${va.key}: ERROR ${String(e.message).slice(0, 160)}`);
        return { va, m: null, first: false, meta, error: String(e.message).slice(0, 300) };
      }
    });
    const mechM = materialize(mechanicalRaw(plan.verses), { id: `${bid}.mechanical`, batch_id: bid, author: "mechanical", attempt: 1 }, plan.verses, ctx.tables, ctx.glossary);
    const pool_ = made.filter((x) => x.m?.report.passed).map((x) => ({ c: x.m!.candidate, r: x.m!.report })).concat([{ c: mechM.candidate, r: mechM.report }]);

    // One anonymized review per reviewer over the whole pool
    const verdicts: Record<string, Record<string, any>> = {};
    for (const reviewer of ["reviewer-meaning-auditor", "reviewer-scorer"]) {
      const ids = seededShuffle(pool_.map((x) => x.c.id), `${bid}:${reviewer}:bakeoff`);
      const labelOf = new Map(ids.map((id, i) => [id, String.fromCharCode(65 + i)]));
      const views = pool_.map((x) => candidateView(x.c, x.r, labelOf.get(x.c.id)!)).sort((a, b) => a.label.localeCompare(b.label));
      try {
        const raw = await agents.run(reviewer, { ...batchInput(ctx, plan, prev, agents.hasReference(reviewer)), round: 1, candidates: views }, { batch_id: bid, purpose: "bakeoff-review" });
        const byLabel = new Map([...labelOf].map(([id, l]) => [l, id]));
        verdicts[reviewer] = {};
        for (const c of raw.candidates ?? []) { const id = byLabel.get(c.label); if (id) verdicts[reviewer][id] = c; }
        store.add("reviews", { id: newId("rev"), batch_id: bid, reviewer, round: 1, label_map: Object.fromEntries([...labelOf].map(([id, l]) => [l, id])), ...raw });
      } catch (e: any) { if (e instanceof StopRun) throw e; ctx.log(`  ${reviewer} failed: ${e.message}`); }
    }

    for (const x of made) {
      const id = `${bid}.${x.va.key}`;
      const a = verdicts["reviewer-meaning-auditor"]?.[id], s = verdicts["reviewer-scorer"]?.[id];
      const notes = [...(a?.gate_notes ?? []), ...(s?.gate_notes ?? [])].filter((n: string) => /fail/i.test(n)).slice(0, 3);
      scores.push({
        batch: bid, variant: x.va.key, checks_first: x.first, checks_final: !!x.m?.report.passed, repaired: !!x.m && x.m.candidate.attempt === 2,
        auditor: a ? { G1: a.gates.G1, G2: a.gates.G2 } : null, scorer: s ? { G1: s.gates.G1, G2: s.gates.G2 } : null, weighted: W(s?.scores),
        cost: x.meta.cost, seconds: x.meta.seconds, tool_calls: x.meta.tool_calls, error: (x as any).error, notes,
      });
      for (const vid of focus[bid] ?? []) {
        const t = x.m?.candidate.verses.find((v) => v.id === vid)?.text;
        if (t) (renderings[vid] ??= {})[x.va.key] = t;
      }
    }
  }
  store.add("events", { id: newId("ev"), type: "bakeoff_done", at: now(), variants: variants.map((v) => v.key), batches: batchIds });
  const md = reportMd(store.state.run_id, scores, variants, renderings, ctx);
  writeFileSync(store.path("bakeoff.md"), md);
  writeFileSync(store.path("bakeoff-scores.json"), JSON.stringify(scores, null, 2));
  return md;
}

function reportMd(runId: string, scores: Score[], variants: Variant[], renderings: Record<string, Record<string, string>>, ctx: PipelineCtx): string {
  const rows = variants.map((va) => {
    const s = scores.filter((x) => x.variant === va.key);
    const n = s.length || 1;
    const clean = s.filter((x) => x.checks_final && x.auditor?.G1 === "pass" && x.auditor?.G2 === "pass" && x.scorer?.G1 === "pass" && x.scorer?.G2 === "pass").length;
    const audPass = s.filter((x) => x.auditor?.G1 === "pass").length;
    const ws = s.map((x) => x.weighted).filter((x): x is number => x != null);
    const cost = s.reduce((t, x) => t + x.cost, 0);
    return { va, n: s.length, clean, audPass, first: s.filter((x) => x.checks_first).length, final: s.filter((x) => x.checks_final).length,
      w: ws.length ? ws.reduce((a, b) => a + b, 0) / ws.length : null, cost, per: cost / n, secs: s.reduce((t, x) => t + x.seconds, 0) / n, errors: s.filter((x) => x.error).length };
  }).sort((a, b) => b.clean - a.clean || b.audPass - a.audPass || (b.w ?? 0) - (a.w ?? 0) || a.cost - b.cost);
  const lines = [
    `# Model bake-off: ${runId}`, ``,
    `Same passages, same prompts, same glossary. Every candidate judged in one anonymized review per reviewer (auditor: ${ctx.config.agents["reviewer-meaning-auditor"].model}; scorer: ${ctx.config.agents["reviewer-scorer"].model}). Nothing here is accepted into the edition.`, ``,
    `"Clean" means: passed the code checks, and both reviewers passed it on meaning (G1) and pronoun number (G2).`, ``,
    `| Rank | Role · model | Clean | Auditor meaning pass | Checks first try | Checks after repair | Scorer avg | Cost | $/passage | Avg seconds | Errors |`,
    `|---|---|---|---|---|---|---|---|---|---|---|`,
    ...rows.map((r, i) => `| ${i + 1} | ${r.va.key} | ${r.clean}/${r.n} | ${r.audPass}/${r.n} | ${r.first}/${r.n} | ${r.final}/${r.n} | ${r.w != null ? r.w.toFixed(3) : "n/a"} | $${r.cost.toFixed(4)} | $${r.per.toFixed(4)} | ${r.secs.toFixed(0)} | ${r.errors} |`),
    ``, `## Contested verses, as each model rendered them`, ``,
  ];
  for (const [vid, byV] of Object.entries(renderings)) {
    lines.push(`### ${ref(vid)}`, ``, `KJV: ${ctx.source.get(vid)!.text}`, ``);
    for (const va of variants) if (byV[va.key]) {
      const s = scores.find((x) => x.variant === va.key && x.batch === [vid.split(".")[0], vid.split(".")[1], ""].join(".") ) ;
      void s;
      lines.push(`- **${va.key}**: ${byV[va.key]}`);
    }
    lines.push(``);
  }
  lines.push(`## Failures, by passage`, ``);
  for (const s of scores.filter((x) => !x.checks_final || x.auditor?.G1 === "fail" || x.scorer?.G1 === "fail" || x.error)) {
    lines.push(`- ${s.batch} · ${s.variant}: ${!s.checks_final ? "failed code checks. " : ""}${s.auditor?.G1 === "fail" ? "auditor: meaning fail. " : ""}${s.scorer?.G1 === "fail" ? "scorer: meaning fail. " : ""}${s.error ? "error: " + s.error : ""}${s.notes.length ? " " + s.notes.map((n) => `"${n.slice(0, 220)}"`).join(" ") : ""}`);
  }
  return lines.join("\n") + "\n";
}

export function loadPilotAccepted(path: string): Record<string, any> {
  return existsSync(path) ? readJson(path) : {};
}
