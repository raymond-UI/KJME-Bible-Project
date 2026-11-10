// Pilot report: the metrics PIPELINE.md asks for, plus the viewer data for the web app in ../viewer.
import { existsSync, writeFileSync } from "node:fs";
import { readJson } from "./util.js";
import { reference as ref } from "./books.js";
import type { Store } from "./store.js";
import type { SourceVerse } from "./source.js";
import { writeViewer } from "./viewer.js";

const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(0)}%` : "n/a");
const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function buildReport(store: Store, source: Map<string, SourceVerse>): { md: string; html: string } {
  const events = store.all("events").filter((e) => e.type === "agent_call");
  const decisions = store.all("decisions");
  const reviews = store.all("reviews");
  const escalations = store.all("escalations");
  // Re-runs append records again; keep the latest per id.
  const latest = <T extends { id?: string; candidate_id?: string }>(xs: T[], key: (x: T) => string) => [...new Map(xs.map((x) => [key(x), x])).values()];
  const batches = latest(store.all("batches"), (b) => b.id);
  const reports = latest(store.all("check_reports"), (r) => `${r.candidate_id}`);
  const candidates = latest(store.all("candidates"), (c) => `${c.id}#${c.attempt}`);
  const decided = new Set(store.all("decisions").map((d) => d.batch_id));
  void decided;
  const lookups = store.all("lookups");
  const consistency = store.all("consistency");
  const accepted: Record<string, any> = existsSync(store.path("accepted.json")) ? readJson(store.path("accepted.json")) : {};
  const verses = Object.values(accepted);
  const nAccepted = verses.filter((v: any) => v.status === "accepted").length;
  const nPending = verses.length - nAccepted;

  // Cost
  const byAgent = new Map<string, { calls: number; cost: number; input: number; output: number; cache: number; fails: number }>();
  for (const e of events) {
    const a = byAgent.get(e.agent) ?? { calls: 0, cost: 0, input: 0, output: 0, cache: 0, fails: 0 };
    a.calls++; a.cost += e.cost_usd ?? 0; a.input += e.usage?.input ?? 0; a.output += e.usage?.output ?? 0; a.cache += e.usage?.cache_read ?? 0; if (!e.ok) a.fails++;
    byAgent.set(e.agent, a);
  }
  const total = [...byAgent.values()].reduce((s, a) => s + a.cost, 0);

  // Reviewer agreement
  const latestDecision = new Map<string, any>();
  for (const d of decisions) latestDecision.set(d.batch_id, d);
  let agreeR1 = 0, agreeFinal = 0, nCmp = 0, debatedN = 0;
  for (const [bid, d] of latestDecision) {
    const rs = reviews.filter((r) => r.batch_id === bid);
    const top = (r: any) => r && r.label_map[r.ranking?.[0]];
    const s1 = rs.find((r) => r.reviewer === "reviewer-scorer" && r.round === 1), a1 = rs.find((r) => r.reviewer === "reviewer-meaning-auditor" && r.round === 1);
    const s2 = rs.find((r) => r.reviewer === "reviewer-scorer" && r.round === 2) ?? s1, a2 = rs.find((r) => r.reviewer === "reviewer-meaning-auditor" && r.round === 2) ?? a1;
    if (!s1 || !a1) continue;
    nCmp++; if (top(s1) === top(a1)) agreeR1++; if (top(s2) === top(a2)) agreeFinal++; if (d.debate?.ran) debatedN++;
  }

  // Wins
  const wins = new Map<string, number>();
  for (const d of latestDecision.values()) {
    const key = d.outcome === "select" ? (candidates.find((c) => c.id === d.winner)?.author ?? d.winner) : d.outcome;
    wins.set(key, (wins.get(key) ?? 0) + 1);
  }

  // Check failures on first attempt, and repair outcomes
  const firstFail = new Map<string, [number, number]>();
  for (const c of candidates.filter((c) => c.author.startsWith("translator-"))) {
    if (c.attempt !== 1) continue;
    const r = reports.find((x) => x.candidate_id === c.id && true);
    const f = firstFail.get(c.author) ?? [0, 0];
    f[1]++; if (r && !r.passed) f[0]++;
    firstFail.set(c.author, f);
  }

  // Glossary growth per chapter
  const added = store.all("events").filter((e) => e.type === "glossary_added");
  const chapterOf = (bid: string) => batches.find((b) => b.id === bid)?.chapter;
  const perCh = new Map<number, { added: number; verses: number }>();
  for (const b of batches) { const x = perCh.get(b.chapter) ?? { added: 0, verses: 0 }; x.verses += b.verse_ids.length; perCh.set(b.chapter, x); }
  for (const e of added) { const ch = chapterOf(e.batch_id); if (ch == null) continue; perCh.get(ch)!.added += e.entries.length; }

  const escByTrigger = new Map<string, number>();
  for (const e of escalations) escByTrigger.set(e.trigger, (escByTrigger.get(e.trigger) ?? 0) + 1);
  const nVerses = verses.length || 1;

  const md = [
    `# KJME pilot report: ${store.state.run_id}`,
    ``,
    `Generated ${new Date().toISOString()}.`,
    ``,
    `## Summary`,
    ``,
    `| | |`, `|---|---|`,
    `| Verses with text | ${verses.length} (${nAccepted} accepted, ${nPending} pending human) |`,
    `| Batches decided | ${latestDecision.size} |`,
    `| Total cost | $${total.toFixed(3)} |`,
    `| Cost per verse | $${(total / nVerses).toFixed(4)} |`,
    `| Reviewer top-pick agreement, round 1 | ${pct(agreeR1, nCmp)} |`,
    `| Reviewer top-pick agreement, final | ${pct(agreeFinal, nCmp)} |`,
    `| Batches that went to debate | ${debatedN} of ${nCmp} |`,
    `| Escalations per 100 verses | ${((escalations.length / nVerses) * 100).toFixed(1)} |`,
    `| Reference lookups (tool calls) | ${lookups.length} |`,
    `| Consistency groups judged | ${consistency.length} (${consistency.filter((c) => c.status === "patch_pending_review").length} with patches to review) |`,
    ``,
    `## Cost by agent`,
    ``,
    `| Agent | Calls | Failed | Input tok | Cached tok | Output tok | Cost |`, `|---|---|---|---|---|---|---|`,
    ...[...byAgent].map(([a, x]) => `| ${a} | ${x.calls} | ${x.fails} | ${x.input} | ${x.cache} | ${x.output} | $${x.cost.toFixed(3)} |`),
    ``,
    `## Who won`,
    ``,
    `| Winner | Batches |`, `|---|---|`,
    ...[...wins].sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`),
    ``,
    `## Translator check failures (first attempt)`,
    ``,
    `| Translator | Failed / total |`, `|---|---|`,
    ...[...firstFail].map(([k, [f, t]]) => `| ${k} | ${f} / ${t} |`),
    ``,
    `## Escalations by trigger`,
    ``,
    escalations.length ? [`| Trigger | Count |`, `|---|---|`, ...[...escByTrigger].map(([k, v]) => `| ${k} | ${v} |`)].join("\n") : `None.`,
    ``,
    ...escalations.filter((e) => e.status === "open").map((e) => `- **${e.batch_id}** (${e.trigger}): ${e.question ?? ""} Recommended: \`${e.recommended_candidate ?? e.recommendation ?? "n/a"}\``),
    ``,
    `## New glossary entries per 100 verses, by chapter`,
    ``,
    `| Chapter | Verses | New entries | Per 100 verses |`, `|---|---|---|---|`,
    ...[...perCh].sort((a, b) => a[0] - b[0]).map(([ch, x]) => `| ${ch} | ${x.verses} | ${x.added} | ${((x.added / (x.verses || 1)) * 100).toFixed(1)} |`),
    ``,
    `This should fall chapter over chapter. If it does not, a full run will drift.`,
    ``,
  ].join("\n");

  // Viewer
  const rows = verses.sort((a: any, b: any) => {
    const [, ca, va] = a.id.split("."), [, cb, vb] = b.id.split(".");
    return +ca - +cb || +va - +vb;
  }).map((v: any) => {
    const marks = [...(v.changes ?? []).filter((c: any) => !c.auto).map((c: any) => ({ s: c.update.start, e: c.update.end, k: "chg" })),
      ...(v.pronoun_marks ?? []).filter((m: any) => m.number === "pl").map((m: any) => ({ s: m.end, e: m.end, k: "pl" }))].sort((a, b) => a.s - b.s || (a.k === "pl" ? 1 : -1));
    let html = "", pos = 0;
    for (const m of marks) {
      if (m.s < pos) continue;
      html += esc(v.text.slice(pos, m.s));
      if (m.k === "chg") { html += `<mark>${esc(v.text.slice(m.s, m.e))}</mark>`; pos = m.e; }
      else { html += `<sup class="pl">pl</sup>`; pos = m.s; }
    }
    html += esc(v.text.slice(pos));
    const notes = (v.changes ?? []).filter((c: any) => !c.auto).map((c: any) => `<li><span class="cat">${esc(c.category.replace("_", " "))}</span> <s>${esc(c.kjv.text)}</s> → ${esc(c.update.text)}<br><span class="why">${esc(c.reason)}</span></li>`).join("");
    const mech = (v.changes ?? []).filter((c: any) => c.auto).length;
    return `<article class="${v.status}"><div class="ref">${esc(ref(v.id))}${v.status === "pending_human" ? ' <span class="badge">pending human</span>' : ""}</div>
<p class="kjv">${esc(source.get(v.id)?.text ?? "")}</p><p class="kjme">${html}</p>
<ul class="margin">${notes}${mech ? `<li class="mech">${mech} pronoun and verb-form updates (mechanical)</li>` : ""}</ul></article>`;
  }).join("\n");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>KJME Pilot Viewer</title><style>
