// Rail cards: one per group of identical edits, and one per passage decision.
import { useEffect, useRef } from "react";
import type { PassageDecision, ViewerData } from "../types";
import { groupLabel, letter, who, type DecisionItem, type Group, type Item, type Model } from "../model";
import type { Status } from "./Doc";
import { Diff, HowDecided, PlainRuns, Reason, Snippet } from "./bits";

export interface CardApi {
  data: ViewerData;
  model: Model;
  active: string | null;
  status: (key: string) => Status;
  note: (key: string) => string;
  choices: Record<string, string>;
  focusNote: number;
  open: (key: string) => void;
  approve: (key: string) => void;
  flag: (key: string) => void;
  undo: (key: string) => void;
  setNote: (key: string, text: string) => void;
  pick: (batch: string, id: string) => void;
  jump: (vid: string) => void;
  gloss: (id: string) => void;
}

function SingleExtras({ it, api }: { it: Item; api: CardApi }) {
  const { v, c } = it, b = api.data.batches[v.batch];
  const ev = (c.evidence ?? []).map((e, i) => {
    const l = api.data.lookups[e.lookup_id];
    return <p key={i} className="ev">{e.note ?? ""}{l ? "\n\n" + l.summary : ""}</p>;
  });
  const cands = (b?.candidates ?? []).filter((x) => x.verses[v.id]);
  const win = b?.decision?.winner;
  const rat = b?.decision?.rationale;
  return (
    <>
      {ev.length > 0 && <details className="dd" name="more"><summary>Evidence</summary><div className="dd-b">{ev}</div></details>}
      {cands.length > 0 && (
        <details className="dd" name="more">
          <summary>Compare {cands.length} translations</summary>
          <div className="dd-b">
            {cands.map((x) => (
              <div key={x.id} className={`cand${x.id === win ? " win" : ""}`}>
                <div className="w">
                  <b style={{ color: "var(--ink)" }}>{who(x.author)}</b>
                  {x.id === win && <span className="tag ok">Chosen</span>}
                  {(b.reviews ?? []).map((r) => {
                    const g = r.candidates[x.id];
                    if (!g) return null;
                    const f = g.gates.G1 === "fail";
                    return <span key={r.reviewer} className={`tag ${f ? "bad" : "ok"}`}>{who(r.reviewer)} {f ? "✗" : "✓"}</span>;
                  })}
                </div>
                <div className="t"><PlainRuns runs={x.verses[v.id].runs} /></div>
              </div>
            ))}
          </div>
        </details>
      )}
      {rat && <details className="dd" name="more"><summary>Why this passage reads this way</summary><div className="dd-b"><p className="ev">{rat}</p></div></details>}
    </>
  );
}

function Actions({ gr, api }: { gr: Group; api: CardApi }) {
  const st = api.status(gr.key), n = gr.items.length;
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (api.focusNote && st === "flag") ref.current?.focus(); }, [api.focusNote, st]);
  if (st === "ok") return (
    <div className="acts"><span className="done-l">✓ Approved{n > 1 ? ` in all ${n} places` : ""}</span><button className="lnk" onClick={() => api.undo(gr.key)}>Undo</button></div>
  );
  const flagged = st === "flag";
  return (
    <>
      <div className="acts">
        <button className="act ok" onClick={() => api.approve(gr.key)}>{n > 1 ? `Approve all ${n}` : "Looks right"} <kbd>A</kbd></button>
        <button className={`act fl${flagged ? " on" : ""}`} onClick={() => api.flag(gr.key)}>{flagged ? "Flagged" : "Flag"} <kbd>F</kbd></button>
      </div>
      {flagged && (
        <textarea ref={ref} className="noteb" id="note" rows={2} placeholder="What's wrong? (optional)"
          defaultValue={api.note(gr.key)} onInput={(e) => api.setNote(gr.key, e.currentTarget.value)} />
      )}
    </>
  );
}

function GroupBody({ gr, api }: { gr: Group; api: CardApi }) {
  const one = gr.items.length === 1, it = gr.items[0], g = gr.gloss;
  let mid;
  if (gr.key === "routine") {
    const pairs = [...new Map(gr.items.map((x) => [x.c.kjv.toLowerCase() + "→" + x.c.update, x])).values()];
    mid = (
      <>
        <p className="why">Old pronouns, verb endings and spellings that follow a fixed table. The meaning does not change.</p>
        <div className="pairs">{pairs.map((x) => <span key={x.key}><Diff a={x.c.kjv} b={x.c.update} /></span>)}</div>
      </>
    );
  } else {
    mid = (
      <>
        <div className="big"><span className="old">{it.c.kjv || "∅"}</span><span className="ar">→</span><span className="new">{it.c.update || "removed"}</span></div>
        <p className="why"><Reason text={it.c.reason} /></p>
      </>
    );
  }
  return (
    <div className="cb">
      {mid}
      {one
        ? <p className="ctx"><Snippet v={it.v} cid={it.c.id} /></p>
        : (
          <div className="places">
            {gr.items.map((x) => (
              <button key={x.key} className="place" onClick={() => api.jump(x.v.id)}><span className="ref">{x.v.ch}:{x.v.v}</span><span><Snippet v={x.v} cid={x.c.id} /></span></button>
            ))}
          </div>
        )}
      <div className="meta">
        {g && <button className="tag" onClick={() => api.gloss(g.id)}>Glossary · {g.status}</button>}
        {one ? <HowDecided b={api.data.batches[it.v.batch]} /> : <span>{gr.items.length} places</span>}
      </div>
      <Actions gr={gr} api={api} />
      {one && gr.key !== "routine" && <SingleExtras it={it} api={api} />}
    </div>
  );
}

