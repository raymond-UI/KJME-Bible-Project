// Provisional text for an escalated batch (PIPELINE.md, Escalation): keep the edits nobody disputes and
// hold only the disputed words at the mechanical draft, so one open question does not undo a whole batch.
import { materialize, type Candidate, type CandVerse, type Change, type CheckReport, type RawVerse } from "./checks.js";
import { tokenize } from "./text.js";
import type { PretaggedVerse, Tables } from "./pretag.js";
import type { Glossary } from "./glossary.js";

/** A word the escalation is about: a verse and the KJV wording in question. */
export interface Disputed { verse_id: string; kjv: string }
/** One change kept back from the provisional text, and why. */
export interface Held { verse_id: string; change_id: string; kjv: string; update: string; why: string }

/** A final-round review, deanonymized: per candidate id, its gates, gate notes and change comments. */
export interface FinalReview {
  reviewer: string;
  ranking: string[];
  candidates: Record<string, { gates?: Record<string, string>; gate_notes?: string[]; change_comments?: { change_id: string; verdict: string }[] }>;
}

export interface HoldInput {
  batchId: string;
  verses: PretaggedVerse[];
  pool: { c: Candidate; r: CheckReport }[];
  reviews: FinalReview[];
  recommendation?: string | null;
  disputed?: Disputed[];
  focus?: string[];
  question?: string;
  tables: Tables;
  glossary: Glossary;
}

const norm = (s: string) => tokenize(s).filter((t) => t.word).map((t) => t.norm).join(" ");
const mentions = (hay: string, needle: string) => {
  const h = norm(hay), n = norm(needle);
  return !!h && !!n && (` ${h} `.includes(` ${n} `) || ` ${n} `.includes(` ${h} `));
};
const touches = (c: Change, phrase: string) => mentions(c.kjv.text, phrase) || mentions(c.update.text, phrase);
const failedGate = (g: Record<string, string> | undefined) => Object.values(g ?? {}).includes("fail");
const quoted = (q: string) => [...q.matchAll(/['‘"“]([^'’"”]{2,60})['’"”]/g)].map((m) => m[1]!);
/**
 * A gate note in its documented form `<verse id>: <span>: rule`, with the span it names.
 * Quoted words name the span; an unquoted span longer than a phrase is prose and pins nothing.
 */
export function noteSpan(note: string): { verse_id: string; span: string } | null {
  const m = note.match(/^\s*([A-Z0-9]{3}\.\d+\.\d+)\s*:\s*([^:]+)/);
  if (!m) return null;
  const q = quoted(m[2]!);
  const span = q.length ? q.join(" → ") : m[2]!.trim();
  return q.length || span.split(/\s+/).length <= 6 ? { verse_id: m[1]!, span } : null;
}
/**
 * A gate note that records a failure: it must say it fails, not that it does not fail,
 * and not call itself "not a gate" or a "false positive".
 */
