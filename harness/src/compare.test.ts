import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadRun, pairJobs, parseReply, prompt, tally, unblind, type Job, type V } from "./compare.js";

const tmp = mkdtempSync(join(tmpdir(), "compare-"));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const verse = (id: string, batch: string, kjv: string) => ({ id, ref: `Philippians ${id.slice(4).replace(".", ":")}`, batch, status: "accepted", runs: { kjv: [{ t: kjv }] } });
function run(name: string, accepted: Record<string, { text: string; status: string }>, record?: { candidates: any[]; escalations: any[] }) {
  const dir = join(tmp, name);
  mkdirSync(join(dir, "record"), { recursive: true });
  writeFileSync(join(dir, "viewer-data.json"), JSON.stringify({ run: { id: name }, verses: [verse("PHP.1.1", "b1", "Paul and Timotheus"), verse("PHP.1.2", "b2", "Grace be unto you")] }));
  writeFileSync(join(dir, "accepted.json"), JSON.stringify(accepted));
  if (record) for (const [k, xs] of Object.entries(record)) writeFileSync(join(dir, "record", `${k}.jsonl`), xs.map((x) => JSON.stringify(x)).join("\n"));
  return dir;
}

describe("loadRun", () => {
  test("uses saved text, and marks text pending a human", () => {
    const r = loadRun(run("a", { "PHP.1.1": { text: "Paul and Timothy", status: "accepted" }, "PHP.1.2": { text: "Grace be to you", status: "pending_human" } }));
    expect(r.run).toBe("a");
    expect(r.text.get("PHP.1.1")).toEqual({ t: "Paul and Timothy", pending: false });
    expect(r.text.get("PHP.1.2")).toEqual({ t: "Grace be to you", pending: true });
  });
  test("falls back to the recommended candidate for a verse with no saved text", () => {
    const r = loadRun(run("b", { "PHP.1.1": { text: "Paul and Timothy", status: "accepted" } }, {
      candidates: [{ id: "b2.mechanical", verses: [{ id: "PHP.1.2", text: "Grace be unto you" }] }],
      escalations: [{ batch_id: "b2", recommended_candidate: "b2.mechanical" }],
    }));
    expect(r.text.get("PHP.1.2")).toEqual({ t: "Grace be unto you", pending: true });
  });
  test("fails loudly when a verse has no text at all", () => {
    expect(() => loadRun(run("c", {}))).toThrow("no text for PHP.1.1");
  });
});

const A = loadRun(run("x", { "PHP.1.1": { text: "Paul and Timothy", status: "accepted" }, "PHP.1.2": { text: "Grace be to you", status: "accepted" } }));
const B = loadRun(run("y", { "PHP.1.1": { text: "Paul and Timothy", status: "accepted" }, "PHP.1.2": { text: "Grace to you", status: "pending_human" } }));

test("pairJobs skips identical passages and judges the rest in both orders", () => {
  const { jobs, identical } = pairJobs(A, B);
  expect(identical).toEqual(["b1"]);
  expect(jobs.map((j) => `${j.batch} ${j.order}`)).toEqual(["b2 AB", "b2 BA"]);
});

test("prompt lists the KJV and both texts by chapter and verse", () => {
  const vs: V[] = A.verses.filter((v) => v.batch === "b2");
  expect(prompt(vs, () => "one", () => "two")).toBe("<kjv>\n1:2 Grace be unto you\n</kjv>\n\n<text_x>\n1:2 one\n</text_x>\n\n<text_y>\n1:2 two\n</text_y>");
});

test("parseReply reads fenced and bare JSON", () => {
  expect(parseReply('```json\n{"preference":"X"}\n```')).toEqual({ preference: "X" });
  expect(parseReply('Here: {"preference":"Y"} done')).toEqual({ preference: "Y" });
});

describe("unblind and tally", () => {
  const job = (order: "AB" | "BA"): Job => ({ batch: "b2", vs: [], order });
  const reply = (pref: string) => ({
    preference: pref, strength: "clear", reason: "r", scores: { X: { fidelity: 5, clarity: 4, restraint: 3 }, Y: { fidelity: 3, clarity: 3, restraint: 3 } },
    errors: { X: [], Y: ["bad"] }, differences: [{ verse: "1:2", x: "to", y: "", better: "X", why: "w" }],
  });
  test("maps X and Y back to the runs for each order", () => {
    const u = unblind(job("BA"), reply("X"));
    expect(u.preference).toBe("B");
    expect(u.scores.B!.fidelity).toBe(5);
    expect(u.errors.A).toEqual(["bad"]);
    expect(u.differences[0]).toEqual({ verse: "1:2", B: "to", A: "", better: "B", why: "w" });
    expect(unblind(job("AB"), reply("tie")).preference).toBe("tie");
  });
  test("a side wins only when both orders agree", () => {
    const agree = [unblind(job("AB"), reply("X")), unblind(job("BA"), reply("Y"))];
    const t = tally(agree, [job("AB"), job("BA")], () => true);
    expect(t.verdicts).toEqual({ A: 1, B: 0, tie: 0, split: 0 });
    expect(t.passages).toEqual([{ batch: "b2", verdict: "A", AB: "A", BA: "A", pending: true }]);
    expect(t.scores.A).toEqual({ fidelity: 4, clarity: 3.5, restraint: 3, errors_per_order: 0.5 });
    const split = tally([unblind(job("AB"), reply("X")), unblind(job("BA"), reply("X"))], [job("AB")], () => false);
    expect(split.verdicts.split).toBe(1);
  });
});
