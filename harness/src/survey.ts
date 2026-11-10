// Glossary pre-pass, with no model calls. For each candidate KJV word: how often it occurs, its uses grouped by the
// words around it, the verses the Bible Word-Book cites for the archaic sense, the dictionary entries, and any
// glossary entries already made. A human reads this and writes one ruling per sense, each with the context it applies
// in (`applies_when`); `importSenses` checks those rulings and loads them into the shared glossary.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tokenize } from "./text.js";
import type { SourceVerse } from "./source.js";
import type { Dictionary } from "./dictionaries.js";
import type { GlossaryEntry } from "./glossary.js";

// ---------- Word-Book references ----------

const WB_BOOKS: Record<string, string> = {
  gen: "GEN", ex: "EXO", exod: "EXO", lev: "LEV", num: "NUM", deut: "DEU", josh: "JOS", judg: "JDG", ruth: "RUT",
  sam: "SA", k: "KI", kings: "KI", chr: "CH", chron: "CH", ezr: "EZR", ezra: "EZR", neh: "NEH", esth: "EST", job: "JOB",
  ps: "PSA", prov: "PRO", eccl: "ECC", eccles: "ECC", cant: "SNG", song: "SNG", is: "ISA", isai: "ISA", jer: "JER", lam: "LAM",
  ez: "EZK", ezek: "EZK", dan: "DAN", hos: "HOS", joel: "JOL", am: "AMO", amos: "AMO", obad: "OBA", jon: "JON", jonah: "JON",
  mic: "MIC", nah: "NAM", hab: "HAB", zeph: "ZEP", hag: "HAG", zech: "ZEC", mal: "MAL", matt: "MAT", mark: "MRK", luke: "LUK",
  john: "JHN", acts: "ACT", rom: "ROM", cor: "CO", gal: "GAL", eph: "EPH", phil: "PHP", col: "COL", thess: "TH", tim: "TI",
  tit: "TIT", titus: "TIT", philem: "PHM", heb: "HEB", jas: "JAS", james: "JAS", pet: "PE", jude: "JUD", rev: "REV",
};
const NUMBERED = new Set(["SA", "KI", "CH", "CO", "TH", "TI", "PE"]);

/** A roman numeral as OCR gives it ("xiii", "1" or "l" for i). */
function roman(s: string): number {
  const v: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };
  const t = s.toLowerCase().replace(/1/g, "i");
  if (t === "l") return 1;
  let n = 0;
  for (let k = 0; k < t.length; k++) { const a = v[t[k]!] ?? 0, b = v[t[k + 1]!] ?? 0; n += a < b ? -a : a; }
  return n;
}
const num = (s: string) => Number(s.replace(/[Il]/g, "1"));

function bookOf(pre: string | undefined, abbr: string): string | null {
  const b = WB_BOOKS[abbr.toLowerCase()];
  if (!b) return null;
  if (abbr.toLowerCase() === "john" && pre) return `${num(pre.replace(/i/g, "1"))}JN`;
  if (!NUMBERED.has(b)) return b;
  return pre ? `${num(pre.replace(/i/g, "1"))}${b}` : null;
}

const SEG_BOOK = /^(?:([123iIl])\s+)?([A-Z][a-z]+)\.?\s+([ivxlcI1]+)\.\s*([\dIl]+)/;
const SEG_CHAPTER = /^([ivxlc]+)\.\s*([\dIl]+)/;
const SEG_VERSE = /^([\dIl]+)\b/;

/** Verse ids from a Word-Book reference list ("Ps. xviii. 5, cxix. 148; 1 Thess. iv. 15, &c"). Apocrypha and unreadable parts are skipped. */
export function wordBookRefs(refs: string): string[] {
  const out: string[] = [];
  let book: string | null = null, ch = 0;
  for (const seg of refs.split(/[;,]/).map((s) => s.trim())) {
    const b = SEG_BOOK.exec(seg), c = b ? null : SEG_CHAPTER.exec(seg), v = b || c ? null : SEG_VERSE.exec(seg);
    if (b) { book = bookOf(b[1], b[2]!); ch = roman(b[3]!); out.push(...(book ? [`${book}.${ch}.${num(b[4]!)}`] : [])); }
    else if (c && book) { ch = roman(c[1]!); out.push(`${book}.${ch}.${num(c[2]!)}`); }
    else if (v && book && ch) out.push(`${book}.${ch}.${num(v[1]!)}`);
  }
  return out;
}

// ---------- occurrences and contexts ----------

