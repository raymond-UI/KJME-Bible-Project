// Hooks behind the viewer: saved settings, review and choices, copying, scrolling, the keyboard and menus.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { DecisionItem, Group } from "./model";
import { store } from "./data";
import { seedRules, statusIn, withMark, type Mark, type Review } from "./review";
import type { Overlay } from "./components/Chrome";

const NARROW = "(max-width: 900px)";
export const narrow = () => matchMedia(NARROW).matches;
const motion = (): ScrollBehavior => (matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

export function useNarrow() {
  const [n, setN] = useState(narrow);
  useEffect(() => {
    const m = matchMedia(NARROW), on = () => setN(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return n;
}

/** A callback whose identity never changes but always sees the latest render. */
export function useStable<A extends unknown[], R>(fn: (...a: A) => R): (...a: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => { ref.current = fn; });
  return useCallback((...a: A) => ref.current(...a), []);
}

/** State that is saved in the browser under `key`. */
export function useStored<T>(key: string, init: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => store.get(key, init));
  return [v, (x: T) => { setV(x); store.set(key, x); }];
}

/** Rule checks are seeded once per run; after that, un-approving one sticks. */
function loadReview(runId: string, ordered: Group[]): Review {
  const key = "review:" + runId, seeded = "ruleSeeded:" + runId;
  const r = store.get<Review>(key, {});
  if (store.get(seeded, false)) return r;
  const out = seedRules(r, ordered);
  store.set(key, out); store.set(seeded, true);
  return out;
}

export function useReview(runId: string, ordered: Group[]) {
  const [review, setReview] = useState<Review>(() => loadReview(runId, ordered));
  const save = (r: Review) => { setReview(r); store.set("review:" + runId, r); return r; };
  const status = useCallback((k: string) => statusIn(review, k), [review]);
  return {
    review, status,
    mark: (k: string, s: Mark | null) => save(withMark(review, k, s)),
    setNote: (k: string, text: string) => { if (review[k]) save({ ...review, [k]: { ...review[k], note: text } }); },
  };
}

/** Changed decisions; choosing the run's own option again clears the change. */
export function useChoices(runId: string, decs: DecisionItem[]) {
  const [choices, setChoices] = useStored<Record<string, string>>("choices:" + runId, {});
  const pick = (batch: string, id: string) => {
    const d = decs.find((x) => x.d.batch === batch)!.d, c = { ...choices };
    if (id === d.resolution) delete c[batch]; else c[batch] = id;
    setChoices(c);
  };
  return { choices, pick };
}

/** Copy to the clipboard, or show the text to copy by hand when the clipboard is blocked. */
export function useCopy() {
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState<string | null>(null);
  const copy = (text: string) => {
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1400); };
    const fb = () => setFallback(text);
    try { navigator.clipboard.writeText(text).then(done, fb); } catch { fb(); }
  };
  return { copied, fallback, copy };
}

const changeEl = (active: string) =>
  active.startsWith("d|")
    ? document.querySelector(`.para[data-batch="${CSS.escape(active.slice(2))}"]`)
    : document.querySelector(`#doc [data-g="${CSS.escape(active)}"]`);

/** Bring the open check's change into view in the text. */
export function scrollDoc(active: string | null) {
  if (active) changeEl(active)?.scrollIntoView({ block: narrow() ? "start" : "center", behavior: motion() });
}

/** Bring the open card into view in the rail. */
export function scrollCard(active: string | null, list: HTMLElement | null) {
  const card = active && document.querySelector<HTMLElement>(`[data-card="${CSS.escape(active)}"]`);
  if (card && list) list.scrollTo({ top: card.offsetTop - list.offsetTop - 8, behavior: motion() });
}

/** Scrolling waits until React has drawn the card and the change; ask for it, and it happens after the render. */
export function useScroll(active: string | null, list: RefObject<HTMLDivElement | null>) {
  const [req, setReq] = useState({ n: 0, card: false, doc: false, top: false });
  const run = useStable(() => {
    if (req.top) list.current?.scrollTo({ top: 0 });
    if (req.card) scrollCard(active, list.current);
    if (req.doc) scrollDoc(active);
  });
  useEffect(() => { if (req.n) run(); }, [req, run]);
  return (card: boolean, doc: boolean, top = false) => setReq((p) => ({ n: p.n + 1, card, doc, top }));
}

/** Flash a verse after jumping to it, so the eye finds it. */
export function flashVerse(el: HTMLElement) {
  el.scrollIntoView({ block: "center", behavior: motion() });
  el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
}

export function useKeydown(on: (e: KeyboardEvent) => void) {
  useEffect(() => {
    document.addEventListener("keydown", on);
    return () => document.removeEventListener("keydown", on);
  }, [on]);
}

/** Menus close on a click anywhere outside them, as well as on Escape. The glossary closes from its scrim. */
export function useOutsideClose(overlay: Overlay, close: () => void) {
  useEffect(() => {
    if (!overlay || overlay === "gloss") return;
    const on = (e: PointerEvent) => { if (!(e.target as Element).closest(".pop, #bookbtn, #viewbtn, #morebtn")) close(); };
    document.addEventListener("pointerdown", on);
    return () => document.removeEventListener("pointerdown", on);
  }, [overlay, close]);
}

/** Typing in a field, or holding a modifier, leaves the review keys alone. */
export const typing = (e: KeyboardEvent) =>
  /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement as HTMLElement | null)?.tagName || "") || e.metaKey || e.ctrlKey || e.altKey;
