// The rail: progress, the tier steps, the list of checks or decisions, and the footer with Copy.
import { useEffect, useRef, type ReactNode } from "react";
import { TIERHELP, TIERS, type Group, type Tier } from "../model";
import type { Status } from "./Doc";

export type Mode = "review" | "calls";

const plural = (n: number, one: string, many = one + "s") => (n === 1 ? one : many);

export function Progress({ mode, left, done, total, decisions, back }: {
  mode: Mode; left: number; done: number; total: number; decisions: number; back: () => void;
}) {
  if (mode === "calls") return (
    <div className="prog" id="prog">
      <div className="pn"><button className="lnk" onClick={back}>← Back to review</button></div><div className="pt">Your {decisions} decisions</div>
    </div>
  );
  return (
    <div className="prog" id="prog">
      <div className="pn">{left ? <><b>{left}</b> {plural(left, "check")} left</> : <b>All checked</b>}</div>
      <div className="pt">{done} of {total} edits</div>
      <div className="pbar"><span style={{ width: `${total ? (done / total) * 100 : 0}%` }}></span></div>
    </div>
  );
}

function Step({ t, label, n, groups, tier, status, pick }: {
  t: Tier; label: string; n: number; groups: Group[]; tier: Tier; status: (k: string) => Status; pick: (t: Tier) => void;
}) {
  const gs = groups.filter((g) => g.tier === t), p = gs.filter((g) => !status(g.key)).length;
  if (!gs.length) return null;
  return (
    <button className="step" aria-pressed={tier === t} onClick={() => pick(t)}>
      <span className={`sn${p ? "" : " ok"}`}>{p ? n : "✓"}</span>{label}{p ? <> <i>{p}</i></> : null}
    </button>
  );
}

export function Steps(p: { groups: Group[]; tier: Tier; status: (k: string) => Status; pick: (t: Tier) => void }) {
  return <div className="steps" id="steps">{TIERS.map(([t, l], i) => <Step key={t} t={t} label={l} n={i + 1} {...p} />)}</div>;
}

/** One tier's checks: those left first, then the checked ones behind a button. The open card stays where it is. */
export function TierList({ tier, groups, active, status, left, flagged, showDone, toggleDone, card }: {
  tier: Tier; groups: Group[]; active: string | null; status: (k: string) => Status; left: number; flagged: number;
  showDone: boolean; toggleDone: () => void; card: (g: Group) => ReactNode;
}) {
  const inTier = groups.filter((g) => g.tier === tier);
  const isDone = (g: Group) => !!status(g.key) && g.key !== active;
  const todo = inTier.filter((g) => !isDone(g)), done = inTier.filter(isDone);
  return (
    <>
      {!left && (
        <div className="fin"><b>Every edit has a check.</b><span>{flagged ? `${flagged} flagged. Copy your notes below to send them back.` : "Nothing flagged. The text is ready for the next pass."}</span></div>
      )}
      {!inTier.some((g) => status(g.key)) && <p className="tierhelp">{TIERHELP[tier]}</p>}
      {todo.map(card)}
      {done.length > 0 && <button className="grp grpbtn" aria-expanded={showDone} onClick={toggleDone}>{showDone ? "Hide" : "Show"} {done.length} checked</button>}
      {showDone && done.map(card)}
    </>
  );
}

export function Foot({ mode, decisions, flagged, changed, copied, copy, showCalls }: {
  mode: Mode; decisions: number; flagged: number; changed: number; copied: boolean; copy: () => void; showCalls: () => void;
}) {
  const label = copied ? "Copied" : flagged ? `Copy ${flagged} ${plural(flagged, "flag")}` : "Copy changes";
  return (
    <div className="foot" id="foot">
      <span id="foottxt">{mode === "review" && <button className="lnk" onClick={showCalls}>Your {decisions} decisions</button>}</span>
      <button className="btn pri" id="cpmsg" hidden={!(flagged || changed)} onClick={copy}>{label}</button>
    </div>
  );
}

/** The bottom sheet's handle on narrow screens. */
export const SheetHandle = ({ toggle }: { toggle: () => void }) => (
  <button className="handle" id="handle" aria-label="Show suggestions" onClick={toggle}><span></span></button>
);

/** The collapsed rail: how many checks are left, and a way back. */
export const MiniRail = ({ left, expand }: { left: number; expand: () => void }) => (
  <button className="mini" id="mini" aria-label="Show suggestions" onClick={expand}>
    <b id="minin">{left || "✓"}</b><span>left</span>
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M8.5 3.5 5 7l3.5 3.5" /></svg>
  </button>
);

export const CollapseButton = ({ railc, collapse }: { railc: boolean; collapse: () => void }) => (
  <button className="railbtn" id="railbtn" aria-label={railc ? "Show suggestions" : "Collapse suggestions"} title="Collapse  ]" onClick={collapse}>
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="2" y="2.5" width="12" height="11" rx="2" /><path d="M10 2.5v11" /></svg>
  </button>
);

/** When the clipboard is blocked, the text to copy by hand, already selected. */
export function CopyFallback({ text }: { text: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ref.current?.select(); }, [text]);
  return <textarea ref={ref} rows={5} style={{ width: "100%" }} aria-label="Text to copy" readOnly value={text} />;
}
