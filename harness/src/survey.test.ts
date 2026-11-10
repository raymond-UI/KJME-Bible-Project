import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { candidates, inflections, vocabulary, clusters, importArgs, loadEnglish, surveyArgs, occurrences, pickWords, spread, surveyWord, wordBookRefs, type SurveyInput } from "./survey.js";
import { checkSenseFile, importSenses, readSenseFiles, senseEntry, renderWord, template, writeSurvey, type SenseFile } from "./prepass.js";
import { Glossary, glossaryFile } from "./glossary.js";
import type { SourceVerse } from "./source.js";

const verse = (id: string, text: string): SourceVerse => {
  const [book, c, v] = id.split(".");
  return { id, book: book!, chapter: Number(c), verse: Number(v), text, italics: [], paragraph_start: false };
};
const source = new Map([
  verse("EXO.5.4", "Wherefore do ye, Moses and Aaron, let the people from their works?"),
  verse("GEN.1.26", "And God said, Let us make man in our image"),
  verse("GEN.1.3", "And God said, Let there be light: and there was light."),
  verse("ROM.1.13", "oftentimes I purposed to come unto you, (but was let hitherto,)"),
  verse("2TH.2.7", "only he who now letteth will let, until he be taken out of the way."),
  verse("MAT.11.15", "He that hath ears to hear, let him hear."),
].map((v) => [v.id, v]));

test("Word-Book references become verse ids, with OCR'd numerals and numbered books", () => {
  expect(wordBookRefs("Ex. v. 4; Num. xxii. 16 m; Is. xliii. 13; Rom. 1. 13; 2 Thess. ii. 7 ; Wisd. vii. 22"))
    .toEqual(["EXO.5.4", "NUM.22.16", "ISA.43.13", "ROM.1.13", "2TH.2.7"]);
  expect(wordBookRefs("Ps. xviii. 5, cxix. 148; 1 John iii. 2")).toEqual(["PSA.18.5", "PSA.119.148", "1JN.3.2"]);
  expect(wordBookRefs("Sam. ii. 3")).toEqual([]); // a numbered book without its number is unreadable
});

test("occurrences match whole tokens and phrases", () => {
  expect(occurrences(source, ["let"]).map((o) => o.id)).toEqual(["EXO.5.4", "GEN.1.26", "GEN.1.3", "ROM.1.13", "2TH.2.7", "MAT.11.15"]);
  expect(occurrences(source, ["let us"]).map((o) => o.id)).toEqual(["GEN.1.26"]);
  expect(occurrences(source, ["letteth"])[0]!.kwic).toContain("now letteth will let");
});

test("clusters group uses by the neighbouring word", () => {
  const after = clusters(source, occurrences(source, ["let"]), "after");
  expect(after.find((c) => c.neighbour === "the")?.count).toBe(1);
  expect(after.map((c) => c.neighbour)).toContain("hitherto");
  expect(spread([1, 2, 3, 4, 5, 6], 3)).toEqual([1, 3, 5]);
});

const input = (): SurveyInput => ({
  source, vocab: vocabulary(source), nt: new Set(["ROM", "2TH", "MAT"]), glossary: [{ id: "g-let-hinder", kjv_form: "let", sense: "hinder", update: "restrain", category: "shifted_meaning", status: "proposed" }],
  wordBook: { let: [{ headword: "Let", pos: "v. t.", refs: "Ex. v. 4; Rom. i. 13; Gen. i. 3", text: "To hinder." }] },
  webster: { let: [{ headword: "LET", pos: "v.", text: "LET, v. t. To permit." }] },
});

test("a word survey links the Word-Book's cited verses and the existing entries", () => {
  const s = surveyWord("let", [], input());
  expect(s.forms).toEqual(["let", "letteth"]);
  expect(s.count).toBe(7);
  expect(s.nt).toBe(4);
  expect(s.word_book[0]!.cited.map((o) => o.id)).toEqual(["EXO.5.4", "ROM.1.13", "GEN.1.3"]);
  expect(s.existing.map((g) => g.id)).toEqual(["g-let-hinder"]);
  expect(renderWord(s)).toContain("Verses the Word-Book cites");
  expect(template(s).senses.map((x) => [x.id, x.sense])).toEqual([["g-let-hinder", "hinder"], ["g-let-2", ""]]);
  expect(candidates(input())).toEqual([{ form: "let", count: 6, cited: 3 }]);
});

const twoSenses = (): SenseFile => ({
  kjv_form: "let", forms: ["letteth"], reviewed: true, senses: [
    { id: "g-let-allow", sense: "allow; the jussive 'let us', 'let there be'", update: "KEEP", category: "archaic_word", applies_when: "permission or wish", examples: ["GEN.1.3"] },
    { id: "g-let-hinder", sense: "hinder", update: "hinder", category: "shifted_meaning", applies_when: "something stops or holds back the subject", examples: ["EXO.5.4", "ROM.1.13"] },
  ],
});

