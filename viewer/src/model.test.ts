import { describe, expect, test } from "bun:test";
import type { ViewerData } from "./types";
import { TIERS, bookName, buildModel, cleanReason, groupLabel } from "./model";
import php from "../public/data/PHP.json";

const data = php as unknown as ViewerData;
const model = buildModel(data);

describe("buildModel", () => {
  test("every change a reviewer must check becomes exactly one item", () => {
    const manual = data.verses.flatMap((v) => v.changes.filter((c) => !c.auto));
    expect(model.items.length).toBe(manual.length);
    expect(new Set(model.items.map((i) => i.key)).size).toBe(model.items.length);
  });

  test("identical edits share one group, and each item points at its group", () => {
    for (const g of model.groups) for (const it of g.items) expect(it.group).toBe(g.key);
    const swaps = model.groups.filter((g) => g.key.startsWith("p:"));
    expect(new Set(swaps.map((g) => g.key)).size).toBe(swaps.length);
  });

  test("routine forms and ratified glossary rules land in the rule tier", () => {
    for (const g of model.groups) {
      if (g.key === "routine") expect([g.tier, g.color, g.cat]).toEqual(["rule", "minor", "routine"]);
      if (g.key.startsWith("g:")) expect(g.tier).toBe("rule");
      if (g.key.startsWith("p:")) expect(g.tier).toBe(g.c.category === "shifted_meaning" ? "meaning" : "words");
    }
  });

  test("checks are ordered meaning, then word swaps, then by rule", () => {
    const rank = (t: string) => TIERS.findIndex(([x]) => x === t);
    const ranks = model.ordered.map((g) => rank(g.tier));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(model.ordered.length).toBe(model.groups.length);
  });

  test("decisions are keyed by batch", () => {
    expect(model.decs.length).toBe(data.decisions?.length ?? 0);
    for (const x of model.decs) expect(model.decBy.get("d|" + x.d.batch)).toBe(x);
  });

  test("an empty run builds an empty model", () => {
    const m = buildModel({ ...data, verses: [], glossary: [], decisions: undefined } as unknown as ViewerData);
    expect([m.items.length, m.groups.length, m.decs.length]).toEqual([0, 0, 0]);
  });
});

describe("labels", () => {
  test("groupLabel names routine forms and categories", () => {
    const routine = model.groupBy.get("routine");
    if (routine) expect(groupLabel(routine)).toBe("Routine forms");
    expect(groupLabel({ ...model.groups[0]!, key: "p:x|y", cat: "archaic_word" })).toBe("Archaic word");
    expect(groupLabel({ ...model.groups[0]!, key: "p:x|y", cat: "new_kind" })).toBe("new_kind");
  });

  test("bookName looks up the canon, with a fallback", () => {
    expect(bookName("PHP")).toBe("Philippians");
    expect(bookName("XYZ", "Unknown")).toBe("Unknown");
    expect(bookName("XYZ")).toBe("XYZ");
  });
});

describe("cleanReason", () => {
  const text = (s: string | null | undefined) => cleanReason(s).map((p) => p.text).join("");

  test("drops rule ids and capitalises", () => {
    expect(text("R4: modern word keeps the sense")).toBe("Modern word keeps the sense");
    expect(text("R2 and R5: shorter (P1) form")).toBe("Shorter form");
  });

  test("marks glossary ids so they can link", () => {
    const parts = cleanReason("follows g-conversation-conduct here");
    expect(parts.filter((p) => p.gid).map((p) => p.text)).toEqual(["g-conversation-conduct"]);
    expect(parts.map((p) => p.text).join("")).toBe("Follows g-conversation-conduct here");
  });

  test("handles missing reasons", () => {
    expect(cleanReason(null)).toEqual([]);
    expect(text(undefined)).toBe("");
  });
});
