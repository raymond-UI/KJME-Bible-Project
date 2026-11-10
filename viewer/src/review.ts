// Review state, kept pure so it can be tested without a browser: checks, marks, what to open next, keys, the copy text.
import { letter, type DecisionItem, type Group } from "./model";
import type { PassageDecision } from "./types";

export type Mark = "ok" | "flag";
export type Review = Record<string, { s: Mark; note: string }>;

export const statusIn = (r: Review, k: string): Mark | null => r[k]?.s ?? null;

/** "By rule" checks follow ratified glossary rules or routine forms, so they start out approved. */
export function seedRules(r: Review, ordered: Group[]): Review {
  const out = { ...r };
  for (const g of ordered) if (g.tier === "rule" && !out[g.key]) out[g.key] = { s: "ok", note: "" };
  return out;
}

/** Set or clear a check, keeping any note. */
export function withMark(r: Review, key: string, s: Mark | null): Review {
  const out = { ...r };
  if (s) out[key] = { s, note: r[key]?.note || "" };
  else delete out[key];
  return out;
}

export const firstOpen = (ordered: Group[], r: Review): Group | null => ordered.find((g) => !statusIn(r, g.key)) ?? null;

/** The next check left after `fromKey`, wrapping round to the first. */
export function nextOpen(ordered: Group[], fromKey: string, r: Review): Group | null {
  const i = ordered.findIndex((g) => g.key === fromKey);
  return ordered.slice(i + 1).find((g) => !statusIn(r, g.key)) ?? firstOpen(ordered, r);
}

export type KeyAction = "approve" | "flag" | "rail" | "next" | "prev";
const KEYS = new Map<string, KeyAction>([["a", "approve"], ["f", "flag"], ["]", "rail"], ["j", "next"], ["k", "prev"]]);
const ARROWS = new Map<string, KeyAction>([["ArrowDown", "next"], ["ArrowUp", "prev"]]);

/** What a key does. Arrows only move between checks when nothing else has focus, so they still scroll a focused list. */
export const keyAction = (key: string, onBody: boolean): KeyAction | null => KEYS.get(key) ?? (onBody ? ARROWS.get(key) : undefined) ?? null;

/** Decisions whose choice differs from the one the run used. */
export const changedDecisions = (decs: DecisionItem[], choices: Record<string, string>) =>
  decs.filter((x) => choices[x.d.batch] && choices[x.d.batch] !== x.d.resolution);

/** Counts for the rail: checks left, edits checked, flags, and changed decisions. */
export function tally(m: { groups: Group[]; decs: DecisionItem[] }, r: Review, choices: Record<string, string>) {
  const checked = m.groups.filter((g) => statusIn(r, g.key));
  return {
    left: m.groups.length - checked.length,
    doneEdits: checked.reduce((n, g) => n + g.items.length, 0),
    flagged: m.groups.filter((g) => statusIn(r, g.key) === "flag"),
    changed: changedDecisions(m.decs, choices),
  };
}

const places = (g: Group, book: string) => g.items.map((x) => x.v.ref.replace(book + " ", "")).join(", ");
const flagLine = (g: Group, book: string, note: string | undefined) =>
  `- ${g.key === "routine" ? "Routine forms" : `${g.c.kjv} → ${g.c.update}`} (${places(g, book)})${note ? `: ${note}` : ""}`;
const decisionLine = (d: PassageDecision, choice: string) =>
  `- ${d.passage}: option ${letter(d.options.findIndex((o) => o.choose === choice))} (${choice}), was ${d.resolution}`;
const section = (title: string, lines: string[]) => (lines.length ? `${title}:\n${lines.join("\n")}` : "");

/** The message Copy puts on the clipboard: flagged edits with their notes, and changed decisions. */
export function messageText(o: { runId: string; book: string; review: Review; flagged: Group[]; changed: DecisionItem[]; choices: Record<string, string> }): string {
  return [
    `KJME review of run ${o.runId}`,
    section("Flagged edits", o.flagged.map((g) => flagLine(g, o.book, o.review[g.key]?.note))),
    section("Decision changes", o.changed.map((x) => decisionLine(x.d, o.choices[x.d.batch]!))),
  ].filter(Boolean).join("\n\n");
}