test("a sense file needs applies_when for each of several senses, real examples, and one sense per verse", () => {
  expect(checkSenseFile(twoSenses(), source)).toEqual([]);
  const f = twoSenses();
  f.senses[0]!.applies_when = "";
  f.senses[0]!.examples = ["EXO.5.4", "GEN.99.1", "MAT.11.15"];
  f.senses[1]!.category = "archaic";
  expect(checkSenseFile(f, source)).toEqual([
    "let: g-let-allow: applies_when is required when a form has more than one sense",
    "let: g-let-allow: GEN.99.1 is not a verse id (e.g. GEN.1.1)",
    expect.stringContaining('category "archaic" is not one of'),
    "let: EXO.5.4 is an example of both g-let-allow and g-let-hinder: a verse pins one sense",
  ]);
  expect(checkSenseFile({ ...twoSenses(), senses: [twoSenses().senses[0]!, twoSenses().senses[0]!] }, source)).toContain("let: g-let-allow: id used twice");
});

test("import ratifies reviewed senses, updates kept ids and supersedes dropped ones", () => {
  const g = new Glossary(join(mkdtempSync(join(tmpdir(), "kjme-")), "g.json"), 3);
  g.entries = [
    { id: "g-let-hinder", kjv_form: "let", sense: "hinder", update: "restrain", category: "shifted_meaning", status: "proposed", uses: 2 },
    { id: "g-let-old", kjv_form: "let", sense: "allow", update: "allow", category: "archaic_word", status: "provisional" },
  ];
  const r = importSenses(g, [twoSenses(), { ...twoSenses(), kjv_form: "prevent", reviewed: false }], source);
  expect(r).toEqual({ imported: ["g-let-allow", "g-let-hinder"], rejected: ["g-let-old"], skipped: ["prevent"], errors: [] });
  const h = g.get("g-let-hinder")!;
  expect([h.status, h.update, h.uses, h.applies_when, h.ratified_by]).toEqual(["ratified", "hinder", 2, "something stops or holds back the subject", "human"]);
  expect(g.get("g-let-old")!.status).toBe("rejected");
  expect(g.version).toBe(1);
});

test("the survey files: templates are written once and read back; words come from --words or the top list", () => {
  const out = mkdtempSync(join(tmpdir(), "kjme-survey-"));
  const s = surveyWord("let", [], input());
  writeSurvey(out, [s], 9);
  expect(readFileSync(join(out, "index.md"), "utf8")).toContain("1 of 9 candidates");
  expect(existsSync(join(out, "let.md"))).toBe(true);
  const filled = { ...twoSenses(), reviewed: true };
  writeFileSync(join(out, "senses", "let.json"), JSON.stringify(filled));
  writeSurvey(out, [s], 9);
  expect(readSenseFiles(join(out, "senses"))).toEqual([filled]);
  expect(pickWords(" Let ,prevent,", [], 5)).toEqual(["let", "prevent"]);
  expect(pickWords(undefined, [{ form: "a" }, { form: "b" }], 1)).toEqual(["a"]);
  expect(() => loadEnglish(out)).toThrow("English 1611 sources missing");
  writeFileSync(join(out, "bible-word-book.json"), JSON.stringify(input().wordBook));
  expect(loadEnglish(out)).toEqual({ wordBook: input().wordBook, webster: {} });
  expect(glossaryFile("runs/g.json", "/h", "/h/runs/x/glossary.json")).toBe("/h/runs/g.json");
  expect(glossaryFile(undefined, "/h", "/h/runs/x/glossary.json")).toBe("/h/runs/x/glossary.json");
});

test("command options default sensibly, and a sense entry drops the template's blanks", () => {
  expect(surveyArgs({}, {})).toMatchObject({ english: "reference/data/english", min: 1, top: 50, out: "runs/glossary-survey" });
  expect(surveyArgs({ top: "5", words: "let" }, { reference: { path: "ref" } })).toMatchObject({ english: "ref/english", top: 5, words: "let" });
  expect(importArgs({ by: true })).toEqual({ dir: "runs/glossary-survey/senses" });
  expect(importArgs({ by: "Raymond", dir: "d" })).toEqual({ dir: "d", reviewer: "Raymond" });
  const e = senseEntry({ kjv_form: "let", forms: [], senses: [], reviewed: true },
    { id: "g-let-allow", sense: "allow", update: "KEEP", category: "archaic_word", applies_when: "", not_when: "", examples: [], notes: "" }, { uses: 4, created_in: "seed" }, "Raymond");
  expect(e).toEqual({ id: "g-let-allow", kjv_form: "let", sense: "allow", update: "KEEP", category: "archaic_word", examples: [], exceptions: [], status: "ratified", uses: 4, created_in: "seed", ratified_by: "human:Raymond" });
});

test("inflections are built forward, never by stripping", () => {
  expect(inflections("occupy")).toEqual(expect.arrayContaining(["occupied", "occupieth", "occupiers", "occupying"]));
  expect(inflections("love")).toEqual(expect.arrayContaining(["loved", "loveth", "lovest", "loving"]));
  expect(inflections("let")).toEqual(expect.arrayContaining(["letteth", "letting"]));
  expect(inflections("war")).not.toContain("wares");
  expect(inflections("let us")).toEqual([]);
});