export function GroupCard({ gr, api }: { gr: Group; api: CardApi }) {
  const on = api.active === gr.key, st = api.status(gr.key), n = gr.items.length;
  const ref = n > 1 ? `×${n}` : `${gr.items[0].v.ch}:${gr.items[0].v.v}`;
  const mark = st === "ok" ? <span className="chk">✓</span> : st === "flag" ? <span className="flg">!</span> : <span className={`dot c-${gr.color}`}></span>;
  return (
    <div className={`card${on ? " on" : ""}${st === "ok" ? " ok" : ""}`} data-card={gr.key}>
      <button className="card-h" aria-expanded={on} onClick={() => api.open(gr.key)}>
        {mark}
        <span className="sum">{on ? <span className={`lab c-${gr.color}`}>{groupLabel(gr)}</span> : gr.key === "routine" ? <b>Routine forms</b> : <Diff a={gr.c.kjv} b={gr.c.update} />}</span>
        <span className="ref">{ref}</span>
      </button>
      {on && <GroupBody gr={gr} api={api} />}
    </div>
  );
}

const short = (model: Model, vid: string) => { const v = model.byId.get(vid); return v ? `${v.ch}:${v.v}` : vid; };

type Option = PassageDecision["options"][number];
const reviewerName = (r: string) => (r === "auditor" ? "auditor" : "scorer");

/** What the reviewers made of an option. */
function Verdict({ o }: { o: Option }) {
  if (o.review_fails.length) return <span className="tag bad">Flagged by {o.review_fails.map(reviewerName).join(" and ")}</span>;
  return o.failed_checks ? <span className="tag bad">Breaks a rule</span> : <span className="tag ok">Passed both reviewers</span>;
}

/** One option for a passage, shown as the text it would produce. */
function OptionCard({ d, o, i, sel, api }: { d: PassageDecision; o: Option; i: number; sel: boolean; api: CardApi }) {
  return (
    <div className={`opt${sel ? " sel" : ""}`}>
      <div className="oh">
        <span className="letter">{letter(i)}</span>
        <span className="ot">
          {o.keeps_kjv ? "Keep the KJV wording" : o.focus_changes.map((c, j) => <span key={j}>{j > 0 && "; "}<s>{c.from || "∅"}</s> → {c.to || "∅"}</span>)}
        </span>
        {o.recommended && <span className="tag">Recommended</span>}
      </div>
      <div className="ov">
        {d.focus_verses.map((vid, j) => (
          <span key={vid}>{j > 0 && <br />}<span className="r">{short(api.model, vid)}</span><PlainRuns runs={o.verses[vid].runs} /></span>
        ))}
      </div>
      {o.other_changes.length > 0 && <p className="also">Also changes {o.other_changes.map((c) => `${short(api.model, c.verse)} ${c.from} → ${c.to}`).join(", ")}</p>}
      <div className="of">
        <Verdict o={o} />
        <button className="pick" onClick={() => api.pick(d.batch, o.choose)}>{sel ? "Chosen" : "Choose " + letter(i)}</button>
      </div>
      {o.fail_notes.length > 0 && (
        <details className="dd" name="more">
          <summary>Why it was flagged</summary>
          <div className="dd-b">{o.fail_notes.map((f, j) => <p key={j} className="ev"><b>{f.reviewer === "auditor" ? "Auditor" : "Scorer"}:</b> {f.note}</p>)}</div>
        </details>
      )}
    </div>
  );
}

/** Who decided, or that it is still waiting. */
function DecisionState({ d, changed, ci }: { d: PassageDecision; changed: boolean; ci: number }) {
  if (d.status !== "resolved") return <span className="tag call">Waiting for your call</span>;
  return <span className={`tag ${changed ? "call" : "ok"}`}>{changed ? `Changed to option ${letter(ci)}, not sent yet` : `Decided by ${d.resolved_by} · option ${letter(ci)}`}</span>;
}

function DecisionBody({ x, api }: { x: DecisionItem; api: CardApi }) {
  const d = x.d, picked = api.choices[d.batch], ch = picked || d.resolution || null;
  const changed = !!picked && picked !== d.resolution;
  return (
    <div className="cb">
      <div className="meta"><DecisionState d={d} changed={changed} ci={d.options.findIndex((o) => o.choose === ch)} /></div>
      <p className="ctx2">{d.context}</p>
      <div className="opts">{d.options.map((o, i) => <OptionCard key={o.choose} d={d} o={o} i={i} sel={o.choose === ch} api={api} />)}</div>
      {d.why && <p className="why"><b>Why it's recommended.</b> {d.why}</p>}
      {d.rerun && <p className="note">{d.rerun}</p>}
      {changed && <p className="why" style={{ color: "var(--muted)" }}>The text keeps the earlier choice until the change is sent and the passage is re-run.</p>}
    </div>
  );
}

export function DecisionCard({ x, api }: { x: DecisionItem; api: CardApi }) {
  const on = api.active === x.key;
  return (
    <div className={`card${on ? " on" : ""}`} data-card={x.key}>
      <button className="card-h" aria-expanded={on} onClick={() => api.open(x.key)}>
        <span className="dot c-call"></span>
        <span className="sum">{on ? <span className="q">{x.d.question}</span> : x.d.question}</span>
        <span className="ref">{x.d.focus}</span>
      </button>
      {on && <DecisionBody x={x} api={api} />}
    </div>
  );
}
