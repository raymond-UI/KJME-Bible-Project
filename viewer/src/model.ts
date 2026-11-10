// Review model: groups identical edits so one check covers every place, and orders them into tiers.
import type { Change, GlossaryEntry, PassageDecision, Verse, ViewerData } from "./types";

export type Tier = "meaning" | "words" | "rule";
export type Color = "meaning" | "archaic" | "minor";
export type View = "clean" | "track" | "split" | "kjv";

const CAT: Record<string, string> = {
  shifted_meaning: "Meaning shift", archaic_word: "Archaic word", syntax: "Sentence structure", spelling: "Spelling",
  verb_form: "Verb form", pronoun_sg: "Pronoun", pronoun_pl: "Pronoun", punctuation: "Punctuation",
};
const colorOf = (c: string): Color => (c === "shifted_meaning" ? "meaning" : c === "archaic_word" ? "archaic" : "minor");
const ROUTINE = new Set(["pronoun_sg", "pronoun_pl", "verb_form", "spelling", "punctuation"]);
export const TIERS: [Tier, string][] = [["meaning", "Meaning"], ["words", "Word swaps"], ["rule", "By rule"]];
export const TIERHELP: Record<Tier, string> = {
  meaning: "A modern reader would take the old word the wrong way. Check the new word keeps the 1611 sense.",
  words: "Old words swapped for current ones. Check each reads naturally.",
  rule: "Repeated changes that follow a ratified glossary rule or a routine form. One check covers every place.",
};
const NAME: Record<string, string> = {
  "translator-minimalist": "Minimalist", "translator-clarity": "Clarity", "translator-cadence": "Cadence", mechanical: "Routine updates only",
  coordinator: "Coordinator", "reviewer-scorer": "Scorer", "reviewer-meaning-auditor": "Auditor",
};
export const who = (a: string | null | undefined) => (a ? NAME[a] ?? a : "");
export const letter = (i: number) => String.fromCharCode(65 + i);

export const VIEWS: [View, string, string][] = [["clean", "Edited", "Edited"], ["track", "Track changes", "Track"], ["split", "Side by side", "Split"], ["kjv", "Original", "KJV"]];
export const VDESC: Record<View, string> = { clean: "The updated text", track: "Every change against the KJV", split: "KJV and KJME in two columns", kjv: "The KJV 1769 as it stands" };

export interface Item { key: string; v: Verse; c: Change; group: string }
export interface Group { key: string; tier: Tier; items: Item[]; c: Change; cat: string; color: Color; gloss: GlossaryEntry | null }
export interface DecisionItem { key: string; d: PassageDecision }

export interface Model {
  byId: Map<string, Verse>;
  gloss: Map<string, GlossaryEntry>;
  items: Item[];
  itemBy: Map<string, Item>;
  groups: Group[];
  groupBy: Map<string, Group>;
  /** Groups in review order: meaning, then word swaps, then by rule. */
  ordered: Group[];
  decs: DecisionItem[];
  decBy: Map<string, DecisionItem>;
}

/** Which check a change belongs to: routine forms and ratified rules are one check each; other edits group by wording. */
function classify(c: Change, g: GlossaryEntry | null): { key: string; tier: Tier } {
  if (ROUTINE.has(c.category)) return { key: "routine", tier: "rule" };
  if (g?.status === "ratified") return { key: "g:" + g.id, tier: "rule" };
  return { key: "p:" + c.kjv.toLowerCase() + "|" + c.update.toLowerCase(), tier: c.category === "shifted_meaning" ? "meaning" : "words" };
}

function groupChanges(verses: Verse[], gloss: Map<string, GlossaryEntry>) {
  const items: Item[] = [], itemBy = new Map<string, Item>(), groups: Group[] = [], groupBy = new Map<string, Group>();
  const add = (v: Verse, c: Change) => {
    const g = (c.glossary_id && gloss.get(c.glossary_id)) || null;
    const { key, tier } = classify(c, g);
    let gr = groupBy.get(key);
    if (!gr) { gr = { key, tier, items: [], c, cat: c.category, color: colorOf(c.category), gloss: g }; groupBy.set(key, gr); groups.push(gr); }
    const it: Item = { key: v.id + "|" + c.id, v, c, group: key };
    gr.items.push(it); items.push(it); itemBy.set(it.key, it);
  };
  for (const v of verses) for (const c of v.changes) if (!c.auto) add(v, c);
  const routine = groupBy.get("routine");
  if (routine) { routine.color = "minor"; routine.cat = "routine"; }
  return { items, itemBy, groups, groupBy };
}

