// Stage 10 (pilot form): code finds drift groups, the consistency editor judges each one.
// Patches are recorded and checked, not applied: a human reviews them in the pilot.
import { existsSync } from "node:fs";
import { readJson, newId, now } from "./util.js";
import { tokenize } from "./text.js";
import { materialize } from "./checks.js";
import { pretagVerse } from "./pretag.js";
import type { PipelineCtx } from "./pipeline.js";

export async function consistencyPass(ctx: PipelineCtx, book: string): Promise<number> {
  const p = ctx.store.path("accepted.json");
  if (!existsSync(p)) return 0;
  const accepted: Record<string, any> = readJson(p);
  const verses = Object.values(accepted).filter((v: any) => v.id.startsWith(book + ".") && v.status === "accepted");
  const renderings = new Map<string, Map<string, string[]>>(); // kjv key -> update -> verse ids
  for (const v of verses) for (const c of v.changes ?? []) {
    if (c.auto || /^pronoun_|^verb_form$/.test(c.category)) continue; // mechanical forms are uniform by construction
    const key = tokenize(c.kjv.text).map((t) => t.norm).join(" ");
    const m = renderings.get(key) ?? new Map();
    const u = c.update.text.toLowerCase();
    m.set(u, [...(m.get(u) ?? []), v.id]);
    renderings.set(key, m);
  }
  // Kept occurrences: the KJV form appears but was not changed in that verse.
  for (const [key, m] of renderings) {
    for (const v of verses) {
      const kt = tokenize(ctx.source.get(v.id)!.text).map((t) => t.norm).join(" ");
      if (!(" " + kt + " ").includes(" " + key + " ")) continue;
      const changedHere = [...m.values()].some((ids) => ids.includes(v.id));
      if (!changedHere) m.set("(kept)", [...(m.get("(kept)") ?? []), v.id]);
    }
  }
  const groups = [...renderings].filter(([, m]) => m.size > 1);
  let n = 0;
  for (const [key, m] of groups) {
    const ids = [...new Set([...m.values()].flat())].slice(0, 12);
    const group = {
      id: newId("G"), type: "divergent_rendering", kjv_form: key,
      verses: ids.map((id) => ({ verse_id: id, batch_id: accepted[id].batch_id, kjv_text: ctx.source.get(id)!.text, accepted_text: accepted[id].text, changes: (accepted[id].changes ?? []).filter((c: any) => !c.auto).map((c: any) => ({ kjv: c.kjv.text, update: c.update.text, category: c.category, reason: c.reason, glossary_id: c.glossary_id })) })),
      renderings: Object.fromEntries(m),
    };
    const glossary = ctx.glossary.relevant(ids.map((id) => ctx.source.get(id)!.text)).filter((g) => g.kjv_form.toLowerCase() === key || (g.forms ?? []).some((f) => f.toLowerCase() === key));
    ctx.log(`consistency: "${key}" ${JSON.stringify(Object.fromEntries([...m].map(([u, v]) => [u, v.length])))}`);
    let out: any;
    try { out = await ctx.agents.run("consistency-editor", { book, group, glossary }, { batch_id: `${book}.consistency`, purpose: "consistency" }); }
    catch (e: any) { ctx.log(`  failed: ${e.message}`); continue; }
    const checks = (out.patches ?? []).map((pt: any) => {
      const src = ctx.source.get(pt.verse_id);
      if (!src) return { verse_id: pt.verse_id, passed: false, detail: "unknown verse" };
      const v = pretagVerse(src, ctx.tables, ctx.locked, ctx.glossary);
      const r = materialize({ verses: [{ id: pt.verse_id, text: pt.text, changes: pt.changes ?? [] }] }, { id: `patch-${pt.verse_id}`, batch_id: accepted[pt.verse_id]?.batch_id, author: "consistency-editor", attempt: 1 }, [v], ctx.tables, ctx.glossary);
      return { verse_id: pt.verse_id, passed: r.report.passed, failures: r.report.results.filter((x) => x.severity === "hard").map((x) => x.detail) };
    });
    ctx.store.add("consistency", { group, result: out, patch_checks: checks, status: out.verdict === "patch" ? "patch_pending_review" : "no_change", at: now() });
    n++;
  }
  return n;
}
