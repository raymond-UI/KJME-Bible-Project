// Glossary pre-pass, the human part: render a word's survey for reading, write a sense template to fill in, and
// check and import the filled-in templates into the shared glossary. One KJV form can carry several senses
// ("let" = allow, and "let" = hinder); each sense is its own glossary entry, with `applies_when` saying which
// uses it covers, so the translators pick the entry by context rather than by spelling.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tokenize } from "./text.js";
import type { SourceVerse } from "./source.js";
import type { Glossary, GlossaryEntry } from "./glossary.js";
import type { Cluster, Occurrence, WordSurvey } from "./survey.js";

const CATEGORIES = new Set(["pronoun_sg", "pronoun_pl", "verb_form", "archaic_word", "shifted_meaning", "syntax", "spelling", "punctuation"]);

export interface Sense {
  id: string; sense: string; update: string; category: string; applies_when?: string; not_when?: string;
  examples?: string[]; exceptions?: string[]; notes?: string;
}
export interface SenseFile { kjv_form: string; forms?: string[]; senses: Sense[]; reviewed: boolean; reviewer?: string }

// ---------- reading ----------

const line = (o: Occurrence) => `- ${o.id}: ${o.kwic}`;
const clusterBlock = (title: string, cs: Cluster[]) =>
  [`### ${title}`, "", ...cs.flatMap((c) => [`- **${c.neighbour}** × ${c.count}`, ...c.examples.map((o) => `  ${line(o)}`)]), ""];

/** The survey of one word as Markdown, for a person deciding its senses. */
export function renderWord(s: WordSurvey): string {
  const wb = s.word_book.flatMap((e) => [
    `**${e.headword}**${e.pos ? `, ${e.pos}` : ""}: ${e.text}`, "",
    ...(e.cited.length ? ["Verses the Word-Book cites for this sense:", ...e.cited.map(line)] : []),
    ...(e.cited_missing.length ? [`Cited but the form is not in the verse (OCR or a different form): ${e.cited_missing.join(", ")}`] : []), "",
  ]);
  const existing = s.existing.map((g) => `- \`${g.id}\` (${g.status}): ${g.sense} → **${g.update}**${g.applies_when ? `; applies when ${g.applies_when}` : ""}`);
  return [
    `# ${s.kjv_form}`, "",
    `Forms: ${s.forms.join(", ")}. ${s.count} uses in ${s.books} books (OT ${s.ot}, NT ${s.nt}).`, "",
    "## Bible Word-Book (1884)", "", ...(wb.length ? wb : ["(no entry)", ""]),
    "## Webster (1828)", "", ...(s.webster.length ? s.webster.map((t) => `- ${t}`) : ["(no entry)"]), "",
    "## Glossary now", "", ...(existing.length ? existing : ["(none)"]), "",
    "## Uses by neighbouring word", "", ...clusterBlock("Word after", s.after), ...clusterBlock("Word before", s.before),
    "## Sample across the Bible", "", ...s.sample.map(line), "",
  ].join("\n");
}

/** A sense file to fill in: the existing entries, plus one blank sense to fill in or delete, so every word is
 * checked for a second sense (`let` = allow beside `let` = hinder). */
export function template(s: WordSurvey): SenseFile {
  const fromGlossary = s.existing.filter((g) => g.status !== "rejected").map((g): Sense => ({
    id: g.id, sense: g.sense, update: g.update, category: g.category, applies_when: g.applies_when ?? "", not_when: g.not_when ?? "",
    examples: g.examples ?? [], exceptions: g.exceptions ?? [], notes: g.notes ?? "",
  }));
  const blank: Sense = { id: `g-${s.kjv_form.replace(/[^a-z]+/g, "-")}-${fromGlossary.length + 1}`, sense: "", update: "KEEP", category: "archaic_word", applies_when: "", not_when: "", examples: [], exceptions: [], notes: "" };
  return { kjv_form: s.kjv_form, forms: s.forms.filter((f) => f !== s.kjv_form), senses: [...fromGlossary, blank], reviewed: false };
}

// ---------- checking ----------

function hasForm(text: string, forms: string[]): boolean {
  const ts = tokenize(text).map((t) => t.norm);
  return forms.some((f) => { const p = tokenize(f).map((t) => t.norm); return ts.some((_, i) => p.every((w, k) => ts[i + k] === w)); });
}

/** Field errors in one sense. */
function fieldErrors(x: Sense, many: boolean): string[] {
  const rules: [boolean, string][] = [
    [!/^g-[a-z0-9-]+$/.test(x.id ?? ""), `bad id "${x.id}" (use g-<word>-<label>)`],
    [!x.sense?.trim(), `${x.id}: sense is empty`],
    [!x.update?.trim(), `${x.id}: update is empty (KEEP to keep the word)`],
    [!CATEGORIES.has(x.category), `${x.id}: category "${x.category}" is not one of ${[...CATEGORIES].join(", ")}`],
    [many && !x.applies_when?.trim(), `${x.id}: applies_when is required when a form has more than one sense`],
  ];
  return rules.flatMap(([bad, msg]) => (bad ? [msg] : []));
}

/** Pinned verses that do not exist or do not contain the form. */
function verseErrors(x: Sense, forms: string[], source: Map<string, SourceVerse>): string[] {
  return [...(x.examples ?? []), ...(x.exceptions ?? [])].flatMap((v) => {
    const sv = source.get(v);
    if (!sv) return [`${x.id}: ${v} is not a verse id (e.g. GEN.1.1)`];
    return hasForm(sv.text, forms) ? [] : [`${x.id}: ${v} does not contain ${forms.join("/")}`];
  });
}

