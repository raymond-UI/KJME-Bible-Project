// Small shared pieces of rail markup.
import type { ReactNode } from "react";
import type { Batch, Run, Verse } from "../types";
import { cleanReason, who } from "../model";

/** old → new, as in the design's card titles. */
export const Diff = ({ a, b }: { a: string; b: string }) => (
  <><s>{a || "∅"}</s><span className="ar">→</span><b>{b || "removed"}</b></>
);

/** A candidate's or option's text with its insertions and deletions against the KJV. */
export const PlainRuns = ({ runs }: { runs: Run[] }) => (
  <>{runs.map((r, i) => (r.m ? null : r.c && /\bdel\b/.test(r.c) ? <del key={i}>{r.t}</del> : r.c && /\bins\b/.test(r.c) ? <ins key={i}>{r.t}</ins> : r.t))}</>
);

/** The verse as read, with one change highlighted. */
export const Snippet = ({ v, cid }: { v: Verse; cid: string }) => (
  <>{v.runs.read.map((r, i) => (r.m ? null : String(r.k ?? "").split(",").includes(cid) ? <span key={i} className="hl">{r.t}</span> : r.c === "it" ? <i key={i}>{r.t}</i> : r.t))}</>
);

export const Reason = ({ text }: { text: string }) => (
  <>{cleanReason(text).map((p, i) => (p.gid ? <span key={i} className="gid">{p.text}</span> : p.text))}</>
);

export function HowDecided({ b }: { b: Batch | undefined }): ReactNode {
  const d = b?.decision;
  if (!d) return null;
  if (d.decided_by && d.decided_by !== "coordinator") return <span className="tag call">Your call</span>;
  const conf = d.confidence != null ? ` · ${Math.round(d.confidence * 100)}% sure` : "";
  return d.outcome === "select" ? <span>From the {who(d.winner_author)} translation{conf}</span> : <span>Combined from several translations{conf}</span>;
}
