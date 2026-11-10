// Viewer data builder. Computes every displayed run of text here, in code, and verifies it against the
// source before the data is written. The web app in ../viewer only renders these runs; it never computes a diff.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { align, hunks, tokenize } from "./text.js";
import { readJson } from "./util.js";
import { reference as ref, USFM_NAME } from "./books.js";
import type { Store } from "./store.js";
import type { SourceVerse } from "./source.js";

interface Layer { start: number; end: number; cls: string; ch?: string }
interface Marker { at: number; m: "pl" | "sg"; before?: string; cls?: string; k?: string }
export interface Run { t: string; c?: string; k?: string; m?: string }

/** Split text at every layer boundary; each piece carries the classes of the layers covering it. */
function buildRuns(text: string, layers: Layer[], markers: Marker[] = []): Run[] {
  const cuts = new Set<number>([0, text.length]);
  for (const l of layers) { cuts.add(Math.max(0, Math.min(text.length, l.start))); cuts.add(Math.max(0, Math.min(text.length, l.end))); }
  for (const m of markers) cuts.add(m.at);
  const pts = [...cuts].sort((a, b) => a - b);
  const runs: Run[] = [];
  for (let i = 0; i < pts.length; i++) {
    const at = pts[i];
    for (const m of markers.filter((x) => x.at === at)) {
      if (m.before !== undefined) runs.push({ t: m.before, c: m.cls, ...(m.k ? { k: m.k } : {}) }); // deleted KJV text shown inline
      else runs.push({ t: "", m: m.m });
    }
    if (i === pts.length - 1) break;
    const s = at, e = pts[i + 1];
    if (e <= s) continue;
    const cover = layers.filter((l) => l.start <= s && l.end >= e && l.end > l.start);
    const cls = [...new Set(cover.map((l) => l.cls))].join(" ");
    const ks = [...new Set(cover.map((l) => l.ch).filter(Boolean))].join(",");
    const prev = runs[runs.length - 1];
    if (prev && !prev.m && prev.c === (cls || undefined) && prev.k === (ks || undefined) && !prev.c?.includes("del")) prev.t += text.slice(s, e);
    else runs.push({ t: text.slice(s, e), ...(cls ? { c: cls } : {}), ...(ks ? { k: ks } : {}) });
  }
  // Pronoun markers belong after their word; place a marker at a run end when it sits at the cut.
  return runs;
}

const plain = (runs: Run[], keepDel = false) => runs.filter((r) => !r.m && (keepDel || !r.c?.includes("del"))).map((r) => r.t).join("");

function overlap(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1] || (a[0] === a[1] && b[0] <= a[0] && a[0] <= b[1]);
}

interface VerseBuild { runs: { read: Run[]; kjv: Run[]; inline: Run[] }; issues: string[] }