export function failingNote(note: string): { verse_id: string; span: string } | null {
  const says = /\bfail(s|ed)?\b/i.test(note), denies = /\b(not|never|n't)\s+(\w+\s+)?fail/i.test(note);
  return /not a gate|false positive/i.test(note) || !says || denies ? null : noteSpan(note);
}

/** The candidate to build on: the coordinator's pick if it is a checked translator candidate, else the reviewers' best. */
export function baseFor(inp: Pick<HoldInput, "pool" | "reviews" | "recommendation">): { c: Candidate; r: CheckReport } | null {
  const ok = inp.pool.filter((x) => x.r.passed && x.c.author !== "mechanical");
  const byId = new Map(ok.map((x) => [x.c.id, x]));
  const rec = inp.recommendation ? ok.find((x) => inp.recommendation!.includes(x.c.id)) : undefined;
  if (rec) return rec;
  for (const r of [...inp.reviews].sort((a) => (a.reviewer.includes("auditor") ? -1 : 1)))
    for (const id of r.ranking) if (byId.has(id)) return byId.get(id)!;
  return ok[0] ?? null;
}

/** What can hold a change: the disputed words, quoted words, reviewers' objections and failing gate notes. */
interface Grounds {
  disputed: Disputed[]; words: string[]; focus: Set<string>; objections: Map<string, string>;
  notes: { verse_id: string; span: string }[];
  /** A reviewer failed a gate and no note pins it to any span, even a kept word. */
  unpinned: boolean;
}
function grounds(base: Candidate, inp: HoldInput): Grounds {
  const disputed = inp.disputed ?? [];
  const failing = inp.reviews.filter((r) => failedGate(r.candidates[base.id]?.gates));
  const gateNotes = failing.flatMap((r) => r.candidates[base.id]?.gate_notes ?? []);
  // An `alternative` agrees the word must change and only offers other wording, so only `disagree` holds a change.
  const objections = new Map(inp.reviews.flatMap((r) => (r.candidates[base.id]?.change_comments ?? [])
    .filter((cc) => cc.verdict === "disagree").map((cc) => [cc.change_id, `${r.reviewer} disagrees`] as const)));
  return {
    disputed, objections, focus: new Set(inp.focus ?? []),
    // Old records have no `disputed` list: fall back to quoted words in the question, within the focus verses.
    words: disputed.length ? [] : quoted(inp.question ?? ""),
    notes: gateNotes.map(failingNote).filter((n) => n !== null),
    unpinned: failing.length > 0 && !gateNotes.some((n) => noteSpan(n)),
  };
}
const inFocus = (g: Grounds, vid: string) => !g.focus.size || g.focus.has(vid);
const asked = (g: Grounds, vid: string, c: Change) =>
  g.disputed.some((d) => d.verse_id === vid && touches(c, d.kjv)) || (inFocus(g, vid) && g.words.some((w) => touches(c, w)));
const named = (g: Grounds, vid: string, c: Change) =>
  g.notes.some((n) => n.verse_id === vid && n.span.split(/→|->|changed to/).some((part) => touches(c, part)));
function whyHeld(g: Grounds, vid: string, c: Change): string | null {
  if (c.uncertain) return "marked uncertain";
  if (asked(g, vid, c)) return "the question is about it";
  if (g.objections.has(c.id)) return g.objections.get(c.id)!;
  if (named(g, vid, c)) return "a reviewer failed a gate on it";
  return g.unpinned && inFocus(g, vid) ? "a reviewer failed a gate on this verse" : null;
}
const heldOf = (vid: string, c: Change, why: string): Held => ({ verse_id: vid, change_id: c.id, kjv: c.kjv.text, update: c.update.text, why });

/** Which of the base candidate's changes are disputed, and why. Mechanical changes are never held. */
export function heldChanges(base: Candidate, inp: HoldInput): Held[] {
  const g = grounds(base, inp);
  return base.verses.flatMap((v) => v.changes.filter((c) => !c.auto).flatMap((c) => {
    const why = whyHeld(g, v.id, c);
    return why ? [heldOf(v.id, c, why)] : [];
  }));
}

/** Undo some changes in one verse: each held update goes back to the mechanical draft's wording for that KJV span. */
export function revertVerse(v: CandVerse, pv: PretaggedVerse, held: Set<string>): RawVerse {
  const K = pv.tokens, M = tokenize(pv.mechanical.text);
  const mechOf = (c: Change) => {
    const i = K.findIndex((t) => t.end > c.kjv.start), j = K.findIndex((t) => t.start >= c.kjv.end);
    const a = i < 0 ? K.length : i, b = j < 0 ? K.length : j;
    return a < b && M.length === K.length ? pv.mechanical.text.slice(M[a]!.start, M[b - 1]!.end) : "";
  };
  let text = v.text;
  for (const c of [...v.changes].filter((c) => held.has(c.id)).sort((x, y) => y.update.start - x.update.start)) {
    const rep = mechOf(c);
    const before = text.slice(0, c.update.start), after = text.slice(c.update.end);
    const gap = !rep ? "" : c.update.start === c.update.end && before && !/\s$/.test(before) ? " " : "";
    text = (before + gap + rep + (c.update.start === c.update.end && rep && after && !/^\s/.test(after) ? " " : "") + after).replace(/ {2,}/g, " ");
  }
  const changes = v.changes.filter((c) => !c.auto && !held.has(c.id)).map((c) => ({
    kjv: c.kjv.text, update: c.update.text, category: c.category, reason: c.reason, glossary_id: c.glossary_id,
    uncertain: c.uncertain, evidence: c.evidence, ...(c.source ? { source: c.source } : {}),
  }));
  return { id: v.id, text: text.trim(), changes };
}

const mechRaw = (pv: PretaggedVerse): RawVerse => ({ id: pv.id, text: pv.mechanical.text, changes: [] });
/** Verses that fail a hard check; a check on the whole batch fails every verse. */
function failingVerses(r: CheckReport, verses: PretaggedVerse[]): Set<string> {
  const bad = r.results.filter((x) => x.severity === "hard" && !x.passed).map((x) => x.verse_id);
  return new Set(bad.includes(null) ? verses.map((v) => v.id) : (bad as string[]));
}

/** Build the provisional candidate. Verses that fail checks after holding fall back to the mechanical draft. */
export function provisional(inp: HoldInput): { candidate: Candidate; report: CheckReport; held: Held[]; base: string | null } {
  const meta = { id: `${inp.batchId}.provisional`, batch_id: inp.batchId, author: "provisional", attempt: 1 };
  const build = (raw: RawVerse[]) => materialize({ verses: raw }, meta, inp.verses, inp.tables, inp.glossary);
  const base = baseFor(inp);
  if (!base) return { ...build(inp.verses.map(mechRaw)), held: [], base: null };
  const held = heldChanges(base.c, inp);
  const raw = inp.verses.map((pv) => {
    const v = base.c.verses.find((x) => x.id === pv.id);
    return v ? revertVerse(v, pv, new Set(held.filter((h) => h.verse_id === pv.id).map((h) => h.change_id))) : mechRaw(pv);
  });
  let m = build(raw);
  if (!m.report.passed) {
    const bad = failingVerses(m.report, inp.verses);
    m = build(raw.map((rv, i) => (bad.has(rv.id) ? mechRaw(inp.verses[i]!) : rv)));
    const isHeld = (vid: string, c: Change) => held.some((h) => h.change_id === c.id && h.verse_id === vid);
    for (const v of base.c.verses.filter((v) => bad.has(v.id)))
      for (const c of v.changes.filter((c) => !c.auto && !isHeld(v.id, c))) held.push(heldOf(v.id, c, "the verse failed checks once the disputed words were held"));
  }
  m.candidate.notes = `Provisional text built on ${base.c.id}: ${held.length} change(s) held at the mechanical draft until a human decides.`;
  return { ...m, held, base: base.c.id };
}