export interface Occurrence { id: string; i: number; len: number; kwic: string }

/** Every whole-token match of the forms in the KJV, with a few words either side. */
export function occurrences(source: Map<string, SourceVerse>, forms: string[]): Occurrence[] {
  const pats = forms.map((f) => tokenize(f).map((t) => t.norm));
  const out: Occurrence[] = [];
  for (const v of source.values()) {
    const ts = tokenize(v.text).filter((t) => t.word);
    for (let i = 0; i < ts.length; i++) {
      const p = pats.find((p) => p.every((w, k) => ts[i + k]?.norm === w));
      if (!p) continue;
      const a = ts[Math.max(0, i - 6)]!, z = ts[Math.min(ts.length - 1, i + p.length + 5)]!;
      out.push({ id: v.id, i, len: p.length, kwic: `${a === ts[0] ? "" : "… "}${v.text.slice(a.start, z.end)}${z === ts.at(-1) ? "" : " …"}` });
    }
  }
  return out;
}

export interface Cluster { neighbour: string; count: number; examples: Occurrence[] }

/** Uses grouped by the word just before or just after: the cheapest sign of distinct senses ("let us" against "let him go"). */
export function clusters(source: Map<string, SourceVerse>, occ: Occurrence[], side: "before" | "after", top = 8): Cluster[] {
  const groups = new Map<string, Occurrence[]>();
  for (const o of occ) {
    const ts = tokenize(source.get(o.id)!.text).filter((t) => t.word);
    const n = ts[side === "before" ? o.i - 1 : o.i + o.len]?.norm ?? "(none)";
    groups.set(n, [...(groups.get(n) ?? []), o]);
  }
  return [...groups].map(([neighbour, os]) => ({ neighbour, count: os.length, examples: spread(os, 2) }))
    .sort((x, y) => y.count - x.count || x.neighbour.localeCompare(y.neighbour)).slice(0, top);
}

/** `n` items spread evenly through a list, so samples cover the whole Bible rather than Genesis. */
export function spread<T>(xs: T[], n: number): T[] {
  if (xs.length <= n) return xs;
  return Array.from({ length: n }, (_, k) => xs[Math.floor((k * xs.length) / n)]!);
}

// ---------- forms ----------

/** Every word in the KJV, with its count. */
export function vocabulary(source: Map<string, SourceVerse>): Map<string, number> {
  const vocab = new Map<string, number>();
  for (const v of source.values()) for (const t of tokenize(v.text)) if (t.word) vocab.set(t.norm, (vocab.get(t.norm) ?? 0) + 1);
  return vocab;
}

const SUFFIXES = ["s", "ed", "eth", "est", "ing"];

/** Regular 1611 inflections of a word, built forward (so "war" never yields "wares"): -s/-es, -ed, -eth, -est, -ing,
 * with final -e dropped (love: loved, loveth), -y to -i (occupy: occupied, occupieth) and a short word's last
 * consonant doubled (let: letteth). Irregular forms (spake, brought) are not guessed; add them to `forms` by hand. */
export function inflections(form: string): string[] {
  if (form.includes(" ")) return [];
  const stems: [string, string[]][] = [[form, SUFFIXES]];
  if (/(s|x|z|ch|sh)$/.test(form)) stems.push([form, ["es"]]);
  if (form.endsWith("e")) stems.push([form.slice(0, -1), ["ed", "eth", "est", "ing"]], [form, ["d", "st", "th"]]);
  if (/[^aeiou]y$/.test(form)) stems.push([`${form.slice(0, -1)}i`, ["ed", "eth", "est", "es", "ers"]]);
  if (/^[^aeiou]*[aeiou][^aeiouwxy]$/.test(form)) stems.push([form + form.at(-1), ["ed", "eth", "est", "ing"]]);
  return [...new Set(stems.flatMap(([st, sx]) => sx.map((x) => st + x)))].filter((w) => w !== form);
}

// ---------- the survey ----------

export interface WordSurvey {
  kjv_form: string; forms: string[]; count: number; books: number; ot: number; nt: number;
  word_book: { headword: string; pos: string; text: string; cited: Occurrence[]; cited_missing: string[] }[];
  webster: string[]; existing: GlossaryEntry[]; after: Cluster[]; before: Cluster[]; sample: Occurrence[];
}

export interface SurveyInput {
  source: Map<string, SourceVerse>; vocab: Map<string, number>; wordBook: Dictionary; webster: Dictionary; glossary: GlossaryEntry[]; nt: Set<string>;
}

