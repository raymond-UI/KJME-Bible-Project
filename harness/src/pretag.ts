// Stage 1: pretag tokens and build the mechanical draft (PIPELINE.md, stage 1).
import { tokenize, matchCase, replaceTokens, type Token } from "./text.js";
import type { Glossary } from "./glossary.js";
import type { SourceVerse, Span } from "./source.js";

export interface PretagItem {
  i: number; start: number; end: number; text: string;
  tag: "pronoun" | "verb_form" | "locked" | "escalate_only" | "glossary";
  number?: "sg" | "pl" | null; mark?: boolean; mandatory_update?: string | null; glossary_id?: string | null;
}
export interface PronounMark { start: number; end: number; number: "sg" | "pl" }
export interface PretaggedVerse extends SourceVerse {
  tokens: Token[];
  pretag: PretagItem[];
  small_caps: Span[];
  mechanical: { text: string; pronoun_marks: PronounMark[] };
  warnings: string[];
}

export interface Tables {
  pronouns: { kjv: string; number: "sg" | "pl"; update: string; when?: string; mark?: boolean }[];
  verbs_second_singular: Record<string, string>;
  verbs_third_singular: Record<string, string>;
  suffix_stoplist: string[];
}
export interface Locked {
  locked: { term: string; forms?: string[] }[];
  escalate_only: { term: string; verses?: string[] }[];
}

const THINE_STANDALONE_NEXT = new Set(["and", "or", "but", "is", "are", "was", "were", "be", "shall", "will", "o", "for", "in", "of", "to", "that", "which", "as"]);

function phraseHits(tokens: Token[], phrase: string): [number, number][] {
  const p = tokenize(phrase).map((t) => t.norm);
  const out: [number, number][] = [];
  for (let i = 0; i + p.length <= tokens.length; i++)
    if (p.every((w, k) => tokens[i + k].norm === w)) out.push([i, i + p.length]);
  return out;
}

export function pretagVerse(v: SourceVerse, tables: Tables, locked: Locked, glossary: Glossary): PretaggedVerse {
  const tokens = tokenize(v.text);
  const pretag: PretagItem[] = [];
  const warnings: string[] = [];
  const repl = new Map<number, string>();
  const stop = new Set(tables.suffix_stoplist.map((s) => s.toLowerCase()));
  const hasThou = tokens.some((t) => t.norm === "thou" || t.norm === "thee");
  const pron = new Map(tables.pronouns.map((p) => [p.kjv, p]));

  tokens.forEach((t, i) => {
    if (!t.word) return;
    // Pronouns
    if (pron.has(t.norm)) {
      let p = pron.get(t.norm)!;
      if (t.norm === "thine") {
        const next = tokens[i + 1];
        const standalone = !next || !next.word || THINE_STANDALONE_NEXT.has(next.norm);
        p = tables.pronouns.find((x) => x.kjv === "thine" && (standalone ? x.update === "yours" : x.update === "your")) ?? p;
      }
      pretag.push({ i, start: t.start, end: t.end, text: t.text, tag: "pronoun", number: p.number, mark: p.mark !== false, mandatory_update: p.update });
      if (p.update.toLowerCase() !== t.norm) repl.set(i, matchCase(t.text, p.update));
      return;
    }
    // Verb forms from tables
    const vf = tables.verbs_second_singular[t.norm] ?? tables.verbs_third_singular[t.norm];
    if (vf) {
      pretag.push({ i, start: t.start, end: t.end, text: t.text, tag: "verb_form", number: null, mandatory_update: vf });
      repl.set(i, matchCase(t.text, vf));
      return;
    }
    // Untabled -eth / -est forms: flag for the agents
    if (t.norm.length > 4 && !stop.has(t.norm) && !/^[A-Z]/.test(t.text.slice(1)) &&
        (t.norm.endsWith("eth") || (hasThou && (t.norm.endsWith("est") || t.norm.endsWith("edst"))))) {
      if (!(i === 0 || /[.?!]/.test(tokens[i - 1]?.text ?? "")) || t.text[0] === t.text[0].toLowerCase())
        pretag.push({ i, start: t.start, end: t.end, text: t.text, tag: "verb_form", number: null, mandatory_update: null });
    }
  });

  for (const l of locked.locked) for (const f of [l.term, ...(l.forms ?? [])])
    for (const [a, b] of phraseHits(tokens, f)) {
      // Locked terms are case-sensitive for divine names (LORD vs Lord vs lord)
      if (f === f.toUpperCase() && tokens.slice(a, b).some((t) => t.text !== t.text.toUpperCase())) continue;
      pretag.push({ i: a, start: tokens[a].start, end: tokens[b - 1].end, text: v.text.slice(tokens[a].start, tokens[b - 1].end), tag: "locked" });
    }
  for (const e of locked.escalate_only) {
    if (e.verses && !e.verses.includes(v.id)) continue;
    for (const [a, b] of phraseHits(tokens, e.term))
      pretag.push({ i: a, start: tokens[a].start, end: tokens[b - 1].end, text: v.text.slice(tokens[a].start, tokens[b - 1].end), tag: "escalate_only" });
  }
  for (const g of glossary.relevant([v.text]))
    for (const f of glossary.formsOf(g))
      for (const [a, b] of phraseHits(tokens, f)) {
        if (g.exceptions?.includes(v.id)) continue;
        pretag.push({ i: a, start: tokens[a].start, end: tokens[b - 1].end, text: v.text.slice(tokens[a].start, tokens[b - 1].end), tag: "glossary", glossary_id: g.id });
      }

  const small_caps: Span[] = tokens.filter((t) => t.text === "LORD" || t.text === "GOD").map((t) => ({ start: t.start, end: t.end }));

  const mechText = replaceTokens(v.text, tokens, repl);
  const mechTokens = tokenize(mechText);
  if (mechTokens.length !== tokens.length) warnings.push("mechanical draft changed token count; check tables");
  const pronoun_marks: PronounMark[] = pretag
    .filter((p) => p.tag === "pronoun" && p.mark && p.number)
    .map((p) => ({ start: mechTokens[p.i].start, end: mechTokens[p.i].end, number: p.number! }));

  return { ...v, tokens, pretag, small_caps, mechanical: { text: mechText, pronoun_marks }, warnings };
}

/** C11: compare KJV pronoun number counts with Greek second-person morphology. Warning only. */
export function c11(v: PretaggedVerse, counts: { sg: number; pl: number } | null): string | null {
  if (!counts) return null;
  const sg = v.pretag.filter((p) => p.tag === "pronoun" && p.number === "sg").length;
  const pl = v.pretag.filter((p) => p.tag === "pronoun" && p.number === "pl").length;
  if ((sg > 0 && counts.sg === 0 && counts.pl > 0) || (pl > 0 && counts.pl === 0 && counts.sg > 0))
    return `C11: KJV pronouns sg=${sg} pl=${pl}, Greek 2nd person sg=${counts.sg} pl=${counts.pl}`;
  return null;
}
