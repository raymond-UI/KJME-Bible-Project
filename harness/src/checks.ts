// Materialize agent output into a full candidate (offsets, pronoun marks, italics, mechanical change log)
// and run the deterministic checks (checks/CHECKS.md). Agents give text + changes; code computes the rest.
import { align, hunks, locate, spanOf, tokenize, words, type Token } from "./text.js";
import type { PretaggedVerse, PronounMark, Tables } from "./pretag.js";
import type { Glossary, GlossaryEntry } from "./glossary.js";
import type { Span } from "./source.js";

export interface RawChange {
  kjv: string; update: string; category: string; reason: string;
  glossary_id?: string | null; uncertain?: boolean; evidence?: { lookup_id: string; note: string }[]; source?: string;
}
export interface RawVerse { id: string; text: string; changes: RawChange[] }
export interface Change {
  id: string; verse_id: string; kjv: { start: number; end: number; text: string }; update: { start: number; end: number; text: string };
  category: string; reason: string; glossary_id: string | null; uncertain: boolean;
  evidence: { lookup_id: string; note: string }[]; auto: boolean; source?: string;
}
export interface CandVerse { id: string; text: string; pronoun_marks: PronounMark[]; italics: Span[]; changes: Change[] }
export interface Candidate {
  id: string; batch_id: string; author: string; attempt: number; verses: CandVerse[];
  glossary_proposals: any[]; notes: string; eligible?: boolean;
}
export interface CheckResult { check: string; severity: "hard" | "warning"; passed: boolean; verse_id: string | null; detail: string }
export interface CheckReport {
  candidate_id: string; passed: boolean; results: CheckResult[];
  metrics: { change_count: number; optional_change_count: number; word_delta: number; chars_changed_ratio: number };
}