const short = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)} [...]` : t);

export function surveyWord(form: string, extra: string[], inp: SurveyInput): WordSurvey {
  const existing = inp.glossary.filter((g) => g.kjv_form.toLowerCase() === form);
  const found = inflections(form).filter((w) => inp.vocab.has(w));
  const forms = [...new Set([form, ...found, ...extra, ...existing.flatMap((g) => g.forms ?? [])].map((f) => f.toLowerCase()))];
  const occ = occurrences(inp.source, forms);
  const byVerse = new Map(occ.map((o) => [o.id, o]));
  const word_book = (inp.wordBook[form] ?? []).map((e) => {
    const ids = e.refs ? wordBookRefs(e.refs) : [];
    return { headword: e.headword, pos: e.pos, text: short(e.text, 900), cited: ids.flatMap((id) => byVerse.get(id) ?? []), cited_missing: ids.filter((id) => !byVerse.has(id)) };
  });
  const books = new Set(occ.map((o) => o.id.split(".")[0]!));
  const nt = occ.filter((o) => inp.nt.has(o.id.split(".")[0]!)).length;
  return {
    kjv_form: form, forms, count: occ.length, books: books.size, ot: occ.length - nt, nt, word_book,
    webster: (inp.webster[form.replace(/[^a-z]/g, "")] ?? []).slice(0, 3).map((e) => short(e.text, 500)), existing,
    after: clusters(inp.source, occ, "after"), before: clusters(inp.source, occ, "before"), sample: spread(occ, 12),
  };
}

/** Everyday words the Word-Book covers only for a rare old use ("and" = if). Left out of the default list, since
 * their main sense needs no ruling; ask for one by name (--words and) to survey it. */
const COMMON = new Set(("a an and as at be but by do for from had has have he her him his i if in is it me my no not of on or our she " +
  "so that the their them then there they this to up us was we were what when which who will with ye you").split(" "));

/** Candidates: every Word-Book headword the KJV uses, and every form the glossary already has. Ranked by how many
 * verses the Word-Book cites for an old sense, then by frequency. */
export function candidates(inp: SurveyInput, min = 1): { form: string; count: number; cited: number }[] {
  const heads = Object.keys(inp.wordBook).filter((k) => !inp.wordBook[k]![0]!.within && !COMMON.has(k));
  const cited = (k: string) => (inp.wordBook[k] ?? []).reduce((n, e) => n + (e.refs ? wordBookRefs(e.refs).length : 0), 0);
  return [...new Set([...heads, ...inp.glossary.map((g) => g.kjv_form.toLowerCase())])]
    .map((form) => ({ form, count: form.includes(" ") ? occurrences(inp.source, [form]).length : inp.vocab.get(form) ?? 0, cited: cited(form) }))
    .filter((c) => c.count >= min).sort((a, b) => b.cited - a.cited || b.count - a.count || a.form.localeCompare(b.form));
}

/** The words to survey: a comma list given on the command line, else the `top` most frequent candidates. */
export function pickWords(words: unknown, all: { form: string }[], top: number): string[] {
  if (typeof words === "string") return words.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
  return all.slice(0, top).map((c) => c.form);
}

/** The parsed English 1611 dictionaries from reference/data/english (bun harness/scripts/fetch-english.ts). */
export function loadEnglish(dir: string): { wordBook: Dictionary; webster: Dictionary } {
  const read = (f: string): Dictionary => (existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), "utf8")) : {});
  const d = { wordBook: read("bible-word-book.json"), webster: read("webster-1828.json") };
  if (!Object.keys(d.wordBook).length) throw new Error(`English 1611 sources missing in ${dir}. Run: bash reference/fetch.sh`);
  return d;
}

type Opts = Record<string, string | boolean>;

/** glossary-survey options with their defaults; paths are relative (english to the repo, out to the harness). */
export function surveyArgs(opts: Opts, config: { reference?: { path?: string } }) {
  return {
    english: join(config.reference?.path ?? "reference/data", "english"), min: Number(opts.min ?? 1), top: Number(opts.top ?? 50),
    out: String(opts.out ?? "runs/glossary-survey"), words: opts.words,
  };
}

/** glossary-import options with their defaults: the senses directory (relative to the harness) and the reviewer's name. */
export function importArgs(opts: Opts): { dir: string; reviewer?: string } {
  return { dir: String(opts.dir ?? "runs/glossary-survey/senses"), ...(typeof opts.by === "string" ? { reviewer: opts.by } : {}) };
}
