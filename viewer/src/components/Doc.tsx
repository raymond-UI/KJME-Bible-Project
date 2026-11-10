// The text: one clean document. Every change is an underline; picking one opens it in the rail.
import { Fragment, memo, type ReactNode } from "react";
import type { Run, Verse, ViewerData } from "../types";
import type { Model, View } from "../model";

export type Status = "ok" | "flag" | null;

interface Props {
  data: ViewerData;
  model: Model;
  view: View;
  mech: boolean;
  focus: boolean;
  active: string | null;
  status: (key: string) => Status;
  onPick: (key: string, from: "doc" | "mark") => void;
}

export const verseDomId = (vid: string) => "v-" + vid.replace(/\./g, "-");

/** What every run needs to know to draw itself. */
interface Ctx { model: Model; mech: boolean; active: string | null; status: (key: string) => Status; onPick: Props["onPick"] }
type Drawn = { nodes: ReactNode[]; hit: boolean };

const DEL = /\bdel\b/;
const stateCls = (st: Status) => (st === "ok" ? " done" : st === "flag" ? " flagged" : "");
const waitCls = (v: Verse) => (v.status !== "accepted" ? " wait" : "");

/** A routine (mechanical) update: shown only when "show routine updates" is on. */
function mechRun(r: Run, i: number, as: View, mech: boolean): ReactNode {
  const del = DEL.test(r.c ?? "");
  if (!mech) return as === "track" && del ? null : r.t;
  if (as !== "track") return <span key={i} className="m">{r.t}</span>;
  return del ? <del key={i} className="m">{r.t}</del> : <ins key={i} className="m">{r.t}</ins>;
}

/** A reviewable change: an underline that opens its check. */
function changeRun(x: Ctx, v: Verse, r: Run, i: number, as: View): { node: ReactNode; on: boolean } {
  const it = x.model.itemBy.get(v.id + "|" + String(r.k ?? "").split(",").find(Boolean));
  if (!it) return { node: r.t, on: false };
  const gr = x.model.groupBy.get(it.group)!, on = x.active === gr.key;
  const a = {
    className: `u u-${gr.color}${stateCls(x.status(gr.key))}${as === "kjv" ? " k" : ""}${on ? " on" : ""}`,
    "data-g": gr.key, "data-key": it.key, onClick: () => x.onPick(gr.key, "doc"),
  };
  const Tag = as !== "track" ? "span" : DEL.test(r.c ?? "") ? "del" : "ins";
  return { node: <Tag key={i} {...a}>{r.t}</Tag>, on };
}

function runNode(x: Ctx, v: Verse, r: Run, i: number, as: View): { node: ReactNode; on: boolean } {
  if (r.m) return { node: x.mech && r.m === "pl" ? <sup key={i} className="pl">pl</sup> : null, on: false };
  if (!r.c) return { node: r.t, on: false };
  if (r.c === "it") return { node: <i key={i}>{r.t}</i>, on: false };
  if (r.c.includes("mech")) return { node: mechRun(r, i, as, x.mech), on: false };
  return changeRun(x, v, r, i, as);
}

/** One verse's runs; reports whether the open check appears in them. */
function draw(x: Ctx, v: Verse, rs: Run[], as: View): Drawn {
  const out = rs.map((r, i) => runNode(x, v, r, i, as));
  return { nodes: out.map((o) => o.node), hit: out.some((o) => o.on) };
}

/** Side by side: one row per verse, KJV on the left and KJME on the right. */
function splitRows(x: Ctx, vs: Verse[]): Drawn {
  let hit = false;
  const nodes = vs.map((v) => {
    const k = draw(x, v, v.runs.kjv, "kjv"), e = draw(x, v, v.runs.read, "clean"), h = k.hit || e.hit;
    hit ||= h;
    return (
      <div key={v.id} className={`v srow${waitCls(v)}${h ? " hasA" : ""}`} id={verseDomId(v.id)} data-v={v.id}>
        <sup className="vn">{v.v}</sup><div className="sk">{k.nodes}</div><div className="se">{e.nodes}</div>
      </div>
    );
  });
  return { nodes, hit };
}

/** Running text: the verses of a paragraph flow together. */
function flowSpans(x: Ctx, vs: Verse[], view: View): Drawn {
  const field = view === "track" ? "inline" : view === "kjv" ? "kjv" : "read";
  const nodes: ReactNode[] = [];
  let hit = false;
  vs.forEach((v, i) => {
    const r = draw(x, v, v.runs[field], view);
    hit ||= r.hit;
    if (i) nodes.push(" ");
    nodes.push(<span key={v.id} className={`v${waitCls(v)}${r.hit ? " hasA" : ""}`} id={verseDomId(v.id)} data-v={v.id}><sup className="vn">{v.v}</sup>{r.nodes}</span>);
  });
  return { nodes, hit };
}

/** Paragraphs follow batches, and each chapter starts with a heading. */
function paragraphs(verses: Verse[]): { ch: number | null; batch: string; vs: Verse[] }[] {
  const out: { ch: number | null; batch: string; vs: Verse[] }[] = [];
  let ch = 0;
  for (const v of verses) {
    const last = out.at(-1), newCh = v.ch !== ch;
    if (newCh || last?.batch !== v.batch) out.push({ ch: newCh ? v.ch : null, batch: v.batch, vs: [] });
    ch = v.ch;
    out.at(-1)!.vs.push(v);
  }
  return out;
}

type Para = ReturnType<typeof paragraphs>[number];

/** One paragraph, plus its chapter heading when it opens a chapter. Reports whether it holds the open check. */
function paragraph(x: Ctx, { ch, batch, vs }: Para, view: View): { node: ReactNode; lit: boolean } {
  const split = view === "split", dk = "d|" + batch, decOn = x.active === dk;
  const body = split ? splitRows(x, vs) : flowSpans(x, vs, view), lit = decOn || body.hit;
  const cls = `para${split ? " split" : ""}${decOn ? " on" : ""}${lit ? " hasA" : ""}`;
  const mark = x.model.decBy.has(dk) && <button className="callmark" aria-label="Your decision for this passage" onClick={() => x.onPick(dk, "mark")} />;
  const P = split ? "div" : "p";
  const node = (
    <Fragment key={batch + "@" + vs[0]!.id}>
      {ch !== null && <h2 className="ch" id={`ch-${ch}`}>Chapter {ch}</h2>}
      <P className={cls} data-batch={batch}>{mark}{body.nodes}</P>
    </Fragment>
  );
  return { node, lit };
}

export const Doc = memo(function Doc({ data, model, view, mech, focus, active, status, onPick }: Props) {
  const x: Ctx = { model, mech, active, status, onPick };
  const split = view === "split";
  const paras = paragraphs(data.verses).map((p) => paragraph(x, p, view));
  const lit = paras.some((p) => p.lit);

  return (
    <article className={`doc${split ? " splitv" : ""}${focus && lit ? " focusing" : ""}`} id="doc">
      <h1 className="dtitle">{data.book}</h1>
      <p className="dsub">{model.items.length} edits in {data.verses.length} verses</p>
      {split && <div className="shead" aria-hidden="true"><span></span><span>KJV 1769</span><span>KJME</span></div>}
      {paras.map((p) => p.node)}
    </article>
  );
});
