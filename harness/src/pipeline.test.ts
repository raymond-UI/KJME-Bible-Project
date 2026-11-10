import { expect, test } from "bun:test";
import { auditorClear, type Review } from "./pipeline.js";

const pass = { G1: "pass", G2: "pass", G3: "pass", G4: "pass", G5: "pass" };
const scores = (n: number) => ({ S1: n, S2: n, S3: n, S4: n });
const review = (reviewer: string, ranking: string[], cands: { label: string; gates?: object; s?: number }[]): Review => ({
  id: reviewer, reviewer, round: 1, labelToId: { A: "c1", B: "c2", M: "mech" },
  raw: { ranking, candidates: cands.map((c) => ({ label: c.label, gates: c.gates ?? pass, scores: scores(c.s ?? 3) })) },
});

test("the auditor rests when it passed every gate on its own top and the scorer's", () => {
  const s = review("s", ["A", "B"], [{ label: "A", s: 5 }, { label: "B", s: 3 }]);
  expect(auditorClear(s, review("a", ["B", "A"], [{ label: "A" }, { label: "B" }]))).toBe(true);
});

test("the auditor reconsiders when it failed a gate on the scorer's leader", () => {
  const s = review("s", ["A", "B"], [{ label: "A", s: 5 }, { label: "B", s: 3 }]);
  expect(auditorClear(s, review("a", ["B", "A"], [{ label: "A", gates: { ...pass, G1: "fail" } }, { label: "B" }]))).toBe(false);
});

test("the auditor reconsiders when the scorer passed nothing", () => {
  const s = review("s", ["A"], [{ label: "A", gates: { ...pass, G2: "fail" } }]);
  expect(auditorClear(s, review("a", ["A"], [{ label: "A" }]))).toBe(false);
});
