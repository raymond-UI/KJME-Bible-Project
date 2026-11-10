// One book under review: the text on the left, the rail of checks on the right (a bottom sheet on narrow screens).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import type { Manifest, ViewerData } from "./types";
import { buildModel, type Group, type Model, type Tier, type View } from "./model";
import { firstOpen, keyAction, messageText, nextOpen, tally, type KeyAction, type Review } from "./review";
import {
  flashVerse, narrow, scrollCard, scrollDoc, typing, useChoices, useCopy, useKeydown, useNarrow, useOutsideClose, useReview,
  useScroll, useStable, useStored,
} from "./hooks";
import { Doc, verseDomId } from "./components/Doc";
import { DecisionCard, GroupCard, type CardApi } from "./components/Cards";
import { CollapseButton, CopyFallback, Foot, MiniRail, Progress, SheetHandle, Steps, TierList, type Mode } from "./components/Rail";
import { BooksPop, GlossarySheet, MoreMenu, RunPop, TopBar, ViewMenu, type GlossFilter, type Overlay } from "./components/Chrome";

type From = "doc" | "mark" | "card" | "next";

/** Which check is open, which tier and list are showing, and moving between them. */
function useNav(model: Model, review: Review, setRail: (c: boolean) => void) {
  const { ordered, groups, groupBy } = model;
  const list = useRef<HTMLDivElement>(null);
  const [active, setActiveKey] = useState<string | null>(() => firstOpen(ordered, review)?.key ?? null);
  const [tier, setTier] = useState<Tier>(() => firstOpen(ordered, review)?.tier ?? "meaning");
  const [mode, setMode] = useState<Mode>("review");
  const [showDone, setShowDone] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const scroll = useScroll(active, list);

  /** Open a check or decision, switching the rail to the list it is in. */
  const show = (key: string | null) => {
    setActiveKey(key);
    if (key?.startsWith("d|")) setMode("calls");
    else if (key) { setMode("review"); setTier(groupBy.get(key)!.tier); }
  };
  const setActive = (key: string | null, from: From) => {
    if (from === "card" && active === key) return setActiveKey(null);
    show(key);
    if (key && from !== "next") setRail(false);
    if (narrow()) setSheetOpen(true);
    scroll(true, from !== "doc");
  };
  const advance = (fromKey: string, r: Review) => {
    const next = nextOpen(ordered, fromKey, r);
    setShowDone(false);
    if (next) setActive(next.key, "next");
    else { setActiveKey(null); scroll(false, false, true); }
  };
  const move = (dir: number) => {
    if (mode !== "review") return;
    const vis = [...document.querySelectorAll<HTMLElement>("#list [data-card]")].map((c) => c.dataset.card!);
    const i = active ? vis.indexOf(active) : -1, n = vis[i < 0 ? 0 : i + dir];
    if (n) setActive(n, "next");
  };
  const pickTier = (t: Tier) => {
    setTier(t); setShowDone(false);
    setActiveKey(groups.find((g) => g.tier === t && !review[g.key])?.key ?? null);
    scroll(false, true);
  };
  const pickMode = (m: Mode) => { setMode(m); show(m === "review" ? firstOpen(ordered, review)?.key ?? null : null); };
  return { active, tier, mode, showDone, setShowDone, sheetOpen, setSheetOpen, setActive, advance, move, pickTier, pickMode, list };
}

interface KeyCtx { open: Group | undefined; isOk: boolean; approve: (k: string) => void; flag: (k: string) => void; toggleRail: () => void; move: (d: number) => void }

/** A, F, ] and J/K (or arrows). Returns whether the key was used. */
function runKey(act: KeyAction, o: KeyCtx): boolean {
  switch (act) {
    case "approve": if (o.open && !o.isOk) o.approve(o.open.key); return !!o.open;
    case "flag": if (o.open) o.flag(o.open.key); return !!o.open;
    case "rail": if (narrow()) return false; o.toggleRail(); return true;
    default: o.move(act === "next" ? 1 : -1); return true;
  }
}

/** Escape closes a menu, or leaves the note. */
function escape(overlay: Overlay, close: () => void) {
  const ae = document.activeElement as HTMLElement | null;
  if (overlay) close();
  else if (ae?.id === "note") ae.blur();
}

function useReviewKeys(overlay: Overlay, close: () => void, ctx: KeyCtx) {
  useKeydown(useStable((e: KeyboardEvent) => {
    if (e.key === "Escape") return escape(overlay, close);
    const act = typing(e) ? null : keyAction(e.key, e.target === document.body);
    if (act && runKey(act, ctx)) e.preventDefault();
  }));
}

