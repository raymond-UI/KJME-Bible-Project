// Stages 3 to 9 for each batch (PIPELINE.md), run chapter by chapter.
import { Agents, BudgetExceeded } from "./agents.js";
import { materialize, mechanicalRaw, changeKey, type Candidate, type CheckReport } from "./checks.js";
import { planBatches, type BatchPlan } from "./batching.js";
import { pretagVerse, c11, type PretaggedVerse, type Tables, type Locked } from "./pretag.js";
import { chapterVerses } from "./source.js";
import { newId, now, pool, seededShuffle, writeJson, readJson } from "./util.js";
import type { Glossary } from "./glossary.js";
import type { Reference } from "./reference.js";
import type { SourceVerse } from "./source.js";
import type { Store } from "./store.js";
import { existsSync } from "node:fs";

export const TRANSLATORS = ["translator-minimalist", "translator-clarity", "translator-cadence"];
const SCORER = "reviewer-scorer", AUDITOR = "reviewer-meaning-auditor";
const WEIGHTS = { S1: 0.4, S2: 0.3, S3: 0.2, S4: 0.1 };

export interface PipelineCtx {
  config: any; store: Store; agents: Agents; glossary: Glossary; reference: Reference;
  source: Map<string, SourceVerse>; tables: Tables; locked: Locked; log: (s: string) => void;
}

export function acceptedMap(store: Store): Map<string, string> {
  const p = store.path("accepted.json");
  const m = new Map<string, string>();
  if (existsSync(p)) for (const [k, v] of Object.entries(readJson<Record<string, any>>(p))) m.set(k, v.text);
  return m;
}

function saveAccepted(store: Store, verses: Candidate["verses"], batchId: string, decisionId: string, status: "accepted" | "pending_human"): void {
  const p = store.path("accepted.json");
  const all: Record<string, any> = existsSync(p) ? readJson(p) : {};
  for (const v of verses) all[v.id] = { ...v, batch_id: batchId, decision_id: decisionId, status };
  writeJson(p, all);
}

// ---------- inputs ----------

function verseInput(v: PretaggedVerse) {
  return {
    id: v.id, kjv: v.text,
    italics: v.italics.map((s) => v.text.slice(s.start, s.end)),
    mechanical: v.mechanical.text,
    pretag: v.pretag.map((p) => ({ text: p.text, tag: p.tag, ...(p.number ? { number: p.number } : {}), ...(p.mandatory_update !== undefined ? { mandatory_update: p.mandatory_update } : {}), ...(p.glossary_id ? { glossary_id: p.glossary_id } : {}) })),
  };
}

export function batchInput(ctx: PipelineCtx, plan: BatchPlan, prev: { batch_id: string; text: string }[], withRef: boolean) {
  const chapter = chapterVerses(ctx.source, plan.book, plan.chapter).map((v) => `${v.verse} ${v.text}`).join("\n");
  const glossary = ctx.glossary.relevant(plan.verses.map((v) => v.text)).map((g) => ({ id: g.id, kjv_form: g.kjv_form, forms: g.forms, sense: g.sense, update: g.update, category: g.category, status: g.status, examples: g.examples, exceptions: g.exceptions, notes: g.notes }));
  return {
    batch_id: plan.id, verses: plan.verses.map(verseInput),
    context: { chapter_text: chapter, previous_accepted: prev.slice(-2) },
    glossary_version: ctx.glossary.version, glossary,
    config: { plural_you_style: ctx.config.plural_you_style ?? "marker" },
    ...(withRef ? { reference: { original: Object.fromEntries(plan.verses.map((v) => [v.id, ctx.reference.originalCompact(v.id)])) } } : {}),
  };
}

export function candidateView(c: Candidate, report: CheckReport, label: string) {
  return {
    label,
    verses: c.verses.map((v) => ({ id: v.id, text: v.text })),
    changes: c.verses.flatMap((v) => v.changes.map((ch) => ({ id: ch.id, verse_id: v.id, kjv: ch.kjv.text, update: ch.update.text, category: ch.category, reason: ch.reason, glossary_id: ch.glossary_id, auto: ch.auto, uncertain: ch.uncertain, evidence: ch.evidence }))),
    notes: c.notes,
    check_report: {
      passed: report.passed, metrics: report.metrics,
      gates_from_code: { G2: report.results.some((r) => r.check === "C3" && r.severity === "hard") ? "fail" : "pass", G3: report.results.some((r) => r.check === "C5" && r.severity === "hard") ? "fail" : "pass", G4: report.results.some((r) => r.check === "C2" && r.severity === "hard") ? "fail" : "pass" },
      warnings: report.results.filter((r) => r.severity === "warning").map((r) => `${r.check} ${r.verse_id}: ${r.detail}`),
    },
  };
}