const YOU = new Set(["you", "your", "yours"]);
const NUMBER_WORDS = new Set("one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty hundred thousand".split(" "));

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = new Array(b.length + 1).fill(0).map((_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]; prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

type GlossaryTag = { i: number; text: string; g: GlossaryEntry };

/** Active glossary tags grouped by the KJV words they cover: several entries on one word are its senses. */
function glossaryGroups(pretag: PretaggedVerse["pretag"], glossary: Glossary): GlossaryTag[][] {
  const groups = new Map<string, GlossaryTag[]>();
  for (const p of pretag) {
    const g = p.tag === "glossary" ? glossary.get(p.glossary_id!) : undefined;
    if (!g || !(g.status === "ratified" || g.status === "provisional")) continue;
    const k = `${p.i}:${p.text.toLowerCase()}`;
    groups.set(k, [...(groups.get(k) ?? []), { i: p.i, text: p.text, g }]);
  }
  return [...groups.values()];
}

/** C6 for one word: a hard failure if an entry pins this verse and is not followed; a warning if no sense is followed. */
export function glossaryVerdict(group: GlossaryTag[], verseId: string, text: string, kept: (i: number) => boolean): { hard: boolean; detail: string } | null {
  const lower = text.toLowerCase();
  const followed = (t: GlossaryTag) => t.g.update === "KEEP" ? kept(t.i) : lower.includes(t.g.update.toLowerCase());
  const pinned = group.filter((t) => (t.g.examples ?? []).includes(verseId));
  if (pinned.length && !pinned.some(followed)) {
    const g = pinned[0]!.g;
    return { hard: true, detail: `glossary ${g.id} pins "${g.kjv_form}" -> "${g.update}" in this verse` };
  }
  if (group.some(followed)) return null;
  const senses = group.map((t) => `${t.g.id} ("${t.g.update}")`).join(" or ");
  return { hard: false, detail: `"${group[0]!.text}" not rendered per ${senses}; reviewers judge the sense` };
}

export function materialize(
  raw: { verses: RawVerse[]; glossary_proposals?: any[]; notes?: string },
  meta: { id: string; batch_id: string; author: string; attempt: number },
  verses: PretaggedVerse[], tables: Tables, glossary: Glossary,
): { candidate: Candidate; report: CheckReport } {
  const results: CheckResult[] = [];
  const fail = (check: string, verse_id: string | null, detail: string) => results.push({ check, severity: "hard", passed: false, verse_id, detail });
  const warn = (check: string, verse_id: string | null, detail: string) => results.push({ check, severity: "warning", passed: false, verse_id, detail });
  const archaic = new Set([...tables.pronouns.filter((p) => p.update !== p.kjv).map((p) => p.kjv),
    ...Object.keys(tables.verbs_second_singular), ...Object.keys(tables.verbs_third_singular)]);

  // C1: verse ids present and in order
  const ids = verses.map((v) => v.id), got = (raw.verses ?? []).map((v) => v.id);
  if (JSON.stringify(ids) !== JSON.stringify(got)) fail("C1", null, `verse ids ${JSON.stringify(got)} do not match batch ${JSON.stringify(ids)}`);

  let n = 0, agentChanges = 0, optional = 0, wordDelta = 0, lev = 0, kjvLen = 0;
  const out: CandVerse[] = [];
  for (const v of verses) {
    const rv = raw.verses?.find((x) => x.id === v.id);
    if (!rv) { out.push({ id: v.id, text: v.text, pronoun_marks: [], italics: [], changes: [] }); continue; }
    const text = rv.text.trim();
    const K = v.tokens, M = tokenize(v.mechanical.text), U = tokenize(text);
    const al = align(M, U);
    const hs = hunks(M, U, al);
    const coverA = new Set<number>(), coverB = new Set<number>();
    const changes: Change[] = [];
    const ranges: { a: [number, number]; b: [number, number]; c: Change }[] = [];

    // Agent changes: locate KJV side in KJV tokens (or mechanical), update side in the update text.
    for (const rc of rv.changes ?? []) {
      const nearA = 0;
      let a = locate(K, rc.kjv, nearA, coverA) ?? locate(M, rc.kjv, nearA, coverA);
      const estB = a ? (al.aToB.slice(0, a[0]).filter((x) => x >= 0).pop() ?? -1) + 1 : 0;
      let b = rc.update.trim() === "" ? ([estB, estB] as [number, number]) : locate(U, rc.update, estB, coverB);
      if (!a) { fail("C2", v.id, `change kjv text "${rc.kjv}" not found in the KJV verse`); continue; }
      if (!b) { fail("C2", v.id, `change update text "${rc.update}" not found in the updated verse`); continue; }
      for (let i = a[0]; i < a[1]; i++) coverA.add(i);
      for (let j = b[0]; j < b[1]; j++) coverB.add(j);
      const c: Change = {
        id: `c${++n}`, verse_id: v.id,
        kjv: { ...spanOf(K, a), text: v.text.slice(spanOf(K, a).start, spanOf(K, a).end) },
        update: { ...spanOf(U, b), text: text.slice(spanOf(U, b).start, spanOf(U, b).end) },
        category: rc.category, reason: rc.reason, glossary_id: rc.glossary_id ?? null, uncertain: !!rc.uncertain,
        evidence: rc.evidence ?? [], auto: false, source: rc.source,
      };
      changes.push(c); ranges.push({ a, b, c }); agentChanges++;
      const g = c.glossary_id ? glossary.get(c.glossary_id) : undefined;
      if (!g || !(g.examples ?? []).includes(v.id)) optional++;
      // C7: additions
      if (words(rc.update) > Math.max(2, 2 * words(rc.kjv))) warn("C7", v.id, `change "${rc.kjv}" -> "${rc.update}" adds words; reason must justify (R9)`);
    }

    // C2: every hunk covered
    for (const h of hs) {
      const missA = [...Array(h.a[1] - h.a[0]).keys()].map((k) => h.a[0] + k).filter((i) => !coverA.has(i));
      const missB = [...Array(h.b[1] - h.b[0]).keys()].map((k) => h.b[0] + k).filter((j) => !coverB.has(j));
      if (missA.length || missB.length) {
        const ka = missA.map((i) => M[i].text).join(" "), ub = missB.map((j) => U[j].text).join(" ");
        fail("C2", v.id, `unlogged edit: "${ka}" -> "${ub}"`);
      }
    }

    // Mechanical changes, logged by code (pronouns and table verb forms that survive into the text).
    for (const p of v.pretag) {
      if (!(p.tag === "pronoun" || p.tag === "verb_form") || !p.mandatory_update) continue;
      if (K[p.i].norm === M[p.i].norm) continue;
      const j = al.aToB[p.i];
      if (j < 0 || coverA.has(p.i)) continue;
      changes.push({
        id: `c${++n}`, verse_id: v.id, kjv: { start: K[p.i].start, end: K[p.i].end, text: K[p.i].text },
        update: { start: U[j].start, end: U[j].end, text: U[j].text },
        category: p.tag === "pronoun" ? (p.number === "pl" ? "pronoun_pl" : "pronoun_sg") : "verb_form",
        reason: p.tag === "pronoun" ? "Mechanical update (R1)" : "Mechanical update (R2)",
        glossary_id: null, uncertain: false, evidence: [], auto: true,
      });
    }
    changes.sort((x, y) => x.kjv.start - y.kjv.start);

    // C4: no archaic table forms left in the text
    for (const t of U) if (archaic.has(t.norm) && !(t.norm === "you" || t.norm === "your" || t.norm === "yours"))
      fail("C4", v.id, `archaic form "${t.text}" remains (R1/R2)`);

    // C3: pronoun marks from pretag number, through the alignment
    const marks: PronounMark[] = [];
    const marked = new Set<number>();
    const prons = v.pretag.filter((p) => p.tag === "pronoun" && p.mark && p.number);
    const inHunk = new Map<number, number>(); // kjv token -> hunk index
    hs.forEach((h, hi) => { for (let i = h.a[0]; i < h.a[1]; i++) inHunk.set(i, hi); });
    for (const p of prons) {
      const j = al.aToB[p.i];
      if (j >= 0 && YOU.has(U[j].norm)) { marks.push({ start: U[j].start, end: U[j].end, number: p.number! }); marked.add(j); }
    }
    hs.forEach((h, hi) => {
      const ps = prons.filter((p) => inHunk.get(p.i) === hi);
      const ys = [...Array(h.b[1] - h.b[0]).keys()].map((k) => h.b[0] + k).filter((j) => YOU.has(U[j].norm));
      if (ps.length === ys.length) ps.forEach((p, k) => { marks.push({ start: U[ys[k]].start, end: U[ys[k]].end, number: p.number! }); marked.add(ys[k]); });
      else if (ps.length || ys.length) fail("C3", v.id, `pronoun count changed in "${M.slice(h.a[0], h.a[1]).map((t) => t.text).join(" ")}" -> "${U.slice(h.b[0], h.b[1]).map((t) => t.text).join(" ")}" (G2)`);
    });
    U.forEach((t, j) => { if (YOU.has(t.norm) && !marked.has(j)) fail("C3", v.id, `"${t.text}" at position ${t.start} has no number from the KJV (G2)`); });
    marks.sort((x, y) => x.start - y.start);

    // C5: locked terms untouched; escalate_only changes flagged
    for (const p of v.pretag.filter((p) => p.tag === "locked")) {
      const len = tokenize(p.text).length;
      for (let i = p.i; i < p.i + len; i++) {
        const j = al.aToB[i];
        if (j >= 0 && U[j].text === K[i].text) continue;
        const hi = inHunk.get(i);
        const bText = hi !== undefined ? U.slice(hs[hi].b[0], hs[hi].b[1]).map((t) => t.text) : [];
        if (!bText.includes(K[i].text)) fail("C5", v.id, `locked term "${K[i].text}" changed (R7)`);
      }
    }
    for (const p of v.pretag.filter((p) => p.tag === "escalate_only")) {
      const touched = ranges.filter((r) => r.a[0] <= p.i && p.i < r.a[1]);
      for (const r of touched) if (!r.c.uncertain) fail("C5", v.id, `change to escalate-only term "${p.text}" must set uncertain: true (R7)`);
    }

    // C6: glossary compliance. Entries for the same KJV word are its senses: the rendering needs to follow one of them.
    for (const group of glossaryGroups(v.pretag, glossary)) {
      const r = glossaryVerdict(group, v.id, text, (i) => al.aToB[i] >= 0);
      if (r) (r.hard ? fail : warn)("C6", v.id, r.detail);
    }

    // C8: italics carried through alignment or inherited by the replacing change
    const italics: Span[] = [];
    for (const s of v.italics) {
      const ti = K.map((t, i) => [t, i] as [Token, number]).filter(([t]) => t.start >= s.start && t.end <= s.end).map(([, i]) => i);
      if (ti.length === 0) continue;
      const allAligned = ti.every((i) => al.aToB[i] >= 0);
      if (allAligned) { italics.push({ start: U[al.aToB[ti[0]]].start, end: U[al.aToB[ti[ti.length - 1]]].end }); continue; }
      const r = ranges.find((r) => ti.every((i) => r.a[0] <= i && i < r.a[1]) || (r.a[0] >= ti[0] && r.a[1] <= ti[ti.length - 1] + 1));
      if (r && r.b[1] > r.b[0]) italics.push(spanOf(U, r.b));
      else if (!r) warn("C8", v.id, `italic words "${v.text.slice(s.start, s.end)}" partly changed; italics not carried`);
    }

    // C9: names and numbers
    K.forEach((t, i) => {
      if (!t.word) return;
      const sentenceStart = i === 0 || /[.?!:;]/.test(K[i - 1].text) || K[i - 1].text === "(";
      const isName = /^[A-Z]/.test(t.text) && !sentenceStart && !["I", "O"].includes(t.text) &&
        !v.pretag.some((p) => p.i === i && (p.tag === "pronoun" || p.tag === "verb_form"));
      const isNum = /^\d+$/.test(t.text) || NUMBER_WORDS.has(t.norm);
      if (!isName && !isNum) return;
      const j = al.aToB[i];
      if (j >= 0 && U[j].text === t.text) return;
      if (isNum && v.pretag.some((p) => p.tag === "glossary" && p.i === i)) return;
      const hi = inHunk.get(i);
      const bText = hi !== undefined ? U.slice(hs[hi].b[0], hs[hi].b[1]).map((x) => x.text) : [];
      if (!bText.includes(t.text)) fail("C9", v.id, `${isNum ? "number" : "name"} "${t.text}" changed`);
    });

    wordDelta += words(text) - words(v.text);
    lev += levenshtein(v.text, text);
    kjvLen += v.text.length;
    out.push({ id: v.id, text, pronoun_marks: marks, italics, changes });
  }

  const candidate: Candidate = {
    ...meta, verses: out, glossary_proposals: raw.glossary_proposals ?? [], notes: raw.notes ?? "",
  };
  const report: CheckReport = {
    candidate_id: meta.id,
    passed: !results.some((r) => r.severity === "hard" && !r.passed),
    results,
    metrics: {
      change_count: out.reduce((s, v) => s + v.changes.length, 0), optional_change_count: optional,
      word_delta: wordDelta, chars_changed_ratio: kjvLen ? +(lev / kjvLen).toFixed(4) : 0,
    },
  };
  void agentChanges;
  return { candidate, report };
}

/** Raw form of the mechanical draft, as candidate M. */
export function mechanicalRaw(verses: PretaggedVerse[]): { verses: RawVerse[] } {
  return { verses: verses.map((v) => ({ id: v.id, text: v.mechanical.text, changes: [] })) };
}

/** Normalized (kjv, update) key, for checking that merged changes exist in some source. */
export function changeKey(kjv: string, update: string): string {
  const n = (s: string) => tokenize(s).map((t) => t.norm).join(" ");
  return `${n(kjv)}=>${n(update)}`;
}