function buildVerse(kjvText: string, kjvItalics: { start: number; end: number }[], v: any): VerseBuild {
  const issues: string[] = [];
  const text: string = v.text;
  const changes: any[] = v.changes ?? [];
  const K = tokenize(kjvText), U = tokenize(text);
  const al = align(K, U);
  const hs = hunks(K, U, al);

  // Change spans must match the texts they claim.
  for (const c of changes) {
    if (kjvText.slice(c.kjv.start, c.kjv.end) !== c.kjv.text) issues.push(`change ${c.id}: KJV span does not match "${c.kjv.text}"`);
    if (text.slice(c.update.start, c.update.end) !== c.update.text) issues.push(`change ${c.id}: update span does not match "${c.update.text}"`);
  }
  // Pronoun marks must sit on you/your/yours.
  for (const m of v.pronoun_marks ?? []) {
    const w = text.slice(m.start, m.end).toLowerCase();
    if (!["you", "your", "yours"].includes(w)) issues.push(`pronoun mark on "${w}" at ${m.start}`);
  }
  // Every textual difference must be covered by a logged change (mechanical or committee).
  const hunkInfo = hs.map((h) => {
    const kr: [number, number] = h.a[0] < h.a[1] ? [K[h.a[0]].start, K[h.a[1] - 1].end] : [h.a[0] < K.length ? K[h.a[0]].start : kjvText.length, h.a[0] < K.length ? K[h.a[0]].start : kjvText.length];
    const ur: [number, number] = h.b[0] < h.b[1] ? [U[h.b[0]].start, U[h.b[1] - 1].end] : [h.b[0] < U.length ? U[h.b[0]].start : text.length, h.b[0] < U.length ? U[h.b[0]].start : text.length];
    const covering = changes.filter((c) => overlap([c.update.start, c.update.end], ur) || overlap([c.kjv.start, c.kjv.end], kr));
    const kind = covering.some((c) => !c.auto) ? "edit" : covering.length ? "mech" : "unlogged";
    if (kind === "unlogged") issues.push(`unlogged difference: "${kjvText.slice(kr[0], kr[1])}" -> "${text.slice(ur[0], ur[1])}"`);
    return { kr, ur, kind, ids: covering.map((c) => c.id).join(",") };
  });

  const marks: Marker[] = (v.pronoun_marks ?? []).map((m: any) => ({ at: m.end, m: m.number }));
  const italicsU: Layer[] = (v.italics ?? []).map((s: any) => ({ ...s, cls: "it" }));
  const italicsK: Layer[] = kjvItalics.map((s) => ({ ...s, cls: "it" }));

  // Read view: KJME with change highlights, italics, number marks.
  const read = buildRuns(text, [
    ...italicsU,
    ...changes.map((c) => ({ start: c.update.start, end: c.update.end, cls: c.auto ? "mech" : `chg cat-${c.category}`, ch: c.id })),
  ], marks);
  // KJV view: original with the replaced words marked.
  const kjv = buildRuns(kjvText, [
    ...italicsK,
    ...changes.map((c) => ({ start: c.kjv.start, end: c.kjv.end, cls: c.auto ? "mech-k" : `chg-k cat-${c.category}`, ch: c.id })),
  ]);
  // Inline diff: KJME, with each changed region preceded by the KJV words it replaced.
  const inline = buildRuns(text, [
    ...italicsU,
    ...hunkInfo.filter((h) => h.ur[1] > h.ur[0]).map((h) => ({ start: h.ur[0], end: h.ur[1], cls: `ins ${h.kind}`, ch: h.ids })),
  ], [
    ...marks,
    ...hunkInfo.filter((h) => h.kr[1] > h.kr[0]).map((h) => ({ at: h.ur[0], m: "pl" as const, before: kjvText.slice(h.kr[0], h.kr[1]), cls: `del ${h.kind}`, k: h.ids || undefined })),
  ]);

  // Verify the runs reproduce the texts exactly.
  if (plain(read) !== text) issues.push("read view does not reproduce the accepted text");
  if (plain(kjv) !== kjvText) issues.push("KJV view does not reproduce the KJV text");
  if (plain(inline) !== text) issues.push("diff view does not reproduce the accepted text");
  const dels = inline.filter((r) => r.c?.includes("del")).map((r) => r.t).join("|");
  const expDels = hunkInfo.filter((h) => h.kr[1] > h.kr[0]).map((h) => kjvText.slice(h.kr[0], h.kr[1])).join("|");
  if (dels !== expDels) issues.push("diff view deletions do not match the alignment");
  return { runs: { read, kjv, inline }, issues };
}

function inlineOnly(kjvText: string, text: string): Run[] {
  const K = tokenize(kjvText), U = tokenize(text);
  const hs = mergeClose(hunks(K, U, align(K, U)), K, U);
  const layers: Layer[] = [], markers: Marker[] = [];
  for (const h of hs) {
    const ur: [number, number] = h.b[0] < h.b[1] ? [U[h.b[0]].start, U[h.b[1] - 1].end] : [h.b[0] < U.length ? U[h.b[0]].start : text.length, 0];
    if (h.b[0] < h.b[1]) layers.push({ start: ur[0], end: ur[1], cls: "ins" });
    if (h.a[0] < h.a[1]) markers.push({ at: ur[0], m: "pl", before: kjvText.slice(K[h.a[0]].start, K[h.a[1] - 1].end), cls: "del" });
  }
  return buildRuns(text, layers, markers);
}