// ---------- reviews ----------

interface Review { id: string; reviewer: string; round: number; labelToId: Record<string, string>; raw: any }

function weighted(scores: any): number | null {
  if (!scores) return null;
  const vals = Object.entries(WEIGHTS).map(([k, w]) => [scores[k], w] as [number, number]);
  if (vals.some(([s]) => typeof s !== "number")) return null;
  return +(vals.reduce((t, [s, w]) => t + s * w, 0) / 5).toFixed(3);
}

function reviewById(r: Review) {
  const byId: Record<string, any> = {};
  for (const c of r.raw.candidates ?? []) {
    const id = r.labelToId[c.label];
    if (id) byId[id] = { ...c, weighted: weighted(c.scores) };
  }
  const ranking = (r.raw.ranking ?? []).map((l: string) => r.labelToId[l]).filter(Boolean);
  return { byId, ranking };
}

function deanonymize(r: Review) {
  const { byId, ranking } = reviewById(r);
  return { review_id: r.id, reviewer: r.reviewer, round: r.round, candidates: byId, ranking, summary: r.raw.summary, round2_changes: r.raw.round2_changes };
}

/** Re-express another reviewer's review in this reviewer's labels. */
function relabel(other: Review, idToLabel: Record<string, string>) {
  const { byId, ranking } = reviewById(other);
  return {
    candidates: Object.entries(byId).map(([id, c]) => ({ ...c, label: idToLabel[id] })).filter((c) => c.label),
    ranking: ranking.map((id: string) => idToLabel[id]).filter(Boolean), summary: other.raw.summary,
  };
}

// ---------- batch ----------

