import { expect, test } from "bun:test";
import { glossaryVerdict } from "./checks.js";
import type { GlossaryEntry } from "./glossary.js";

const entry = (id: string, update: string, examples: string[] = []): GlossaryEntry =>
  ({ id, kjv_form: "unto", sense: id, update, category: "archaic", examples, status: "provisional" });
const keep = entry("g-unto-keep", "KEEP"), to = entry("g-unto-to", "to");
const tags = (...gs: GlossaryEntry[]) => gs.map((g) => ({ i: 3, text: "unto", g }));

test("C6 is satisfied when the rendering follows any sense of the word", () => {
  expect(glossaryVerdict(tags(keep, to), "PHP.1.2", "Grace be to you", () => false)).toBeNull();
  expect(glossaryVerdict(tags(keep, to), "PHP.1.29", "it is given unto you", () => true)).toBeNull();
});

test("C6 warns when no sense is followed, naming them all", () => {
  const r = glossaryVerdict(tags(keep, to), "PHP.1.2", "Grace be for you", () => false);
  expect(r).toEqual({ hard: false, detail: '"unto" not rendered per g-unto-keep ("KEEP") or g-unto-to ("to"); reviewers judge the sense' });
});

test("C6 fails when a sense pinned to this verse is not followed", () => {
  const pinnedKeep = entry("g-unto-keep", "KEEP", ["PHP.3.10"]);
  expect(glossaryVerdict(tags(pinnedKeep, to), "PHP.3.10", "made conformable to his death", () => false)?.hard).toBe(true);
  expect(glossaryVerdict(tags(pinnedKeep, to), "PHP.3.10", "made conformable unto his death", () => true)).toBeNull();
});