/** Merge diff regions separated by a single shared token, so "robbery" -> "something to grasp" reads as one change. */
function mergeClose(hs: { a: [number, number]; b: [number, number] }[], A?: { norm: string }[], B?: { norm: string }[]) {
  const out: { a: [number, number]; b: [number, number] }[] = [];
  for (const h of hs) {
    const p = out[out.length - 1];
    if (p && h.a[0] - p.a[1] <= 1 && h.b[0] - p.b[1] <= 1) { p.a = [p.a[0], h.a[1]]; p.b = [p.b[0], h.b[1]]; }
    else out.push({ a: [...h.a] as [number, number], b: [...h.b] as [number, number] });
  }
  // Trim tokens shared at both ends of a merged region ("robbery to" -> "something to grasp to" becomes "robbery" -> "something to grasp").
  if (A && B) for (const h of out) {
    while (h.a[1] > h.a[0] && h.b[1] > h.b[0] && A[h.a[1] - 1].norm === B[h.b[1] - 1].norm) { h.a[1]--; h.b[1]--; }
    while (h.a[1] > h.a[0] && h.b[1] > h.b[0] && A[h.a[0]].norm === B[h.b[0]].norm) { h.a[0]++; h.b[0]++; }
  }
  return out.filter((h) => h.a[1] > h.a[0] || h.b[1] > h.b[0]);
}

const latestBy = <T>(xs: T[], key: (x: T) => string) => [...new Map(xs.map((x) => [key(x), x])).values()];

