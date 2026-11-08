// Deterministic mock model, for dry runs without API keys. It exercises every path
// (glossary use, a meaning failure, debate, selection) but its "judgment" is scripted.
import type { CallRequest } from "./llm.js";
import { tokenize, matchCase } from "./text.js";

function inputOf(req: CallRequest): any {
  const cut = req.user.indexOf("\n\nYour previous reply failed");
  return JSON.parse(cut >= 0 ? req.user.slice(0, cut) : req.user);
}

function translate(input: any, persona: string) {
  const allow = (g: any) => g.update !== "KEEP" && g.status !== "rejected" && !/\s/.test(g.kjv_form) &&
    (persona === "clarity" || (persona === "minimalist" ? g.category === "shifted_meaning" : g.kjv_form !== "let"));
  return {
    verses: input.verses.map((v: any) => {
      let text = v.mechanical;
      const changes: any[] = [];
      for (const g of input.glossary ?? []) {
        if (!allow(g) || (g.exceptions ?? []).includes(v.id)) continue;
        const kt = tokenize(v.kjv).find((t) => t.norm === g.kjv_form.toLowerCase());
        if (!kt) continue;
        const toks = tokenize(text);
        const mt = toks.find((t) => t.norm === g.kjv_form.toLowerCase());
        if (!mt) continue;
        const rep = matchCase(mt.text, g.update);
        text = text.slice(0, mt.start) + rep + text.slice(mt.end);
        changes.push({ kjv: kt.text, update: rep, category: g.category, reason: `Glossary ${g.id} (R3/R4).`, glossary_id: g.id });
      }
      return { id: v.id, text, changes };
    }),
    glossary_proposals: [], notes: `mock ${persona}`,
  };
}

function review(input: any, auditor: boolean) {
  const cands = input.candidates.map((c: any) => {
    const misread = c.changes.some((ch: any) => /^let$/i.test(ch.kjv)); // scripted G1 failure: "let" (allow) read as "hinder"
    const g1 = auditor && misread ? "fail" : "pass";
    const n = c.changes.filter((ch: any) => !ch.auto).length;
    return {
      label: c.label,
      gates: { G1: g1, G2: c.check_report.gates_from_code.G2, G3: c.check_report.gates_from_code.G3, G4: c.check_report.gates_from_code.G4, G5: "pass" },
      gate_notes: g1 === "fail" ? ["'let' here means allow, not hinder (R4, G1)"] : [],
      scores: auditor ? null : { S1: Math.max(1, 5 - Math.floor(n / 4)), S2: Math.min(5, 2 + Math.ceil(n / 2)), S3: 4, S4: 4 },
      change_comments: [],
    };
  });
  const ok = cands.filter((c: any) => Object.values(c.gates).every((g) => g === "pass"));
  const score = (c: any) => (c.scores ? c.scores.S1 * 0.4 + c.scores.S2 * 0.3 + c.scores.S3 * 0.2 + c.scores.S4 * 0.1 : 0);
  const ranking = ok.sort((a: any, b: any) => score(b) - score(a) || a.label.localeCompare(b.label)).map((c: any) => c.label);
  return { candidates: cands, ranking, summary: `mock ${auditor ? "auditor" : "scorer"} review`, round2_changes: input.other_review ? [] : undefined };
}

function coordinate(input: any) {
  if (!input.eligible?.length) return { outcome: "escalate", winner: null, rationale: "No eligible candidate (mock).", cites: [], confidence: 0.3, escalation: { trigger: "no_eligible", question: "Which candidate should stand?", options: input.candidates.map((c: any) => ({ label: c.author, ref: c.id })), recommendation: input.candidates[0]?.id } };
  const scorer = input.reviews.find((r: any) => r.reviewer === "reviewer-scorer");
  const best = [...input.eligible].sort((a: string, b: string) => (scorer?.candidates[b]?.weighted ?? 0) - (scorer?.candidates[a]?.weighted ?? 0))[0];
  return { outcome: "select", winner: best, glossary_proposals: [], rationale: `Selected ${best}: highest scorer total among eligible (mock).`, cites: [scorer?.review_id], confidence: 0.85, escalation: null };
}

export function mockRespond(req: CallRequest): string {
  const input = inputOf(req);
  if (req.agent.startsWith("translator-")) return JSON.stringify(translate(input, req.agent.replace("translator-", "")));
  if (req.agent === "reviewer-scorer") return JSON.stringify(review(input, false));
  if (req.agent === "reviewer-meaning-auditor") return JSON.stringify(review(input, true));
  if (req.agent === "coordinator") return JSON.stringify(coordinate(input));
  if (req.agent === "consistency-editor") return JSON.stringify({ verdict: "no_change", reason: "Senses differ or renderings already align (mock).", patches: [], glossary_proposals: [] });
  return "{}";
}
