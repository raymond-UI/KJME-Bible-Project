import { describe, expect, test } from "bun:test";
import { baseFor, failingNote, noteSpan, heldChanges, revertVerse, type FinalReview, type HoldInput } from "./hold.js";
import { tokenize } from "./text.js";
import type { Candidate, CandVerse, Change, CheckReport } from "./checks.js";
import type { PretaggedVerse } from "./pretag.js";

const KJV = "Let your moderation be known unto all men.";
const UPD = "Let your gentleness be known to all men.";
const at = (s: string, w: string) => ({ start: s.indexOf(w), end: s.indexOf(w) + w.length, text: w });
const change = (id: string, k: string, u: string, extra: Partial<Change> = {}): Change => ({
  id, verse_id: "PHP.4.5", kjv: at(KJV, k), update: at(UPD, u), category: "meaning", reason: "", glossary_id: null,
  uncertain: false, evidence: [], auto: false, ...extra,
});
const verse = (changes: Change[]): CandVerse => ({ id: "PHP.4.5", text: UPD, pronoun_marks: [], italics: [], changes });
const cand = (id: string, author: string, changes: Change[] = []): Candidate =>
  ({ id, batch_id: "PHP.4.b01", author, attempt: 1, verses: [verse(changes)], glossary_proposals: [], notes: "" });
const report = (id: string, passed = true): CheckReport =>
  ({ candidate_id: id, passed, results: [], metrics: { change_count: 0, optional_change_count: 0, word_delta: 0, chars_changed_ratio: 0 } });
const pv = { id: "PHP.4.5", tokens: tokenize(KJV), mechanical: { text: KJV, pronoun_marks: [] } } as unknown as PretaggedVerse;

const c1 = change("c1", "moderation", "gentleness");
const c2 = change("c2", "unto", "to");
const base = cand("PHP.4.b01.clarity", "clarity", [c1, c2]);
const input = (reviews: FinalReview[], over: Partial<HoldInput> = {}): HoldInput => ({
  batchId: "PHP.4.b01", verses: [pv], pool: [{ c: base, r: report(base.id) }], reviews,
  tables: {} as HoldInput["tables"], glossary: {} as HoldInput["glossary"], ...over,
});
const review = (reviewer: string, c: FinalReview["candidates"][string], ranking: string[] = []): FinalReview =>
  ({ reviewer, ranking, candidates: { [base.id]: c } });

describe("failingNote", () => {
  test("reads the verse and span of a note that says it fails", () => {
    expect(failingNote("PHP.4.5: 'moderation' → 'gentleness' (c5) fails G1 under P1.")).toEqual({ verse_id: "PHP.4.5", span: "moderation → gentleness" });
  });
  test("ignores passes, false positives and notes outside the format", () => {
    expect(failingNote("PHP.4.5: unto: follows g-unto-to; G5 passes.")).toBeNull();
    expect(failingNote("PHP.4.5: unto: the check warning is a false positive and fails nothing.")).toBeNull();
    expect(failingNote("PHP.4.5: unto: this is not a gate failure.")).toBeNull();
    expect(failingNote("PHP.3.21: 'vile' → 'lowly' is a correct R4 change; it does not fail G1 by itself.")).toBeNull();
    expect(failingNote("PHP.3.21: 'vile' → 'lowly': G1 is not failed on this ground.")).toBeNull();
    expect(failingNote("The candidate fails G1 overall.")).toBeNull();
    expect(failingNote("PHP.4.5: the sense of the verse is narrowed and so the candidate fails G1.")).toBeNull();
  });
  test("a formatted note must say it fails", () => {
    expect(failingNote("PHP.4.5: moderation: R4 and P1 require a change.")).toBeNull();
    expect(noteSpan("PHP.4.5: moderation: R4 and P1 require a change.")).toEqual({ verse_id: "PHP.4.5", span: "moderation" });
  });
});