export function buildViewerData(store: Store, source: Map<string, SourceVerse>) {
  const accepted: Record<string, any> = existsSync(store.path("accepted.json")) ? readJson(store.path("accepted.json")) : {};
  const decisions = store.all("decisions");
  const reviews = store.all("reviews");
  const escal = store.all("escalations");
  const candidatesAll = store.all("candidates");
  const lookupsAll = store.all("lookups");
  const events = store.all("events").filter((e) => e.type === "agent_call");
  const glossaryFile = existsSync(store.path("glossary.json")) ? readJson(store.path("glossary.json")) : { entries: [] };

  // Latest decision per batch (human resolutions come after the coordinator's).
  const decisionOf = new Map<string, any>();
  for (const d of decisions) decisionOf.set(d.batch_id, d);
  // Latest escalation state per escalation id.
  const escById = latestBy(escal, (e: any) => e.id);
  const openEsc = escById.filter((e: any) => e.status === "open");

  const verses: any[] = [];
  const issuesAll: { verse: string; issue: string }[] = [];
  const ordered = Object.values(accepted).sort((a: any, b: any) => {
    const [, ca, va] = a.id.split("."), [, cb, vb] = b.id.split(".");
    return +ca - +cb || +va - +vb;
  });
  const usedLookups = new Set<string>();
  for (const v of ordered as any[]) {
    const src = source.get(v.id);
    if (!src) continue;
    const built = buildVerse(src.text, src.italics, v);
    built.issues.forEach((i) => issuesAll.push({ verse: v.id, issue: i }));
    for (const c of v.changes ?? []) for (const e of c.evidence ?? []) usedLookups.add(e.lookup_id);
    const [, ch, vs] = v.id.split(".");
    verses.push({
      id: v.id, ref: ref(v.id), ch: +ch, v: +vs, status: v.status, batch: v.batch_id, decision: v.decision_id,
      runs: built.runs, issues: built.issues,
      changes: (v.changes ?? []).map((c: any) => ({ id: c.id, kjv: c.kjv.text, update: c.update.text, category: c.category, reason: c.reason, glossary_id: c.glossary_id, auto: !!c.auto, uncertain: !!c.uncertain, evidence: c.evidence ?? [] })),
    });
  }

  const batches: Record<string, any> = {};
  for (const bid of new Set(verses.map((v) => v.batch))) {
    const d = decisionOf.get(bid);
    const verseIds = verses.filter((v) => v.batch === bid).map((v) => v.id);
    const cands = latestBy(candidatesAll.filter((c) => c.batch_id === bid), (c: any) => c.id);
    const winnerAuthor = d?.winner ? cands.find((c: any) => c.id === d.winner)?.author : null;
    // Final round per reviewer
    const revs: any[] = [];
    for (const reviewer of ["reviewer-scorer", "reviewer-meaning-auditor"]) {
      const rs = reviews.filter((r) => r.batch_id === bid && r.reviewer === reviewer);
      // Only reviews from the run that produced the current decision: take the last round-1 and its following round-2.
      const lastR1 = rs.map((r, i) => [r, i] as const).filter(([r]) => r.round === 1).pop();
      if (!lastR1) continue;
      const after = rs.slice(lastR1[1]);
      const final = after.filter((r) => r.round === 2).pop() ?? lastR1[0];
      const byCand: Record<string, any> = {};
      for (const c of final.candidates ?? []) {
        const id = final.label_map?.[c.label];
        if (!id) continue;
        const s = c.scores;
        const w = s && ["S1", "S2", "S3", "S4"].every((k) => typeof s[k] === "number") ? +((s.S1 * 0.4 + s.S2 * 0.3 + s.S3 * 0.2 + s.S4 * 0.1) / 5).toFixed(3) : null;
        byCand[id] = { gates: c.gates, scores: s ?? null, weighted: w, notes: c.gate_notes ?? [], comments: c.change_comments ?? [] };
      }
      revs.push({ reviewer, round: final.round, id: final.id, summary: final.summary, candidates: byCand });
    }
    const candidates = cands.filter((c: any) => c.author !== "coordinator" || c.id === d?.winner).map((c: any) => ({
      id: c.id, author: c.author, eligible: d?.eligible?.includes(c.id) ?? null, passed_checks: c.eligible ?? null,
      verses: Object.fromEntries(c.verses.filter((x: any) => verseIds.includes(x.id)).map((x: any) => [x.id, { text: x.text, runs: inlineOnly(source.get(x.id)!.text, x.text) }])),
    }));
    const esc = openEsc.filter((e: any) => e.batch_id === bid && e.trigger !== "glossary_conflict").pop()
      ?? escById.filter((e: any) => e.batch_id === bid && e.status === "resolved" && e.trigger !== "glossary_conflict").pop() ?? null;
    batches[bid] = {
      id: bid, verses: verseIds,
      decision: d ? { id: d.id, outcome: d.outcome, winner: d.winner, winner_author: winnerAuthor, decided_by: d.decided_by, confidence: d.confidence, rationale: d.rationale, debate: d.debate, eligible: d.eligible, supersedes: d.supersedes ?? null, at: d.at } : null,
      reviews: revs, candidates,
      escalation: esc ? { id: esc.id, status: esc.status, trigger: esc.trigger, question: esc.question, options: esc.options ?? [], recommended: esc.recommended_candidate ?? esc.recommendation ?? null, resolved_by: esc.resolved_by ?? null, resolution: esc.resolution ?? null } : null,
    };
  }

  const lookups: Record<string, any> = {};
  for (const l of lookupsAll) if (usedLookups.has(l.lookup_id)) {
    const r: any = l.result;
    const summary = r?.omitted ? r.omitted
      : r?.words ? r.words.map((w: any) => `${w.surface} ${w.strongs} "${w.lemma_gloss}"`).join(" · ")
      : r?.results ? r.results.map((x: any) => `${x.verse_id}: ${x.kjv}`).slice(0, 4).join("\n")
      : r?.definition ? `${r.lemma} (${r.strongs}): ${r.definition}` : JSON.stringify(r).slice(0, 400);
    lookups[l.lookup_id] = { agent: l.agent, query: l.query, summary: String(summary).slice(0, 900) };
  }

  const glossary = (glossaryFile.entries ?? []).filter((e: any) => e.status !== "proposed" || (e.uses ?? 0) > 0)
    .map((e: any) => ({ id: e.id, kjv_form: e.kjv_form, forms: e.forms ?? [], sense: e.sense, update: e.update, category: e.category, status: e.status, uses: e.uses ?? 0, examples: e.examples ?? [], notes: e.notes ?? "", seed: e.created_in === "seed" }))
    .sort((a: any, b: any) => a.kjv_form.localeCompare(b.kjv_form));

  const spend = events.reduce((s, e) => s + (e.cost_usd ?? 0), 0);
  const wins: Record<string, number> = {};
  for (const b of Object.values(batches)) {
    const k = b.escalation?.status === "open" ? "pending human" : b.decision?.decided_by && b.decision.decided_by !== "coordinator" ? "human editor" : b.decision?.outcome === "merge" ? "merge" : (b.decision?.winner_author ?? "unknown").replace("translator-", "");
    wins[k] = (wins[k] ?? 0) + 1;
  }
  const books = [...new Set(verses.map((v) => v.id.split(".")[0]))];
  // Decisions: for each escalated passage, the real choices, grouped by the wording they produce.
  const notesPath = store.path("escalation-notes.json");
  const notes: Record<string, any> = existsSync(notesPath) ? readJson(notesPath) : {};
  const decisionsOut: any[] = [];
  for (const b of Object.values(batches) as any[]) {
    if (!b.escalation) continue;
    const e = b.escalation;
    const rawEsc = escById.find((x: any) => x.id === e.id) ?? {};
    const cands = b.candidates as any[];
    const mech = cands.find((c) => c.author === "mechanical");
    const textOf = (c: any, vid: string) => c.verses[vid]?.text;
    const affected = b.verses.filter((vid: string) => new Set(cands.map((c) => textOf(c, vid)).filter(Boolean)).size > 1);
    const shown = affected.length ? affected : b.verses.slice(0, 1);
    const nPre = notes[b.id] ?? {};
    const mentioned = b.verses.filter((vid: string) => String(e.question ?? "").includes(vid));
    const rawPre: any = escById.find((x: any) => x.id === e.id) ?? {};
    const focus: string[] = (nPre.focus ?? rawPre.focus_verses ?? (mentioned.length ? mentioned : shown)).filter((vid: string) => shown.includes(vid));
    const groups = new Map<string, any[]>();
    for (const c of cands) {
      if (!shown.every((vid: string) => textOf(c, vid))) continue;
      const key = shown.map((vid: string) => textOf(c, vid)).join("\u0001");
      groups.set(key, [...(groups.get(key) ?? []), c]);
    }
    const reviewVerdict = (ids: string[]) => {
      const fails: string[] = [];
      for (const r of b.reviews) for (const id of ids) {
        const x = r.candidates[id];
        if (x && (x.gates?.G1 === "fail" || x.gates?.G2 === "fail")) fails.push(r.reviewer === "reviewer-scorer" ? "scorer" : "auditor");
      }
      return [...new Set(fails)];
    };
    const options = [...groups.values()].map((members) => {
      const ids = members.map((c) => c.id);
      const verses: Record<string, any> = {};
      const pairs: { from: string; to: string; verse: string }[] = [];
      for (const vid of shown) {
        const text = textOf(members[0], vid);
        const base = mech ? textOf(mech, vid) : source.get(vid)!.text;
        const A = tokenize(base), B = tokenize(text);
        const hs = mergeClose(hunks(A, B, align(A, B)), A, B);
        const vp = hs.map((h) => ({
          from: h.a[0] < h.a[1] ? base.slice(A[h.a[0]].start, A[h.a[1] - 1].end) : "",
          to: h.b[0] < h.b[1] ? text.slice(B[h.b[0]].start, B[h.b[1] - 1].end) : "",
        }));
        pairs.push(...vp.map((x) => ({ ...x, verse: vid })));
        verses[vid] = { text, runs: inlineOnly(source.get(vid)!.text, text), changes: vp };
      }
      const recommended = ids.includes(e.recommended);
      const eligible = members.some((c) => c.eligible);
      const choose = recommended ? e.recommended : (members.find((c) => c.eligible) ?? members[0]).id;
      const failNotes: { reviewer: string; note: string }[] = [];
      for (const r of b.reviews) for (const id of ids) {
        const x = r.candidates[id];
        if (!x || !(x.gates?.G1 === "fail" || x.gates?.G2 === "fail")) continue;
        for (const note of (x.notes ?? []).filter((t: string) => !/copied from|taken from the check report/i.test(t)).slice(0, 3))
          failNotes.push({ reviewer: r.reviewer === "reviewer-scorer" ? "scorer" : "auditor", note: note.slice(0, 420) });
      }
      return {
        ids, choose, authors: members.map((c) => c.author), recommended, eligible, failed_checks: members.every((c) => c.passed_checks === false),
        review_fails: reviewVerdict(ids), fail_notes: failNotes.slice(0, 4),
        focus_changes: pairs.filter((x) => focus.includes(x.verse)), other_changes: pairs.filter((x) => !focus.includes(x.verse)),
        keeps_kjv: pairs.filter((x) => focus.includes(x.verse)).length === 0, verses,
      };
    }).sort((x, y) => Number(y.recommended) - Number(x.recommended) || Number(y.eligible) - Number(x.eligible) || Number(y.keeps_kjv) - Number(x.keeps_kjv));
    const n = notes[b.id] ?? {};
    const first = b.verses[0], last = b.verses[b.verses.length - 1];
    const [, c1, v1] = first.split("."), [, , v2] = last.split(".");
    const sv = shown.map((x: string) => x.split(".")[2]);
    decisionsOut.push({
      batch: b.id, status: e.status, resolved_by: e.resolved_by, resolution: e.resolution,
      passage: `${USFM_NAME.get(first.split(".")[0])} ${c1}:${v1}${v2 !== v1 ? "–" + v2 : ""}`,
      focus: `${c1}:${sv.length > 1 ? sv[0] + "–" + sv[sv.length - 1] : sv[0]}`,
      verses: shown, focus_verses: focus, question: n.question ?? rawEsc.plain_question ?? e.question, context: n.context ?? rawEsc.context ?? "",
      why: n.why ?? "", rerun: n.rerun ?? "", technical: e.question, trigger: e.trigger, options,
    });
  }
  decisionsOut.sort((a, b) => a.batch.localeCompare(b.batch, undefined, { numeric: true }));

  return {
    decisions: decisionsOut,
    run: {
      id: store.state.run_id, generated: new Date().toISOString(), spend_usd: +spend.toFixed(3),
      verses: verses.length, accepted: verses.filter((v) => v.status === "accepted").length, pending: verses.filter((v) => v.status !== "accepted").length,
      batches: Object.keys(batches).length, debated: Object.values(batches).filter((b: any) => b.decision?.debate?.ran).length,
      open_escalations: openEsc.filter((e: any) => e.trigger !== "glossary_conflict").length, glossary_conflicts: openEsc.filter((e: any) => e.trigger === "glossary_conflict").length,
      changes: verses.reduce((s, v) => s + v.changes.filter((c: any) => !c.auto).length, 0), mechanical: verses.reduce((s, v) => s + v.changes.filter((c: any) => c.auto).length, 0),
      wins, verification: { checked: verses.length, issues: issuesAll },
    },
    book: books.map((b) => USFM_NAME.get(b) ?? b).join(", "),
    chapters: [...new Set(verses.map((v) => v.ch))],
    verses, batches, glossary, lookups,
  };
}

