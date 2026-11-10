// The escalation fields the pipeline sets itself: a fixed trigger, and for the code's own triggers a question
// and a `disputed` list a human can act on, so the provisional text holds only the words in doubt.
import type { Change } from "./checks.js";
import type { Disputed } from "./hold.js";

/** Triggers the coordinator may give. */
const COORDINATOR_TRIGGERS = ["no_eligible", "g1_dispute", "escalate_only_term", "uncertain_sense", "low_confidence"] as const;
/** Every trigger an escalation record can carry: the coordinator's, and those the code raises. */
const TRIGGERS = [...COORDINATOR_TRIGGERS, "merge_failed_checks", "merge_new_wording", "invalid_selection", "glossary_conflict", "public_feedback", "coordinator"] as const;
type Trigger = (typeof TRIGGERS)[number];

const ALIASES: [RegExp, Trigger][] = [
  [/no.?eligible|none.?eligible|ineligible/, "no_eligible"],
  [/g1|gate|dispute|disagree/, "g1_dispute"],
  [/escalate.?only|locked/, "escalate_only_term"],
  [/confiden/, "low_confidence"],
  [/uncertain|sense|ambigu/, "uncertain_sense"],
];

/** The coordinator's trigger as one of the fixed values. Free-form names are mapped by meaning; anything else is `coordinator`. */
export function normalizeTrigger(t: unknown, eligible: number): Trigger {
  const s = String(t ?? "").toLowerCase().trim();
  if ((TRIGGERS as readonly string[]).includes(s)) return s as Trigger;
  const hit = ALIASES.find(([re]) => re.test(s));
  if (hit) return hit[1];
  return eligible ? "coordinator" : "no_eligible";
}

interface Doubt { verse_id: string; kjv: string; question?: string }
export interface Asked { question: string; disputed: Disputed[]; focus_verses: string[] }

const focusOf = (d: Disputed[]) => [...new Set(d.map((x) => x.verse_id))];

/** A low-confidence escalation built from the coordinator's doubts, or a general question when it gave none. */
export function lowConfidence(confidence: unknown, threshold: number, doubts: unknown): Asked {
  const ds = (Array.isArray(doubts) ? doubts : []).filter((d): d is Doubt => !!d?.verse_id && !!d?.kjv);
  const disputed = ds.map((d) => ({ verse_id: d.verse_id, kjv: d.kjv }));
  const question = ds.length
    ? ds.map((d) => `${d.verse_id} "${d.kjv}": ${d.question || "is the update right?"}`).join(" ")
    : `The coordinator's confidence (${confidence}) is below ${threshold} and it named no word in doubt: is the recommended text right as a whole?`;
  return { question, disputed, focus_verses: focusOf(disputed) };
}

/** An escalation for changes marked uncertain or touching escalate-only terms: one question per change. */
export function uncertainChanges(changes: Change[]): Asked {
  const disputed = changes.map((c) => ({ verse_id: c.verse_id, kjv: c.kjv.text }));
  const question = changes.map((c) => `${c.verse_id}: should "${c.kjv.text}" become "${c.update.text}"? (${c.reason || "marked uncertain"})`).join(" ");
  return { question, disputed, focus_verses: focusOf(disputed) };
}
