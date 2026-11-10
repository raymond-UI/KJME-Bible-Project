import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { baseForms, Reference, tahotWord } from "./reference.js";

// Synthetic lines in the TAHOT and TBESH column layout (not STEPBible data).
const row = (ref: string, heb: string, tr: string, en: string, ds: string, gr: string, variant = "", tags = "") =>
  [ref, heb, tr, en, ds, gr, variant, "", "", "", "", tags].join("\t");
const L1 = row("Gen.9.1#01=L", "אב/ג", "a.Bag", "the/ word", "H9009/{H1111A}", "HTd/Ncmsa", "", "H9009=ה=the/{H1111A=אבג=: word»saying:1_word}");
const L2 = row("Gen.9.1#02=Q(K)", "דה", "Deh", "you said", "{H2222}", "HVqp2ms", "K= deh (דהו) \"he said\"", "{H2222=דה=to say}");
const L3 = row("Gen.9.1#03=X", "וז", "vaz", "extra", "{H3333}", "HNcmsa", "", "{H3333=וז=extra}");
const L4 = row("Psa.9.0(9.1)#01=L", "חט", "Chat", "a song", "{H4444}", "HNcmsa", "", "{H4444=חט=song}");
const L5 = row("Gen.9.2#01=LH(a)", "יכ", "Yak", "you all", "{H5555}", "HVqv2mp/Sp2fs", "", "{H5555=יכ=to go}");

describe("tahotWord", () => {
  test("reads the root lemma, gloss and morphology", () => {
    expect(tahotWord(L1)).toEqual({ id: "GEN.9.1", word: {
      position: 1, surface: "אבג", transliteration: "a.Bag", strongs: "H1111A", morphology: "HTd/Ncmsa",
      lemma: "אבג", lemma_gloss: "word", gloss: "the/ word", type: "L",
    } });
  });
  test("keeps Qere with its Ketiv variant, and flags where the Ben Chayyim edition differs", () => {
    expect(tahotWord(L2)!.word.variant).toBe('K= deh (דהו) "he said"');
    expect(tahotWord(L5)!.word.variant).toBe("the Ben Chayyim edition differs here");
  });
  test("drops text the KJV's Hebrew does not have, and non-data lines", () => {
    expect(tahotWord(L3)).toBeNull();
    expect(tahotWord("# Gen.9.1\tsome heading")).toBeNull();
  });
  test("uses the English verse reference", () => {
    expect(tahotWord(L4)!.id).toBe("PSA.9.0");
  });
});

describe("Reference with Hebrew", () => {
  const dir = mkdtempSync(join(tmpdir(), "ref-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "stepbible"));
  writeFileSync(join(dir, "stepbible", "TAHOT Gen-Deu test.txt"), ["header line", L1, L2, L3, L5].join("\n"));
  writeFileSync(join(dir, "stepbible", "TBESH test.txt"), ["H1111\tH1111A =\tH1111A\tאבג\ta.vag\tH:N-M\tword\t1) a word<br>2) a saying"].join("\n"));
  const r = new Reference(dir, new Map(), () => new Map());

  test("loads the OT and the Hebrew lexicon", () => {
    expect(r.available).toEqual({ greek: false, hebrew: true, lexicon: true, english: false });
    expect(r.original("GEN.9.1").words!.map((w) => w.position)).toEqual([1, 2]);
    expect(r.original("GEN.9.1").language).toBe("hebrew");
    expect(r.lexicon("H1111A")).toMatchObject({ lemma: "אבג", gloss: "word", definition: "1) a word 2) a saying" });
  });
  test("reports missing data by language", () => {
    expect(r.original("GEN.50.1").note).toContain("no Hebrew data");
    expect(r.original("PHP.1.1").note).toContain("no Greek data");
  });
  test("counts second-person forms, including suffixes", () => {
    expect(r.secondPersonCounts("GEN.9.1")).toEqual({ sg: 1, pl: 0 });
    expect(r.secondPersonCounts("GEN.9.2")).toEqual({ sg: 1, pl: 1 });
  });
  test("shows variants in the compact form", () => {
    expect(r.originalCompact("GEN.9.1")).toContain('[variant: K= deh (דהו) "he said"]');
  });
});

describe("English 1611 lookups", () => {
  const dir = mkdtempSync(join(tmpdir(), "ref-en-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, "english"));
  writeFileSync(join(dir, "english", "bible-word-book.json"), JSON.stringify({ prevent: [{ headword: "Prevent", pos: "v. t.", text: `Prevent, v. t. To go before. ${"x".repeat(2000)}` }] }));
  writeFileSync(join(dir, "english", "webster-1828.json"), JSON.stringify({ prevented: [{ headword: "PREVENT'ED", pos: "pp.", text: "PREVENT'ED, pp. Hindered." }] }));
  const r = new Reference(dir, new Map(), () => new Map());
  test("finds both sources, from an inflected form, and trims long entries", () => {
    const x: any = r.english1611("Prevented");
    expect(x.results.map((y: any) => y.matched)).toEqual(["prevent", undefined]);
    expect(x.results.map((y: any) => y.source)).toEqual(["bible-word-book.json", "webster-1828.json"]);
    expect(x.results[0].entries[0].text.length).toBeLessThan(1600);
    expect(x.results[0].entries[0].text.endsWith("[...]")).toBe(true);
  });
  test("baseForms tries the usual KJV endings", () => {
    expect(baseForms("careth")).toEqual(["car", "care"]);
    expect(baseForms("unto")).toEqual([]);
  });
});