/** Write the run's viewer data (viewer-data.json) and its verification next to the record. */
export function writeViewer(store: Store, source: Map<string, SourceVerse>): { path: string; issues: number; data: ReturnType<typeof buildViewerData> } {
  const data = buildViewerData(store, source);
  const path = store.path("viewer-data.json");
  writeFileSync(path, JSON.stringify(data) + "\n");
  writeFileSync(store.path("viewer-verification.json"), JSON.stringify(data.run.verification, null, 2));
  return { path, issues: data.run.verification.issues.length, data };
}

interface ManifestBook { code: string; book: string; run: string; file: string; verses: number; edits: number; generated: string }

/** Copy a run's viewer data into the web app's data folder, one file per book, and update its manifest. */
export function exportViewer(store: Store, source: Map<string, SourceVerse>, outDir: string): { file: string; issues: number } {
  const { data, issues } = writeViewer(store, source);
  const code = data.verses[0]?.id.split(".")[0];
  if (!code) throw new Error("run has no accepted verses to export");
  mkdirSync(outDir, { recursive: true });
  const file = `${code}.json`;
  writeFileSync(join(outDir, file), JSON.stringify(data) + "\n");
  const manifestPath = join(outDir, "index.json");
  const manifest: { books: ManifestBook[] } = existsSync(manifestPath) ? readJson(manifestPath) : { books: [] };
  const entry: ManifestBook = {
    code, book: data.book, run: data.run.id, file, verses: data.verses.length,
    edits: data.verses.reduce((n: number, v: any) => n + v.changes.filter((c: any) => !c.auto).length, 0), generated: data.run.generated,
  };
  manifest.books = [...manifest.books.filter((b) => b.code !== code), entry];
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  return { file: join(outDir, file), issues };
}