export async function processBatch(ctx: PipelineCtx, plan: BatchPlan, prev: { batch_id: string; text: string }[]): Promise<{ status: string; text: string }> {
  const { store, agents, config } = ctx;
  const b = plan.id;
  const passages = plan.verses.map((v) => v.id).join(", ");
  store.add("batches", { id: b, book: plan.book, chapter: plan.chapter, verse_ids: plan.verses.map((v) => v.id), glossary_version: ctx.glossary.version, warnings: plan.verses.flatMap((v) => v.warnings.concat(c11(v, ctx.reference.secondPersonCounts(v.id)) ?? [])), at: now() });

  // Stage 3: translate
  store.setBatch(b, "translating");
  const cands: { c: Candidate; r: CheckReport }[] = [];
  await Promise.all(TRANSLATORS.map(async (t) => {
    const input = batchInput(ctx, plan, prev, agents.hasReference(t));
    let raw: any;
    try { raw = await agents.run(t, input, { batch_id: b, purpose: "translate" }); }
    catch (e: any) { if (e instanceof BudgetExceeded) throw e; ctx.log(`  ${b} ${t} failed: ${e.message}`); return; }
    let m = materialize(raw, { id: `${b}.${t.replace("translator-", "")}`, batch_id: b, author: t, attempt: 1 }, plan.verses, ctx.tables, ctx.glossary);
    // Stage 4: check, one repair
    if (!m.report.passed && (config.repair_attempts ?? 1) > 0) {
      store.add("candidates", m.candidate); store.add("check_reports", m.report);
      const failures = m.report.results.filter((r) => r.severity === "hard").map((r) => `${r.check} ${r.verse_id ?? ""}: ${r.detail}`);
      try {
        const raw2 = await agents.run(t, { ...input, repair: { previous_output: raw, failed_checks: failures, instruction: "Your candidate failed these code checks. Fix them and return the full output again." } }, { batch_id: b, purpose: "repair" });
        m = materialize(raw2, { id: `${b}.${t.replace("translator-", "")}`, batch_id: b, author: t, attempt: 2 }, plan.verses, ctx.tables, ctx.glossary);
      } catch (e: any) { if (e instanceof BudgetExceeded) throw e; ctx.log(`  ${b} ${t} repair failed: ${e.message}`); }
    }
    m.candidate.eligible = m.report.passed;
    store.add("candidates", m.candidate); store.add("check_reports", m.report);
    cands.push({ c: m.candidate, r: m.report });
  }));
  const mechM = materialize(mechanicalRaw(plan.verses), { id: `${b}.mechanical`, batch_id: b, author: "mechanical", attempt: 1 }, plan.verses, ctx.tables, ctx.glossary);
  mechM.candidate.eligible = mechM.report.passed;
  store.add("candidates", mechM.candidate); store.add("check_reports", mechM.report);
  const mech = { c: mechM.candidate, r: mechM.report };
  const checked = cands.filter((x) => x.r.passed).sort((x, y) => x.c.id.localeCompare(y.c.id));
  const pool_ = [...checked, mech];

  // Stage 5: review round 1 (anonymized per reviewer)
  store.setBatch(b, "reviewing");
  const labelsFor = (reviewer: string) => {
    const shuffled = seededShuffle(checked.map((x) => x.c.id), `${b}:${reviewer}`);
    const labelToId: Record<string, string> = { M: mech.c.id };
    shuffled.forEach((id, i) => { labelToId[String.fromCharCode(65 + i)] = id; });
    const idToLabel = Object.fromEntries(Object.entries(labelToId).map(([l, id]) => [id, l]));
    return { labelToId, idToLabel };
  };
  const reviewers = [SCORER, AUDITOR];
  const maps = Object.fromEntries(reviewers.map((r) => [r, labelsFor(r)]));
  const reviewInput = (reviewer: string, round: number, other?: Review) => {
    const { idToLabel } = maps[reviewer];
    const views = pool_.map((x) => candidateView(x.c, x.r, idToLabel[x.c.id])).sort((a, b2) => a.label.localeCompare(b2.label));
    const base = batchInput(ctx, plan, prev, agents.hasReference(reviewer));
    return { ...base, round, candidates: views, ...(other ? { other_review: relabel(other, idToLabel) } : {}) };
  };
  const runReview = async (reviewer: string, round: number, other?: Review): Promise<Review> => {
    const raw = await agents.run(reviewer, reviewInput(reviewer, round, other), { batch_id: b, purpose: `review_r${round}` });
    const r: Review = { id: newId(`rev-${round}`), reviewer, round, labelToId: maps[reviewer].labelToId, raw };
    store.add("reviews", { id: r.id, batch_id: b, reviewer, round, label_map: r.labelToId, ...raw });
    return r;
  };
  let [rs, ra] = await Promise.all([runReview(SCORER, 1), runReview(AUDITOR, 1)]);

  // Stage 6: debate, if triggered
  const debateReasons = (s: Review, a: Review): string[] => {
    const S = reviewById(s), A = reviewById(a), out: string[] = [];
    const sPass = Object.entries(S.byId).filter(([, c]: any) => Object.values(c.gates).every((g) => g === "pass") && c.weighted != null).sort(([, x]: any, [, y]: any) => y.weighted - x.weighted);
    const sTop = sPass[0]?.[0], aTop = A.ranking[0];
    if (sTop && aTop && sTop !== aTop) out.push("top_differs");
    for (const id of new Set([...Object.keys(S.byId), ...Object.keys(A.byId)]))
      for (const g of ["G1", "G2"]) if (S.byId[id] && A.byId[id] && S.byId[id].gates[g] !== A.byId[id].gates[g]) { out.push(`gate_${g}_${id}`); }
    if (sPass.length >= 2 && (sPass[0][1] as any).weighted - (sPass[1][1] as any).weighted < (config.escalation?.score_gap ?? 0.05)) out.push("close_scores");
    return out;
  };
  const reasons = debateReasons(rs, ra);
  let debated = false;
  if (reasons.length && (config.debate_rounds ?? 1) > 0) {
    store.setBatch(b, "debating");
    const [rs2, ra2] = await Promise.all([runReview(SCORER, 2, rs), runReview(AUDITOR, 2, ra)]);
    rs = rs2; ra = ra2; debated = true;
  }
  const finalReviews = [rs, ra].map(deanonymize);

  // Eligibility: checks passed and no reviewer fails G1 or G2 in its final round.
  const eligible = pool_.filter((x) => finalReviews.every((r) => !r.candidates[x.c.id] || (r.candidates[x.c.id].gates.G1 !== "fail" && r.candidates[x.c.id].gates.G2 !== "fail"))).map((x) => x.c.id);

  // Stage 7: coordinate
  store.setBatch(b, "coordinating");
  const coordIn = {
    ...batchInput(ctx, plan, prev, agents.hasReference("coordinator")),
    candidates: pool_.map((x) => ({ id: x.c.id, author: x.c.author, ...candidateView(x.c, x.r, x.c.id) })),
    reviews: finalReviews, eligible, debate: { ran: debated, triggers: reasons },
    ...(eligible.length === 0 ? { note: "No candidate is eligible. Escalate, with a precise question and your recommendation." } : {}),
  };
  const raw = await agents.run("coordinator", coordIn, { batch_id: b, purpose: "coordinate" });
  const decisionId = newId("D");
  let outcome = raw.outcome as string;
  let escalation = raw.escalation ?? null;
  let finalVerses: Candidate["verses"] | null = null;
  const escalate = (trigger: string, question: string) => {
    outcome = "escalate";
    escalation = { trigger, question, options: escalation?.options ?? pool_.map((x) => ({ label: x.c.author, ref: x.c.id })), recommendation: escalation?.recommendation ?? raw.winner ?? null, coordinator_outcome: raw.outcome };
  };
  const byId = new Map(pool_.map((x) => [x.c.id, x]));

  if (outcome === "select") {
    const w = byId.get(raw.winner);
    if (!w || !eligible.includes(raw.winner)) escalate("invalid_selection", `Coordinator selected ${raw.winner}, which is not eligible.`);
    else finalVerses = w.c.verses;
  } else if (outcome === "merge") {
    const m = materialize({ verses: raw.final_verses ?? [] }, { id: `${b}.merge`, batch_id: b, author: "coordinator", attempt: 1 }, plan.verses, ctx.tables, ctx.glossary);
    store.add("candidates", m.candidate); store.add("check_reports", m.report);
    const known = new Set<string>();
    for (const id of eligible) for (const v of byId.get(id)!.c.verses) for (const ch of v.changes) known.add(changeKey(ch.kjv.text, ch.update.text));
    for (const r of [rs, ra]) for (const c of r.raw.candidates ?? []) for (const cc of c.change_comments ?? []) if (cc.verdict === "alternative" && cc.alternative_text) {
      const cand = byId.get(r.labelToId[c.label]); const ch = cand?.c.verses.flatMap((v) => v.changes).find((x) => x.id === cc.change_id);
      if (ch) known.add(changeKey(ch.kjv.text, cc.alternative_text));
    }
    const novel = m.candidate.verses.flatMap((v) => v.changes).filter((ch) => !ch.auto && !known.has(changeKey(ch.kjv.text, ch.update.text)));
    if (!m.report.passed) escalate("merge_failed_checks", `Merged text failed checks: ${m.report.results.filter((r) => r.severity === "hard").map((r) => r.detail).join("; ").slice(0, 400)}`);
    else if (novel.length) escalate("merge_new_wording", `Merge introduced wording not in any eligible candidate or reviewer alternative: ${novel.map((c) => `"${c.kjv.text}" -> "${c.update.text}"`).join(", ")}`);
    else finalVerses = m.candidate.verses;
  }
  if (outcome !== "escalate" && finalVerses) {
    if ((raw.confidence ?? 0) < (config.escalation?.min_confidence ?? 0.7)) escalate("low_confidence", `Coordinator confidence ${raw.confidence} is below ${config.escalation?.min_confidence ?? 0.7}.`);
    else {
      const unsure = finalVerses.flatMap((v) => v.changes).filter((c) => c.uncertain);
      if (unsure.length) escalate("uncertain_sense", `Changes marked uncertain or touching escalate-only terms: ${unsure.map((c) => `${c.verse_id} "${c.kjv.text}" -> "${c.update.text}"`).join("; ")}`);
    }
  }
  if (outcome === "escalate" && !escalation?.trigger) escalation = { ...(escalation ?? {}), trigger: eligible.length ? "coordinator" : "no_eligible" };

  const decision = {
    id: decisionId, batch_id: b, decided_by: "coordinator", outcome, winner: outcome === "select" ? raw.winner : null,
    coordinator_raw_outcome: raw.outcome, final_verses: finalVerses, rationale: raw.rationale, cites: raw.cites ?? [],
    confidence: raw.confidence, glossary_version: ctx.glossary.version, glossary_proposals: raw.glossary_proposals ?? [],
    escalation: outcome === "escalate" ? escalation : null, eligible, debate: { ran: debated, triggers: reasons }, at: now(),
  };
  store.add("decisions", decision);

  // Stage 8-9: glossary and accept
  if (outcome === "escalate") {
    const rec = byId.get(escalation?.recommendation) ?? byId.get(raw.winner) ?? byId.get(eligible[0]) ?? mech;
    store.add("escalations", { id: newId("E"), batch_id: b, decision_id: decisionId, passages, ...escalation, recommended_candidate: rec.c.id, status: "open", at: now() });
    saveAccepted(store, rec.c.verses, b, decisionId, "pending_human");
    store.setBatch(b, "escalated");
    ctx.log(`  ${b} ESCALATED (${escalation?.trigger})`);
    return { status: "escalated", text: rec.c.verses.map((v) => v.text).join(" ") };
  }
  applyAccepted(ctx, b, decisionId, finalVerses!, raw.glossary_proposals ?? []);
  ctx.log(`  ${b} accepted (${outcome}${outcome === "select" ? " " + raw.winner : ""}${debated ? ", debated" : ""})`);
  return { status: "accepted", text: finalVerses!.map((v) => v.text).join(" ") };
}

