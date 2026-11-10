import { expect, test } from "bun:test";
import { lowConfidence, normalizeTrigger, uncertainChanges } from "./escalation.js";
import type { Change } from "./checks.js";

test("normalizeTrigger keeps fixed values and maps free-form names", () => {
  expect(normalizeTrigger("g1_dispute", 2)).toBe("g1_dispute");
  expect(normalizeTrigger("no_eligible_candidate", 0)).toBe("no_eligible");
  expect(normalizeTrigger("Low confidence in sense", 1)).toBe("low_confidence");
  expect(normalizeTrigger("ambiguous_word", 1)).toBe("uncertain_sense");
  expect(normalizeTrigger("", 1)).toBe("coordinator");
  expect(normalizeTrigger(undefined, 0)).toBe("no_eligible");
});

test("lowConfidence asks about the coordinator's doubts", () => {
  const a = lowConfidence(0.6, 0.7, [{ verse_id: "PHP.1.10", kjv: "approve", question: "Does approve mean test here?" }, { verse_id: "PHP.1.10" }]);
  expect(a).toEqual({ question: 'PHP.1.10 "approve": Does approve mean test here?', disputed: [{ verse_id: "PHP.1.10", kjv: "approve" }], focus_verses: ["PHP.1.10"] });
  expect(lowConfidence(0.5, 0.7, null).disputed).toEqual([]);
  expect(lowConfidence(0.5, 0.7, null).question).toContain("named no word in doubt");
});

test("uncertainChanges asks one question per change", () => {
  const ch = { verse_id: "PHP.3.8", kjv: { text: "dung" }, update: { text: "rubbish" }, reason: "sense of skubala" } as Change;
  expect(uncertainChanges([ch])).toEqual({ question: 'PHP.3.8: should "dung" become "rubbish"? (sense of skubala)', disputed: [{ verse_id: "PHP.3.8", kjv: "dung" }], focus_verses: ["PHP.3.8"] });
});
