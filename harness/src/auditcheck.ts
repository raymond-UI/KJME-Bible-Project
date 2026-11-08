// Auditor check: replay a reference auditor's reviews (same candidates, same labels) through another
// model and compare verdicts. The dangerous disagreement is a meaning failure the reference caught and
// the challenger passed.
import { writeFileSync } from "node:fs";
import { batchInput, candidateView, type PipelineCtx } from "./pipeline.js";
import { planBatches } from "./batching.js";
import { pretagVerse } from "./pretag.js";
import { chapterVerses } from "./source.js";
import { readJsonl } from "./util.js";
import { materialize, mechanicalRaw } from "./checks.js";
import { join } from "node:path";

export async function auditCheck(ctx: PipelineCtx, refRunDir: string, pilotAccepted: Record<string, any>, challenger: { gateway: string; model: string; label: string }, batches?: string[]): Promise<string> {
  const reviews = readJsonl(join(refRunDir, "record", "reviews.jsonl")).filter((r: any) => r.reviewer === "reviewer-meaning-auditor");
  const cands = new Map<string, any>(); for (const c of readJsonl(join(refRunDir, "record", "candidates.jsonl"))) cands.set(c.id, c);
  const reps = new Map<string, any>(); for (const r of readJsonl(join(refRunDir, "record", "check_reports.jsonl"))) reps.set(r.candidate_id, r);
  const lastByBatch = new Map<string, any>(); for (const r of reviews) lastByBatch.set(r.batch_id, r);
  const ids = batches ?? [...lastByBatch.keys()];
  const rows: any[] = [];
  let cost = 0, seconds = 0, failedCalls = 0;
  for (const bid of ids) {
    const ref = lastByBatch.get(bid);
    if (!ref) continue;
    const [book, chs] = bid.split(".");
    const verses = chapterVerses(ctx.source, book, +chs).map((v) => pretagVerse(v, ctx.tables, ctx.locked, ctx.glossary));
    const plans = planBatches(verses, ctx.config.batch?.min_verses ?? 2, ctx.config.batch?.max_verses ?? 6);
    const pi = plans.findIndex((p) => p.id === bid);
    const plan = plans[pi];
    const prev = plans.slice(Math.max(0, pi - 2), pi).map((p) => ({ batch_id: p.id, text: p.verses.map((v) => pilotAccepted[v.id]?.text ?? v.text).join(" ") }));
    const mech = materialize(mechanicalRaw(plan.verses), { id: `${bid}.mechanical`, batch_id: bid, author: "mechanical", attempt: 1 }, plan.verses, ctx.tables, ctx.glossary);
    const views = Object.entries(ref.label_map as Record<string, string>).map(([label, id]) => {
      const c = cands.get(id) ?? (id === mech.candidate.id ? mech.candidate : undefined), r = reps.get(id) ?? (id === mech.candidate.id ? mech.report : undefined);
      return c && r ? candidateView(c, r, label) : null;
    }).filter(Boolean).sort((a: any, b: any) => a.label.localeCompare(b.label));
    const meta = { cost: 0, seconds: 0, tool_calls: 0, calls: 0 } as any;
    let out: any = null;
    try {
      out = await ctx.agents.run("reviewer-meaning-auditor", { ...batchInput(ctx, plan, prev, true), round: 1, candidates: views },
        { batch_id: bid, purpose: `auditcheck:${challenger.label}`, override: { gateway: challenger.gateway, model: challenger.model, fallback_model: undefined }, meta });
    } catch (e: any) { failedCalls++; ctx.log(`  ${bid}: ${challenger.label} failed: ${String(e.message).slice(0, 200)}`); }
    cost += meta.cost; seconds += meta.seconds;
    const got = new Map<string, any>((out?.candidates ?? []).map((c: any) => [c.label, c]));
    for (const rc of ref.candidates ?? []) {
      const ch = got.get(rc.label);
      rows.push({
        batch: bid, label: rc.label, candidate: ref.label_map[rc.label],
        ref: { G1: rc.gates?.G1, G2: rc.gates?.G2, notes: (rc.gate_notes ?? []).filter((n: string) => /fail/i.test(n)).slice(0, 2) },
        ch: ch ? { G1: ch.gates?.G1, G2: ch.gates?.G2, notes: (ch.gate_notes ?? []).filter((n: string) => /fail/i.test(n)).slice(0, 2) } : null,
      });
    }
    ctx.log(`${bid}: ${views.length} candidates judged by ${challenger.label} in ${meta.seconds.toFixed(0)}s`);
  }
  const judged = rows.filter((r) => r.ch);
  const agreeG1 = judged.filter((r) => r.ref.G1 === r.ch.G1).length;
  const missed = judged.filter((r) => r.ref.G1 === "fail" && r.ch.G1 === "pass");
  const extra = judged.filter((r) => r.ref.G1 === "pass" && r.ch.G1 === "fail");
  const refFails = judged.filter((r) => r.ref.G1 === "fail").length;
  const md = [
    `# Auditor check: ${challenger.label} vs the reference auditor`, ``,
    `Same passages, same candidates, same labels as the reference review. Verdicts compared on G1 (meaning).`, ``,
    `| | |`, `|---|---|`,
    `| Candidates compared | ${judged.length} (of ${rows.length}) |`,
    `| Agreement on meaning | ${judged.length ? Math.round((agreeG1 / judged.length) * 100) : 0}% (${agreeG1}/${judged.length}) |`,
    `| Meaning failures the reference caught | ${refFails} |`,
    `| ...of those, the challenger **missed** | **${missed.length}** |`,
    `| Failures only the challenger flagged | ${extra.length} |`,
    `| Failed calls | ${failedCalls} |`,
    `| Notional cost at list price | $${cost.toFixed(3)} |`,
    `| Time | ${seconds.toFixed(0)}s total |`, ``,
    `## Missed meaning failures (the dangerous direction)`, ``,
    ...(missed.length ? missed.map((r) => `- **${r.batch} · ${r.candidate.split(".").pop()}**: reference said: ${r.ref.notes.map((n: string) => `"${n.slice(0, 280)}"`).join(" ") || "(no note)"}`) : ["None."]), ``,
    `## Extra failures only the challenger raised`, ``,
    ...(extra.length ? extra.map((r) => `- **${r.batch} · ${r.candidate.split(".").pop()}**: ${r.ch.notes.map((n: string) => `"${n.slice(0, 280)}"`).join(" ") || "(no note)"}`) : ["None."]), ``,
  ].join("\n");
  writeFileSync(ctx.store.path(`auditcheck-${challenger.label}.md`), md);
  writeFileSync(ctx.store.path(`auditcheck-${challenger.label}.json`), JSON.stringify(rows, null, 2));
  return md;
}
