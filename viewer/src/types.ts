// The viewer data contract. Produced by harness/src/viewer.ts (buildViewerData); this app only renders it.

/** One piece of display text. `c` holds classes (it, chg, cat-*, mech, ins, del), `k` the change ids it covers, `m` a pronoun number marker. */
export interface Run { t: string; c?: string; k?: string; m?: "pl" | "sg" }

export interface Evidence { lookup_id: string; note?: string }

export interface Change {
  id: string; kjv: string; update: string; category: string; reason: string;
  glossary_id?: string; auto: boolean; uncertain: boolean; evidence: Evidence[];
}

export interface Verse {
  id: string; ref: string; ch: number; v: number; status: string; batch: string; decision: string;
  runs: { read: Run[]; kjv: Run[]; inline: Run[] };
  issues: string[];
  changes: Change[];
}

export interface Gates { G1?: string; G2?: string; [k: string]: string | undefined }

export interface ReviewOfCandidate {
  gates: Gates; scores: Record<string, number> | null; weighted: number | null; notes: string[]; comments: unknown[];
}

export interface BatchReview { reviewer: string; round: number; id: string; summary: string; candidates: Record<string, ReviewOfCandidate> }

export interface Candidate {
  id: string; author: string; eligible: boolean | null; passed_checks: boolean | null;
  verses: Record<string, { text: string; runs: Run[] }>;
}

export interface Decision {
  id: string; outcome: string; winner: string | null; winner_author: string | null; decided_by: string;
  confidence: number | null; rationale: string; debate: { ran?: boolean } | null; eligible: string[]; supersedes: string | null; at: string;
}

export interface Batch {
  id: string; verses: string[];
  decision: Decision | null;
  reviews: BatchReview[];
  candidates: Candidate[];
  escalation: { id: string; status: string; trigger: string; question: string; resolved_by: string | null; resolution: string | null } | null;
}

export interface ChangePair { from: string; to: string; verse: string }

export interface DecisionOption {
  ids: string[]; choose: string; authors: string[]; recommended: boolean; eligible: boolean; failed_checks: boolean;
  review_fails: string[]; fail_notes: { reviewer: string; note: string }[];
  focus_changes: ChangePair[]; other_changes: ChangePair[]; keeps_kjv: boolean;
  verses: Record<string, { text: string; runs: Run[]; changes: { from: string; to: string }[] }>;
}

/** An escalated passage: the human call, and the real choices grouped by the wording they produce. */
export interface PassageDecision {
  batch: string; status: string; resolved_by: string | null; resolution: string | null;
  passage: string; focus: string; verses: string[]; focus_verses: string[];
  question: string; context: string; why: string; rerun: string; technical: string; trigger: string;
  options: DecisionOption[];
}

export interface GlossaryEntry {
  id: string; kjv_form: string; forms: string[]; sense: string; update: string; category: string;
  status: string; uses: number; examples: string[]; notes: string; seed: boolean;
}

export interface RunSummary {
  id: string; generated: string; spend_usd: number;
  verses: number; accepted: number; pending: number; batches: number; debated: number;
  open_escalations: number; glossary_conflicts: number; changes: number; mechanical: number;
  wins: Record<string, number>;
  verification: { checked: number; issues: { verse: string; issue: string }[] };
}

export interface ViewerData {
  decisions: PassageDecision[];
  run: RunSummary;
  book: string;
  chapters: number[];
  verses: Verse[];
  batches: Record<string, Batch>;
  glossary: GlossaryEntry[];
  lookups: Record<string, { agent: string; query: unknown; summary: string }>;
}

/** data/index.json: every book exported into the app. Written by `bun src/cli.ts export-viewer`. */
export interface ManifestBook { code: string; book: string; run: string; file: string; verses: number; edits: number; generated: string }
export interface Manifest { books: ManifestBook[] }