:root{--bg:#fbfaf7;--fg:#1c1b19;--muted:#6b6862;--line:#e6e3dc;--mark:#fdecc8;--accent:#8a4b16;--badge:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#161513;--fg:#ece9e2;--muted:#a19d95;--line:#2c2a27;--mark:#4a3a17;--accent:#e0a36b;--badge:#f2a7a1}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 Georgia,serif}
main{max-width:980px;margin:0 auto;padding:32px 16px}
h1{font-weight:500;font-size:32px;margin:0 0 4px}.sub{color:var(--muted);font:14px system-ui,sans-serif;margin:0 0 24px}
article{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:4px 24px;padding:16px 0;border-top:1px solid var(--line)}
@media (max-width:700px){article{grid-template-columns:minmax(0,1fr)}}
.ref{grid-column:1/-1;font:600 13px system-ui,sans-serif;color:var(--muted)}
.kjv{margin:0;color:var(--muted);font-size:15px}.kjme{margin:0;font-size:18px}
.kjv,.kjme{grid-column:1}.margin{grid-column:2;grid-row:2/4;margin:0;padding:0;list-style:none;font:13px/1.45 system-ui,sans-serif}
@media (max-width:700px){.margin{grid-column:1;grid-row:auto}}
.margin li{margin:0 0 8px}.cat{font-weight:600;color:var(--accent);text-transform:capitalize}.why{color:var(--muted)}.mech{color:var(--muted)}
mark{background:var(--mark);color:inherit;border-radius:3px;padding:0 2px}sup.pl{font:600 10px system-ui,sans-serif;color:var(--accent);margin-left:1px}
.badge{color:var(--badge);font-weight:600}
</style></head><body><main><h1>King James Margin Edition: pilot</h1>
<p class="sub">Run ${esc(store.state.run_id)}. Grey: KJV 1769. Below it: the accepted update, with changes highlighted and plural "you" marked. Margin: every change and its reason. Not a release.</p>
${rows}</main></body></html>`;
  return { md, html };
}

export function writeReport(store: Store, source: Map<string, SourceVerse>): void {
  const { md } = buildReport(store, source);
  writeFileSync(store.path("report.md"), md);
  const v = writeViewer(store, source);
  if (v.issues) console.log(`Viewer: ${v.issues} display issues found; see viewer-verification.json`);
}