export function applyAccepted(ctx: PipelineCtx, batchId: string, decisionId: string, verses: Candidate["verses"], proposals: any[]): void {
  const used = verses.flatMap((v) => v.changes.map((c) => c.glossary_id).filter(Boolean)) as string[];
  ctx.glossary.recordUses(used);
  const { added, conflicts } = ctx.glossary.propose(proposals, decisionId);
  for (const c of conflicts) ctx.store.add("escalations", { id: newId("E"), batch_id: batchId, decision_id: decisionId, trigger: "glossary_conflict", question: `Glossary conflict for "${c.kjv_form}" (${c.sense}): existing "${c.existing}" (${c.existing_id}) vs proposed "${c.proposed}".`, options: [{ label: c.existing, ref: c.existing_id }, { label: c.proposed, ref: "proposed" }], status: "open", blocking: false, at: now() });
  if (added.length) ctx.store.add("events", { id: newId("ev"), type: "glossary_added", batch_id: batchId, decision_id: decisionId, entries: added, at: now() });
  saveAccepted(ctx.store, verses, batchId, decisionId, "accepted");
  ctx.store.setBatch(batchId, "accepted");
}

// ---------- run ----------

export async function runBook(ctx: PipelineCtx, book: string, chapters: number[]): Promise<void> {
  const { config, store } = ctx;
  const runChapter = async (ch: number) => {
    const verses = chapterVerses(ctx.source, book, ch).map((v) => pretagVerse(v, ctx.tables, ctx.locked, ctx.glossary));
    const plans = planBatches(verses, config.batch?.min_verses ?? 2, config.batch?.max_verses ?? 6);
    const prev: { batch_id: string; text: string }[] = [];
    const accepted = acceptedMap(store);
    for (const plan of plans) {
      const st = store.batchState(plan.id);
      if (st === "accepted" || st === "escalated") {
        prev.push({ batch_id: plan.id, text: plan.verses.map((v) => accepted.get(v.id) ?? v.text).join(" ") });
        continue;
      }
      // Re-pretag with the current glossary, since earlier batches may have added entries.
      const fresh = { ...plan, verses: plan.verses.map((v) => pretagVerse(ctx.source.get(v.id)!, ctx.tables, ctx.locked, ctx.glossary)) };
      ctx.log(`${plan.id} (${fresh.verses[0].verse}-${fresh.verses[fresh.verses.length - 1].verse})`);
      try {
        const r = await processBatch(ctx, fresh, prev);
        prev.push({ batch_id: plan.id, text: r.text });
      } catch (e: any) {
        if (e instanceof BudgetExceeded) { store.setBatch(plan.id, "failed", e.message); throw e; }
        store.setBatch(plan.id, "failed", String(e.message ?? e));
        ctx.log(`  ${plan.id} FAILED: ${e.message}`);
        prev.push({ batch_id: plan.id, text: plan.verses.map((v) => v.mechanical.text).join(" ") });
      }
    }
  };
  await pool(chapters, config.parallel_batches ?? 1, runChapter);
}
