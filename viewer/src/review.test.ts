import { describe, expect, test } from "bun:test";
import type { ViewerData } from "./types";
import { buildModel } from "./model";
import { changedDecisions, firstOpen, keyAction, messageText, nextOpen, seedRules, statusIn, withMark, type Review } from "./review";
import php from "../public/data/PHP.json";

const data = php as unknown as ViewerData;
const { ordered, decs } = buildModel(data);

describe("marks", () => {
  test("seedRules approves rule checks and leaves the rest", () => {
    const r = seedRules({}, ordered);
    for (const g of ordered) expect(statusIn(r, g.key)).toBe(g.tier === "rule" ? "ok" : null);
  });

  test("seedRules keeps a check already made", () => {
    const rule = ordered.find((g) => g.tier === "rule")!;
    expect(seedRules({ [rule.key]: { s: "flag", note: "n" } }, ordered)[rule.key]).toEqual({ s: "flag", note: "n" });
  });

  test("withMark sets and clears, keeping the note, without touching the input", () => {
    const r: Review = { a: { s: "flag", note: "why" } };
    expect(withMark(r, "a", "ok")).toEqual({ a: { s: "ok", note: "why" } });
    expect(withMark(r, "b", "ok")).toEqual({ ...r, b: { s: "ok", note: "" } });
    expect(withMark(r, "a", null)).toEqual({});
    expect(r).toEqual({ a: { s: "flag", note: "why" } });
  });
});

describe("what opens next", () => {
  const [a, b, c] = ordered;
  test("firstOpen skips checked groups", () => {
    expect(firstOpen(ordered, {})).toBe(a!);
    expect(firstOpen(ordered, { [a!.key]: { s: "ok", note: "" } })).toBe(b!);
  });
  test("nextOpen moves forward and wraps round", () => {
    expect(nextOpen(ordered, a!.key, {})).toBe(b!);
    expect(nextOpen(ordered, b!.key, { [c!.key]: { s: "ok", note: "" } })?.key).toBe(ordered[3]?.key ?? a!.key);
    expect(nextOpen(ordered, ordered.at(-1)!.key, {})).toBe(a!);
    const all = Object.fromEntries(ordered.map((g) => [g.key, { s: "ok" as const, note: "" }]));
    expect(nextOpen(ordered, a!.key, all)).toBeNull();
  });
});

describe("keys", () => {
  test("letters act anywhere; arrows only on the page itself", () => {
    expect(keyAction("a", false)).toBe("approve");
    expect(keyAction("f", false)).toBe("flag");
    expect(keyAction("]", false)).toBe("rail");
    expect(keyAction("j", false)).toBe("next");
    expect(keyAction("k", false)).toBe("prev");
    expect(keyAction("ArrowDown", true)).toBe("next");
    expect(keyAction("ArrowUp", true)).toBe("prev");
    expect(keyAction("ArrowDown", false)).toBeNull();
    expect(keyAction("toString", true)).toBeNull();
    expect(keyAction("x", true)).toBeNull();
  });
});

describe("messageText", () => {
  const d = decs[0]!.d, other = d.options.find((o) => o.choose !== d.resolution)!.choose;
  const flaggedGroup = ordered.find((g) => g.key !== "routine")!;
  const routine = ordered.find((g) => g.key === "routine");

  test("lists flagged edits with their places and notes, and changed decisions", () => {
    const review: Review = { [flaggedGroup.key]: { s: "flag", note: "too loose" } };
    const choices = { [d.batch]: other };
    const changed = changedDecisions(decs, choices);
    expect(changed.map((x) => x.d.batch)).toEqual([d.batch]);
    const t = messageText({ runId: "r1", book: data.book, review, flagged: [flaggedGroup], changed, choices });
    const where = flaggedGroup.items.map((x) => x.v.ref.replace(data.book + " ", "")).join(", ");
    expect(t).toBe(
      `KJME review of run r1\n\nFlagged edits:\n- ${flaggedGroup.c.kjv} → ${flaggedGroup.c.update} (${where}): too loose\n\n` +
      `Decision changes:\n- ${d.passage}: option ${"ABCDEFGH"[d.options.findIndex((o) => o.choose === other)]} (${other}), was ${d.resolution}`,
    );
  });

  test("names routine forms, and leaves out empty sections", () => {
    if (routine) expect(messageText({ runId: "r", book: data.book, review: {}, flagged: [routine], changed: [], choices: {} })).toContain("- Routine forms (");
    expect(messageText({ runId: "r", book: data.book, review: {}, flagged: [], changed: [], choices: {} })).toBe("KJME review of run r");
  });

  test("choosing the run's own option is not a change", () => {
    expect(changedDecisions(decs, { [d.batch]: d.resolution! })).toEqual([]);
  });
});
