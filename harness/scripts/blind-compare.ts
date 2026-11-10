#!/usr/bin/env bun
// Blind comparison of two runs' text, passage by passage, judged by a model that sees neither run's name.
//
//   bun scripts/blind-compare.ts --a <run dir> --b <run dir> [--judge claude|codex] [--model <id>] [--effort high] [--out <dir>]
//
// Each run dir holds viewer-data.json and accepted.json; a verse pending a human uses its saved provisional text.
// Passages whose two texts are identical are not sent. Every passage is judged twice with the texts in swapped
// order; a verdict counts only when both orders agree. The judge sees only the prompt: headless `claude -p` with
// no tools, settings or session, or `codex exec` in an empty directory with a read-only sandbox and no saved session.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadRun, pairJobs, parseReply, prompt, tally, unblind, type Result, type V } from "../src/compare.js";

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1]! : d; };
const JUDGE = arg("judge", "claude")!;
const MODEL = arg("model", JUDGE === "codex" ? "gpt-5.6-terra" : "claude-fable-5-2")!, EFFORT = arg("effort", "high")!;
const OUT = resolve(arg("out", join(import.meta.dir, "..", "runs", `compare-${Date.now()}`))!);
const ROOT = join(import.meta.dir, "..", "..");
const BIN = arg("bin", JUDGE)!;
const PAR = Number(arg("parallel", "4"));

const rules = readFileSync(join(ROOT, "rules", "update-rules.md"), "utf8");
const SYSTEM = `You are an expert judge of English Bible revision, with a working knowledge of New Testament Greek and of Early Modern English.

You are judging two proposed updates of the same King James Version (1769) passage. The goal of the edition: the KJV with its English updated for modern readers, meaning unchanged. Keep the KJV's wording, word order and cadence wherever a modern reader understands it correctly; change only archaic forms, words no longer understood, and words whose meaning has shifted so that a modern reader would misread them. Never add interpretation. The rules the editors follow are below.

The two texts are labelled X and Y. You are not told how either was made. Judge only the text. Words in the KJV that stay unchanged in both texts are not at issue. Number marks on "you" are not shown; ignore pronoun number.

<rules>
${rules}
</rules>

Reply with JSON only, no prose before or after:
{"differences":[{"verse":"1:10","x":"...","y":"...","better":"X|Y|equal","why":"one sentence"}],
 "scores":{"X":{"fidelity":1-5,"clarity":1-5,"restraint":1-5},"Y":{"fidelity":1-5,"clarity":1-5,"restraint":1-5}},
 "errors":{"X":["any change that alters the meaning, misreads the Greek, or breaks a rule"],"Y":[]},
 "preference":"X|Y|tie","strength":"slight|clear|strong","reason":"two sentences at most"}

fidelity: the meaning of the KJV (and the Greek behind it) is kept exactly. clarity: a modern reader understands it correctly. restraint: nothing is changed that did not need changing, and the KJV's cadence survives.`;

let calls = 0;
async function askCodex(user: string): Promise<{ text: string; cost: number }> {
  const dir = join(OUT, "codex-cwd"), last = join(dir, `reply-${calls++}.txt`);
  mkdirSync(dir, { recursive: true });
  const p = Bun.spawn([BIN, "exec", "--skip-git-repo-check", "--sandbox", "read-only", "--ephemeral", "--color", "never",
    "-m", MODEL, "-c", `model_reasoning_effort=${EFFORT}`, "-o", last, "-"],
  { cwd: dir, stdin: new Blob([`${SYSTEM}\n\nDo not run commands or read files; everything you need is below.\n\n${user}`]), stdout: "ignore", stderr: "pipe" });
  const err = await new Response(p.stderr).text();
  await p.exited;
  return { text: existsSync(last) ? readFileSync(last, "utf8") : err.slice(-400), cost: 0 };
}
async function askClaude(user: string): Promise<{ text: string; cost: number }> {
  const p = Bun.spawn([BIN, "-p", "--model", MODEL, "--effort", EFFORT, "--system-prompt-file", join(OUT, "system.md"), "--output-format", "json",
    "--tools", "", "--setting-sources", "", "--strict-mcp-config", "--disable-slash-commands", "--no-session-persistence"],
  { stdin: new Blob([user]), stdout: "pipe", stderr: "pipe" });
  const out = await new Response(p.stdout).text();
  await p.exited;
  try { const env = JSON.parse(out); return { text: String(env.result ?? ""), cost: env.total_cost_usd ?? 0 }; } catch { return { text: out, cost: 0 }; }
}
const ask = JUDGE === "codex" ? askCodex : askClaude;

async function judge(user: string): Promise<{ json: any; cost: number }> {
  for (let attempt = 1; ; attempt++) {
    const r = await ask(user);
    try { return { json: parseReply(r.text), cost: r.cost }; } catch { if (attempt === 3) throw new Error(`judge failed: ${r.text.slice(0, 400)}`); }
  }
}

const a = loadRun(resolve(arg("a")!)), b = loadRun(resolve(arg("b")!));
const { byBatch, jobs, identical } = pairJobs(a, b);
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "system.md"), SYSTEM);
console.log(`${a.run} vs ${b.run}: ${byBatch.size} passages, ${identical.length} identical, ${jobs.length} judge calls with ${MODEL}`);

const textOf = (r: typeof a) => (v: V) => r.text.get(v.id)!.t;
const results: Result[] = [];
let next = 0, cost = 0;
await Promise.all(Array.from({ length: PAR }, async () => {
  for (let j = jobs[next++]; j; j = jobs[next++]) {
    const [x, y] = j.order === "AB" ? [textOf(a), textOf(b)] : [textOf(b), textOf(a)];
    const r = await judge(prompt(j.vs, x, y));
    cost += r.cost;
    const u = unblind(j, r.json);
    results.push(u);
    console.log(`  ${j.batch} ${j.order}: ${u.preference} (${u.strength})`);
  }
}));

const pending = (batch: string) => byBatch.get(batch)!.some((x) => a.text.get(x.id)!.pending || b.text.get(x.id)!.pending);
const t = tally(results, jobs, pending);
const summary = {
  A: a.run, B: b.run, judge: JUDGE, model: MODEL, effort: EFFORT, passages: byBatch.size, identical, judged: t.passages.length,
  verdicts: t.verdicts, scores: t.scores, cost_usd: +cost.toFixed(2), passages_detail: t.passages,
};
writeFileSync(join(OUT, "results.json"), JSON.stringify(results.sort((p, q) => (p.batch + p.order).localeCompare(q.batch + q.order)), null, 2));
writeFileSync(join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ...summary, passages_detail: undefined }, null, 2));
console.log(`Written to ${OUT}`);