/** The menus and the glossary, one at a time. */
function Overlays({ overlay, data, model, manifest, code, left, gloss, view, close, setOverlay, switchBook, jump }: {
  overlay: Overlay; data: ViewerData; model: Model; manifest: Manifest; code: string; left: number; jump: (vid: string) => void;
  gloss: { q: string; f: GlossFilter; setQ: (q: string) => void; setF: (f: GlossFilter) => void };
  view: { view: View; focus: boolean; mech: boolean; setView: (v: View) => void; setFocus: (b: boolean) => void; setMech: (b: boolean) => void };
  close: () => void; setOverlay: (o: Overlay) => void; switchBook: (c: string) => void;
}) {
  switch (overlay) {
    case "gloss": return <><div className="scrim" id="scrim" onClick={close}></div><GlossarySheet data={data} model={model} {...gloss} close={close} jump={jump} /></>;
    case "run": return <RunPop data={data} />;
    case "books": return <BooksPop manifest={manifest} code={code} pendingHere={left} switchBook={(c) => { close(); switchBook(c); }} />;
    case "view": return <ViewMenu {...view} />;
    case "more": return <MoreMenu data={data} overlay={overlay} open={setOverlay} />;
    default: return null;
  }
}

/** The rail of checks: a side panel, a collapsed button, or a bottom sheet on narrow screens. */
function Rail({ nav, model, api, railc, setRail, listRef, copied, left, doneEdits, flagged, changed, copy, children }: {
  nav: ReturnType<typeof useNav>; model: Model; api: CardApi; railc: boolean; setRail: (c: boolean) => void;
  listRef: RefObject<HTMLDivElement | null>; copied: boolean;
  left: number; doneEdits: number; flagged: number; changed: number; copy: () => void; children: ReactNode;
}) {
  const { groups, items, decs } = model, { active, mode, tier } = nav;
  const card = (g: Group) => <GroupCard key={g.key} gr={g} api={api} />;
  const expand = () => { setRail(false); setTimeout(() => scrollCard(active, listRef.current), 50); };
  const openSheet = (e: { target: EventTarget }) => { if (narrow() && !(e.target as Element).closest("button")) nav.setSheetOpen(true); };
  return (
    <aside className={`side hasfoot${nav.sheetOpen ? " open" : ""}`} id="side" aria-label="Suggestions">
      <SheetHandle toggle={() => nav.setSheetOpen((o) => !o)} />
      <MiniRail left={left} expand={expand} />
      <div className="sh" onClick={openSheet}>
        <CollapseButton railc={railc} collapse={() => setRail(true)} />
        <Progress mode={mode} left={left} done={doneEdits} total={items.length} decisions={decs.length} back={() => nav.pickMode("review")} />
        {mode === "review" ? <Steps groups={groups} tier={tier} status={api.status} pick={nav.pickTier} /> : <div className="steps" id="steps"></div>}
      </div>
      <div className="list" id="list" ref={listRef}>
        {mode === "calls"
          ? decs.map((x) => <DecisionCard key={x.key} x={x} api={api} />)
          : <TierList tier={tier} groups={groups} active={active} status={api.status} left={left} flagged={flagged} showDone={nav.showDone} toggleDone={() => nav.setShowDone((s) => !s)} card={card} />}
        {children}
      </div>
      <Foot mode={mode} decisions={decs.length} flagged={flagged} changed={changed} copied={copied} copy={copy} showCalls={() => nav.pickMode("calls")} />
    </aside>
  );
}

/** The open menu or sheet, and what the glossary is showing. */
function useOverlays() {
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [q, setQ] = useState(""), [f, setF] = useState<GlossFilter>("all");
  const close = useCallback(() => setOverlay(null), []);
  const toggle = (o: Overlay) => setOverlay((cur) => (cur === o ? null : o));
  const openGloss = (term: string) => { setQ(term); setF("all"); setOverlay("gloss"); };
  useOutsideClose(overlay, close);
  return { overlay, setOverlay, close, toggle, openGloss, gloss: { q, f, setQ, setF } };
}

/** On open: a #v-PHP-1-1 link jumps to its verse; otherwise bring the first check into view. */
function useOpening(jump: (vid: string) => void, active: string | null) {
  const start = useStable(() => {
    const h = location.hash.slice(1);
    if (h.startsWith("v-")) return jump(h.slice(2).replace(/-/g, "."));
    const t = setTimeout(() => scrollDoc(active), 50);
    return () => clearTimeout(t);
  });
  useEffect(() => start(), [start]);
}

