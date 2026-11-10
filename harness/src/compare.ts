// Blind comparison of two runs' text (scripts/blind-compare.ts): loading each run's text, pairing passages,
// building the judge's prompt, unblinding replies and tallying verdicts. The script only calls the judge.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface V { id: string; ref: string; batch: string; status: string; kjv: string }
export interface RunText { verses: V[]; text: Map<string, { t: string; pending: boolean }>; run: string }
export interface Job { batch: string; vs: V[]; order: "AB" | "BA" }

const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const jsonl = (p: string): any[] => existsSync(p) ? readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];

/** The recommended candidate's text for a verse with no saved text (records from before saved provisional text). */
function recommendedText(dir: string, v: V): string {
  const cands = new Map(jsonl(join(dir, "record", "candidates.jsonl")).map((c) => [c.id, c]));
  const rec = new Map(jsonl(join(dir, "record", "escalations.jsonl")).filter((e) => e.recommended_candidate).map((e) => [e.batch_id, e.recommended_candidate]));
  const cv = cands.get(rec.get(v.batch))?.verses?.find((x: any) => x.id === v.id);
  if (!cv) throw new Error(`${dir}: no text for ${v.id}`);
  return cv.text;
}

/** A run's text per verse: its saved text (accepted, or pending a human), else the recommended candidate's text. */
export function loadRun(dir: string): RunText {
  const vd = readJson(join(dir, "viewer-data.json"));
  const acc = existsSync(join(dir, "accepted.json")) ? readJson(join(dir, "accepted.json")) : {};
  const verses: V[] = vd.verses.map((v: any) => ({ id: v.id, ref: v.ref, batch: v.batch, status: v.status, kjv: v.runs.kjv.map((r: any) => r.t).join("") }));
  const text = new Map(verses.map((v) => [v.id, acc[v.id]?.text
    ? { t: acc[v.id].text as string, pending: acc[v.id].status !== "accepted" }
    : { t: recommendedText(dir, v), pending: true }]));
  return { verses, text, run: vd.run?.id ?? vd.run?.run_id ?? dir };
}

/** Passages by batch; identical passages are not judged, the rest are judged in both orders. */
export function pairJobs(a: RunText, b: RunText): { byBatch: Map<string, V[]>; jobs: Job[]; identical: string[] } {
  const byBatch = new Map<string, V[]>();
  for (const v of a.verses) byBatch.set(v.batch, [...(byBatch.get(v.batch) ?? []), v]);
  const jobs: Job[] = [], identical: string[] = [];
  for (const [batch, vs] of byBatch) {
    if (vs.every((v) => a.text.get(v.id)!.t === b.text.get(v.id)!.t)) identical.push(batch);
    else jobs.push({ batch, vs, order: "AB" }, { batch, vs, order: "BA" });
  }
  return { byBatch, jobs, identical };
}

/** The judge's user message: the KJV and the two texts, by verse reference. */
export function prompt(vs: V[], x: (v: V) => string, y: (v: V) => string): string {
  const lines = (f: (v: V) => string) => vs.map((v) => `${v.ref.replace(/^\S+ /, "")} ${f(v)}`).join("\n");
  return `<kjv>\n${lines((v) => v.kjv)}\n</kjv>\n\n<text_x>\n${lines(x)}\n</text_x>\n\n<text_y>\n${lines(y)}\n</text_y>`;
}

/** The JSON object in a judge's reply, fenced or not. */
export function parseReply(body: string): any {
  const t = body.replace(/^```(json)?\s*|\s*```$/g, "");
  return JSON.parse(t.slice(t.indexOf("{"), t.lastIndexOf("}") + 1));
}

/** Map a reply's X/Y labels back to runs A/B for the order it was judged in. */
export function unblind(j: Job, json: any) {
  const to = (l: string) => (l === "X" ? j.order[0] : l === "Y" ? j.order[1] : l);
  const side = (k: "X" | "Y") => ({ scores: json.scores?.[k], errors: json.errors?.[k] ?? [] });
  const [x, y] = [side("X"), side("Y")];
  return {
    batch: j.batch, order: j.order, preference: to(json.preference), strength: json.strength, reason: json.reason,
    scores: { [to("X")]: x.scores, [to("Y")]: y.scores }, errors: { [to("X")]: x.errors, [to("Y")]: y.errors },
    differences: (json.differences ?? []).map((d: any) => ({ verse: d.verse, [to("X")]: d.x, [to("Y")]: d.y, better: to(d.better), why: d.why })),
  };
}
export type Result = ReturnType<typeof unblind>;

/** Verdicts per passage (a side wins only when both orders agree), mean scores and errors per order. */
export function tally(results: Result[], jobs: Job[], pending: (batch: string) => boolean) {
  const verdicts: Record<string, number> = { A: 0, B: 0, tie: 0, split: 0 };
  const passages = [...new Set(jobs.map((j) => j.batch))].map((batch) => {
    const [r1, r2] = (["AB", "BA"] as const).map((o) => results.find((r) => r.batch === batch && r.order === o)!);
    const verdict = r1.preference === r2.preference ? r1.preference : "split";
    verdicts[verdict] = (verdicts[verdict] ?? 0) + 1;
    return { batch, verdict, AB: r1.preference, BA: r2.preference, pending: pending(batch) };
  });
  const mean = (side: string, k: string) => {
    const s = results.map((r) => r.scores[side]?.[k]).filter((n): n is number => typeof n === "number");
    return s.length ? +(s.reduce((x, y) => x + y, 0) / s.length).toFixed(2) : null;
  };
  const scores = Object.fromEntries(["A", "B"].map((s) => [s, {
    fidelity: mean(s, "fidelity"), clarity: mean(s, "clarity"), restraint: mean(s, "restraint"),
    errors_per_order: results.reduce((n, r) => n + (r.errors[s]?.length ?? 0), 0) / 2,
  }]));
  return { verdicts, scores, passages: passages.sort((p, q) => p.batch.localeCompare(q.batch)) };
}