/** Everything wrong with a sense file; empty when it can be imported. */
export function checkSenseFile(f: SenseFile, source: Map<string, SourceVerse>, otherIds: Set<string> = new Set()): string[] {
  if (!f.kjv_form?.trim()) return ["kjv_form is empty"];
  if (!Array.isArray(f.senses) || !f.senses.length) return [`${f.kjv_form}: no senses`];
  const forms = [f.kjv_form, ...(f.forms ?? [])];
  const many = f.senses.length > 1;
  const errs = f.senses.flatMap((x) => [...fieldErrors(x, many), ...verseErrors(x, forms, source)]);
  const ids = f.senses.map((x) => x.id);
  for (const id of new Set(ids.filter((id, i) => ids.indexOf(id) !== i))) errs.push(`${id}: id used twice`);
  for (const id of ids.filter((id) => otherIds.has(id))) errs.push(`${id}: id already belongs to another form`);
  const pinned = f.senses.flatMap((x) => (x.examples ?? []).map((v) => [v, x.id] as const));
  for (const [v, id] of pinned) {
    const other = pinned.find(([w, j]) => w === v && j !== id);
    if (other && id < other[1]) errs.push(`${v} is an example of both ${id} and ${other[1]}: a verse pins one sense`);
  }
  return errs.map((e) => `${f.kjv_form}: ${e}`);
}

// ---------- importing ----------

const sameForm = (e: GlossaryEntry, form: string) => e.kjv_form.toLowerCase() === form.toLowerCase();

/** Mark the form's active entries that the file drops as rejected. Returns their ids. */
function supersede(g: Glossary, f: SenseFile): string[] {
  const keep = new Set(f.senses.map((x) => x.id));
  return g.entries.filter((e) => sameForm(e, f.kjv_form) && !keep.has(e.id) && e.status !== "rejected").map((e) => {
    e.status = "rejected";
    e.notes = [e.notes, "superseded by the glossary pre-pass"].filter(Boolean).join("; ");
    return e.id;
  });
}

/** A sense as a ratified glossary entry, keeping an existing entry's use count and origin. */
export function senseEntry(f: SenseFile, x: Sense, old: Partial<GlossaryEntry> = {}, reviewer?: string): GlossaryEntry {
  // Empty strings and lists in the template mean "not given".
  const given = Object.fromEntries(Object.entries({ ...x, forms: f.forms }).filter(([, v]) => v !== "" && !(Array.isArray(v) && !v.length)));
  const who = [f.reviewer, reviewer].find(Boolean);
  return {
    examples: [], exceptions: [], ...given, id: x.id, kjv_form: f.kjv_form, sense: x.sense, update: x.update, category: x.category,
    status: "ratified", uses: old.uses ?? 0, created_in: old.created_in ?? "pre-pass", ratified_by: who ? `human:${who}` : "human",
  };
}

/** Load reviewed sense files into the glossary as ratified entries. A reviewed file replaces the form's entries:
 * ids it keeps are updated in place, and active entries it drops are marked rejected (kept for the record). */
export function importSenses(g: Glossary, files: SenseFile[], source: Map<string, SourceVerse>, reviewer?: string):
  { imported: string[]; rejected: string[]; skipped: string[]; errors: string[] } {
  const out = { imported: [] as string[], rejected: [] as string[], skipped: files.filter((f) => !f.reviewed).map((f) => f.kjv_form), errors: [] as string[] };
  for (const f of files.filter((f) => f.reviewed)) {
    const others = new Set(g.entries.filter((e) => !sameForm(e, f.kjv_form)).map((e) => e.id));
    const errs = checkSenseFile(f, source, others);
    out.errors.push(...errs);
    if (errs.length) continue;
    out.rejected.push(...supersede(g, f));
    for (const x of f.senses) {
      const old = g.get(x.id), entry = senseEntry(f, x, old, reviewer);
      if (old) Object.assign(old, entry); else g.entries.push(entry);
      out.imported.push(x.id);
    }
  }
  if (out.imported.length || out.rejected.length) { g.version++; g.save(); }
  return out;
}

// ---------- files ----------

const fileName = (w: string) => w.replace(/[^a-z]+/g, "-");

/** Write the survey to `out`: index.md, <word>.md each, and senses/<word>.json templates (never overwriting one). */
export function writeSurvey(out: string, surveys: WordSurvey[], total: number): void {
  mkdirSync(join(out, "senses"), { recursive: true });
  const rows = surveys.map((s) => {
    const file = fileName(s.kjv_form), tpl = join(out, "senses", `${file}.json`);
    writeFileSync(join(out, `${file}.md`), renderWord(s));
    if (!existsSync(tpl)) writeFileSync(tpl, JSON.stringify(template(s), null, 2) + "\n");
    return `| [${s.kjv_form}](${file}.md) | ${s.count} | ${s.books} | ${s.word_book.reduce((n, e) => n + e.cited.length, 0)} | ${s.existing.map((g) => g.id).join(", ")} |`;
  });
  writeFileSync(join(out, "index.md"), [`# Glossary survey`, "",
    `${surveys.length} of ${total} candidates, those with the most Word-Book citations first. Fill in senses/<word>.json, set "reviewed": true, then run glossary-import.`, "",
    "| word | uses | books | verses the Word-Book cites | glossary now |", "|---|---|---|---|---|", ...rows, ""].join("\n"));
}

/** Every sense file in a directory. */
export function readSenseFiles(dir: string): SenseFile[] {
  return readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
}