describe("baseFor", () => {
  const mech = cand("PHP.4.b01.mechanical", "mechanical");
  const mini = cand("PHP.4.b01.minimalist", "minimalist");
  const bad = cand("PHP.4.b01.cadence", "cadence");
  const pool = [{ c: mech, r: report(mech.id) }, { c: bad, r: report(bad.id, false) }, { c: mini, r: report(mini.id) }, { c: base, r: report(base.id) }];
  test("takes the coordinator's pick when it passed checks", () => {
    expect(baseFor({ pool, reviews: [], recommendation: "PHP.4.b01.minimalist, pending a ruling" })!.c.id).toBe(mini.id);
  });
  test("never builds on the mechanical draft or a failed candidate", () => {
    expect(baseFor({ pool, reviews: [], recommendation: mech.id })!.c.id).toBe(mini.id);
    expect(baseFor({ pool, reviews: [], recommendation: bad.id })!.c.id).toBe(mini.id);
  });
  test("otherwise prefers the auditor's ranking", () => {
    const reviews = [review("reviewer-scorer", {}, [mini.id]), review("reviewer-meaning-auditor", {}, [bad.id, base.id])];
    expect(baseFor({ pool, reviews })!.c.id).toBe(base.id);
  });
  test("returns null when nothing usable passed", () => {
    expect(baseFor({ pool: [{ c: mech, r: report(mech.id) }], reviews: [] })).toBeNull();
  });
});

describe("heldChanges", () => {
  const ids = (inp: HoldInput) => heldChanges(base, inp).map((h) => h.change_id);
  test("holds only the disputed word", () => {
    expect(ids(input([], { disputed: [{ verse_id: "PHP.4.5", kjv: "moderation" }] }))).toEqual(["c1"]);
  });
  test("falls back to quoted words in the question within the focus verses", () => {
    expect(ids(input([], { question: "Should 'moderation' change?", focus: ["PHP.4.5"] }))).toEqual(["c1"]);
    expect(ids(input([], { question: "Should 'moderation' change?", focus: ["PHP.4.6"] }))).toEqual([]);
  });
  test("holds uncertain changes and changes a reviewer disagrees with, not alternatives", () => {
    const u = cand(base.id, "clarity", [c1, change("c2", "unto", "to", { uncertain: true })]);
    expect(heldChanges(u, input([])).map((h) => h.change_id)).toEqual(["c2"]);
    const r = review("reviewer-meaning-auditor", { change_comments: [{ change_id: "c1", verdict: "disagree" }, { change_id: "c2", verdict: "alternative" }] });
    expect(ids(input([r]))).toEqual(["c1"]);
  });
  test("holds the change a failing gate note names, and nothing for a note on a kept word", () => {
    const named = review("reviewer-scorer", { gates: { G1: "fail" }, gate_notes: ["PHP.4.5: moderation: shifted sense narrowed, fails G1."] });
    expect(ids(input([named]))).toEqual(["c1"]);
    const kept = review("reviewer-scorer", { gates: { G1: "fail" }, gate_notes: ["PHP.4.5: men: R4 requires a change."] });
    expect(ids(input([kept]))).toEqual([]);
    // A failed gate whose notes point at a word the candidate kept holds nothing else.
    const onKept = review("reviewer-scorer", { gates: { G1: "fail" }, gate_notes: ["PHP.4.5: men: R4 requires a change."] });
    expect(ids(input([onKept], { focus: ["PHP.4.5"] }))).toEqual([]);
  });
  test("holds every change in the focus verses when a failed gate has no readable note", () => {
    const vague = review("reviewer-scorer", { gates: { G1: "fail" }, gate_notes: ["Meaning narrowed somewhere."] });
    expect(ids(input([vague], { focus: ["PHP.4.5"] }))).toEqual(["c1", "c2"]);
  });
});

describe("revertVerse", () => {
  test("puts the mechanical wording back for held changes and keeps the rest", () => {
    const r = revertVerse(verse([c1, c2]), pv, new Set(["c1"]));
    expect(r.text).toBe("Let your moderation be known to all men.");
    expect(r.changes.map((c) => c.kjv)).toEqual(["unto"]);
  });
  test("reverting every change gives the mechanical draft", () => {
    expect(revertVerse(verse([c1, c2]), pv, new Set(["c1", "c2"])).text).toBe(KJV);
  });
});