type ReviewState = ReturnType<typeof useReview>;
type Nav = ReturnType<typeof useNav>;

/** How the text is shown, and whether the rail is collapsed. Saved in the browser, except routine updates. */
function useSettings() {
  const [view, setView] = useStored<View>("view2", "clean");
  const [focus, setFocus] = useStored("focus", true);
  const [railc, setRail] = useStored("railc", false);
  const [mech, setMech] = useState(false);
  return { view, setView, focus, setFocus, railc, setRail, mech, setMech };
}

/** Approve, flag and jump: what the cards and the keyboard both do. */
function useActions(rv: ReviewState, nav: Nav, close: () => void) {
  const [focusNote, setFocusNote] = useState(0);
  const approve = (k: string) => nav.advance(k, rv.mark(k, "ok"));
  const flag = (k: string) => { rv.mark(k, rv.status(k) === "flag" ? null : "flag"); setFocusNote((n) => n + 1); };
  const jump = useStable((vid: string) => {
    close();
    const el = document.getElementById(verseDomId(vid));
    if (el) flashVerse(el);
  });
  const onPick = useStable((key: string, from: "doc" | "mark") => nav.setActive(key, from));
  return { focusNote, approve, flag, jump, onPick };
}

function keyCtx(model: Model, rv: ReviewState, nav: Nav, act: ReturnType<typeof useActions>, toggleRail: () => void): KeyCtx {
  const open = nav.active ? model.groupBy.get(nav.active) : undefined;
  return { open, isOk: rv.status(open?.key ?? "") === "ok", approve: act.approve, flag: act.flag, toggleRail, move: nav.move };
}

function cardHandlers(model: Model, rv: ReviewState, nav: Nav, openGloss: (q: string) => void) {
  return {
    setNote: rv.setNote,
    note: (k: string) => rv.review[k]?.note ?? "",
    open: (k: string) => nav.setActive(k, "card"),
    undo: (k: string) => { rv.mark(k, null); },
    gloss: (id: string) => openGloss(model.gloss.get(id)?.kjv_form || ""),
  };
}

export function Viewer({ data, manifest, code, switchBook }: { data: ViewerData; manifest: Manifest; code: string; switchBook: (c: string) => void }) {
  const model = useMemo(() => buildModel(data), [data]);
  const R = data.run;
  const rv = useReview(R.id, model.ordered), { status, review } = rv;
  const { choices, pick } = useChoices(R.id, model.decs);
  const set = useSettings(), { view, focus, mech, railc, setRail } = set;
  const nav = useNav(model, review, setRail), { active } = nav;
  const ov = useOverlays(), { overlay, close } = ov;
  const cp = useCopy(), isNarrow = useNarrow();
  const act = useActions(rv, nav, close);
  useReviewKeys(overlay, close, keyCtx(model, rv, nav, act, () => setRail(!railc)));
  useOpening(act.jump, active);

  const t = tally(model, review, choices);
  const copy = () => cp.copy(messageText({ runId: R.id, book: data.book, review, flagged: t.flagged, changed: t.changed, choices }));
  const api: CardApi = { ...act, data, model, active, status, choices, pick, ...cardHandlers(model, rv, nav, ov.openGloss) };
  const setView = (v: View) => { set.setView(v); close(); };
  const jump = act.jump;

  return (
    <>
      <TopBar code={code} view={view} overlay={overlay} toggle={ov.toggle} />
      <div className={`shell${railc && !isNarrow ? " railc" : ""}`}>
        <div className="docwrap" id="docwrap">
          <Doc data={data} model={model} view={view} mech={mech} focus={focus} active={active} status={status} onPick={act.onPick} />
        </div>
        <Rail
          nav={nav} model={model} api={api} railc={railc} setRail={setRail} listRef={nav.list} copied={cp.copied}
          left={t.left} doneEdits={t.doneEdits} flagged={t.flagged.length} changed={t.changed.length} copy={copy}
        >
          {cp.fallback !== null && <CopyFallback text={cp.fallback} />}
        </Rail>
      </div>
      <Overlays
        overlay={overlay} data={data} model={model} manifest={manifest} code={code} left={t.left} jump={jump} close={close} setOverlay={ov.setOverlay}
        switchBook={switchBook} gloss={ov.gloss} view={{ view, focus, mech, setView, setFocus: set.setFocus, setMech: set.setMech }}
      />
    </>
  );
}