export function buildModel(data: ViewerData): Model {
  const byId = new Map(data.verses.map((v) => [v.id, v]));
  const gloss = new Map(data.glossary.map((g) => [g.id, g]));
  const { items, itemBy, groups, groupBy } = groupChanges(data.verses, gloss);
  const ordered = TIERS.flatMap(([t]) => groups.filter((g) => g.tier === t));
  const decs = (data.decisions ?? []).map((d) => ({ key: "d|" + d.batch, d }));
  const decBy = new Map(decs.map((x) => [x.key, x]));
  return { byId, gloss, items, itemBy, groups, groupBy, ordered, decs, decBy };
}

export const groupLabel = (gr: Group) => (gr.key === "routine" ? "Routine forms" : CAT[gr.cat] ?? gr.cat);

/** Strip rule ids ("R4:", "(P1)") from a reason; the reader does not need them. Glossary ids stay, marked. */
export function cleanReason(s: string | null | undefined): { text: string; gid: boolean }[] {
  let t = String(s ?? "").replace(/\s*\((?:[RPG]\d+[^)]*)\)/g, "");
  t = t.replace(/^(?:[RPG]\d+(?:\s*(?:and|,|\/)\s*[RPG]\d+)*)(?:\s+and\s+(?:ratified\s+)?glossary(?:\s+entry)?\s+g-[\w-]+)?\s*:\s*/i, "");
  t = t.charAt(0).toUpperCase() + t.slice(1);
  const out: { text: string; gid: boolean }[] = [];
  let last = 0;
  for (const m of t.matchAll(/\bg-[a-z]+(?:-[a-z]+)+/g)) {
    if (m.index > last) out.push({ text: t.slice(last, m.index), gid: false });
    out.push({ text: m[0], gid: true });
    last = m.index + m[0].length;
  }
  if (last < t.length) out.push({ text: t.slice(last), gid: false });
  return out;
}

/** The canon, for the book switcher's "not run yet" list. */
export const CANON: [string, [string, string][]][] = ([
  ["OT", "GEN Genesis|EXO Exodus|LEV Leviticus|NUM Numbers|DEU Deuteronomy|JOS Joshua|JDG Judges|RUT Ruth|1SA 1 Samuel|2SA 2 Samuel|1KI 1 Kings|2KI 2 Kings|1CH 1 Chronicles|2CH 2 Chronicles|EZR Ezra|NEH Nehemiah|EST Esther|JOB Job|PSA Psalms|PRO Proverbs|ECC Ecclesiastes|SNG Song of Solomon|ISA Isaiah|JER Jeremiah|LAM Lamentations|EZK Ezekiel|DAN Daniel|HOS Hosea|JOL Joel|AMO Amos|OBA Obadiah|JON Jonah|MIC Micah|NAM Nahum|HAB Habakkuk|ZEP Zephaniah|HAG Haggai|ZEC Zechariah|MAL Malachi"],
  ["NT", "MAT Matthew|MRK Mark|LUK Luke|JHN John|ACT Acts|ROM Romans|1CO 1 Corinthians|2CO 2 Corinthians|GAL Galatians|EPH Ephesians|PHP Philippians|COL Colossians|1TH 1 Thessalonians|2TH 2 Thessalonians|1TI 1 Timothy|2TI 2 Timothy|TIT Titus|PHM Philemon|HEB Hebrews|JAS James|1PE 1 Peter|2PE 2 Peter|1JN 1 John|2JN 2 John|3JN 3 John|JUD Jude|REV Revelation"],
] as const).map(([t, s]) => [t, s.split("|").map((x) => [x.slice(0, 3), x.slice(4)] as [string, string])]);

export const bookName = (code: string, fallback?: string) => CANON.flatMap(([, bs]) => bs).find(([c]) => c === code)?.[1] ?? fallback ?? code;
