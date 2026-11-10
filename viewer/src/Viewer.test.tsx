import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Manifest, ViewerData } from "./types";
import { buildModel } from "./model";
import { App } from "./App";
import { Viewer } from "./Viewer";
import php from "../public/data/PHP.json";
import index from "../public/data/index.json";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const data = php as unknown as ViewerData;
const manifest = index as Manifest;
const model = buildModel(data);
const RUN = data.run.id;

let root: Root, host: HTMLElement, copied: string[];

beforeEach(() => {
  localStorage.clear();
  location.hash = "";
  document.body.innerHTML = '<div id="root"></div>';
  host = document.getElementById("root")!;
  root = createRoot(host);
  copied = [];
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (t: string) => { copied.push(t); } } });
});
afterEach(() => act(() => root.unmount()));

const mount = async () => { await act(async () => root.render(<Viewer data={data} manifest={manifest} code="PHP" switchBook={() => {}} />)); };
const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s);
const $$ = (s: string) => [...document.querySelectorAll<HTMLElement>(s)];
const key = (k: string) => act(() => { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })); });
const click = (el: Element | null) => act(() => { (el as HTMLElement).click(); });
const saved = () => JSON.parse(localStorage.getItem("kjme:review:" + RUN) ?? "{}") as Record<string, { s: string; note: string }>;
const open = () => $("[data-card].on")?.getAttribute("data-card") ?? null;
const ruleGroups = model.ordered.filter((g) => g.tier === "rule");
const firstPending = model.ordered.find((g) => g.tier !== "rule")!;

describe("Viewer", () => {
  test("by-rule checks start out approved, once per run", async () => {
    await mount();
    for (const g of ruleGroups) expect(saved()[g.key]?.s).toBe("ok");
    expect(localStorage.getItem("kjme:ruleSeeded:" + RUN)).toBe("true");
    const ruleEdits = ruleGroups.reduce((n, g) => n + g.items.length, 0);
    expect($("#prog .pt")!.textContent).toBe(`${ruleEdits} of ${model.items.length} edits`);
  });

  test("an un-approved rule check stays un-approved", async () => {
    localStorage.setItem("kjme:ruleSeeded:" + RUN, "true");
    await mount();
    expect(saved()).toEqual({});
  });

  test("opens on the first check left, in the meaning tier", async () => {
    await mount();
    expect(open()).toBe(firstPending.key);
    expect($(".step[aria-pressed=true]")!.textContent).toContain("Meaning");
  });

  test("A approves the open check and moves to the next", async () => {
    await mount();
    await key("a");
    expect(saved()[firstPending.key]?.s).toBe("ok");
    const next = model.ordered.find((g) => g.key !== firstPending.key && !saved()[g.key])!;
    expect(open()).toBe(next.key);
  });

  test("F flags with a note, and Copy sends the flags", async () => {
    await mount();
    await key("f");
    expect(saved()[firstPending.key]?.s).toBe("flag");
    const note = $<HTMLTextAreaElement>("#note")!;
    await act(() => { note.value = "too loose"; note.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(saved()[firstPending.key]?.note).toBe("too loose");
    expect($("#cpmsg")!.textContent).toBe("Copy 1 flag");
    await act(async () => { $("#cpmsg")!.click(); });
    expect(copied[0]).toContain(`KJME review of run ${RUN}`);
    expect(copied[0]).toContain(`${firstPending.c.kjv} → ${firstPending.c.update}`);
    expect(copied[0]).toContain(": too loose");
    expect($("#cpmsg")!.textContent).toBe("Copied");
    note.focus();
    await key("f");
    expect(saved()[firstPending.key]?.s).toBe("flag");
    await act(() => { note.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(document.activeElement).not.toBe(note);
    await key("f");
    expect(saved()[firstPending.key]).toBeUndefined();
  });

  test("Undo clears an approval", async () => {
    await mount();
    await click($(`[data-card="${CSS.escape(firstPending.key)}"] .act.ok`));
    await click($(".grpbtn"));
    await click($(`[data-card="${CSS.escape(firstPending.key)}"] .card-h`));
    expect($(".done-l")).not.toBeNull();
    await click($(`[data-card="${CSS.escape(firstPending.key)}"] .lnk`));
    expect(saved()[firstPending.key]).toBeUndefined();
  });

  test("J and K move between checks; a card header toggles it", async () => {
    await mount();
    const cards = () => $$("#list [data-card]").map((c) => c.dataset.card!);
    await key("j");
    expect(open()).toBe(cards()[1]!);
    await key("k");
    expect(open()).toBe(cards()[0]!);
    await key("ArrowDown");
    expect(open()).toBe(cards()[1]!);
    await click($("[data-card].on .card-h"));
    expect(open()).toBeNull();
  });

  test("keys are ignored while typing or with a modifier", async () => {
    await mount();
    await act(() => { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "a", metaKey: true, bubbles: true })); });
    expect(saved()[firstPending.key]).toBeUndefined();
  });

  test("] collapses the rail, and the mini button brings it back", async () => {
    await mount();
    await key("]");
    expect($(".shell")!.className).toContain("railc");
    await click($("#mini"));
    expect($(".shell")!.className).not.toContain("railc");
    await click($("#railbtn"));
    expect($(".shell")!.className).toContain("railc");
  });

  test("picking an underline in the text opens its check", async () => {
    await mount();
    const g = model.ordered.filter((x) => x.tier !== "rule")[1]!;
    await click($(`#doc [data-g="${CSS.escape(g.key)}"]`));
    expect(open()).toBe(g.key);
  });

  test("tiers switch the list, and a finished tier shows its checked cards on request", async () => {
    await mount();
    await click($$(".step").find((b) => b.textContent!.includes("By rule"))!);
    expect($(".step[aria-pressed=true]")!.textContent).toContain("By rule");
    const btn = $(".grpbtn")!;
    expect(btn.textContent).toBe(`Show ${ruleGroups.length} checked`);
    await click(btn);
    expect($$("#list [data-card]").length).toBe(ruleGroups.length);
  });

  test("approving everything finishes the review", async () => {
    await mount();
    for (let i = 0; i < model.groups.length && open(); i++) await key("a");
    expect($(".fin")!.textContent).toContain("Every edit has a check.");
    expect($("#prog .pn")!.textContent).toBe("All checked");
  });

  test("decisions: open one, change the choice, copy the change", async () => {
    await mount();
    await click($$("#foot .lnk")[0]!);
    expect($$("#list [data-card]").length).toBe(model.decs.length);
    const x = model.decs[0]!;
    await click($(`[data-card="${CSS.escape(x.key)}"] .card-h`));
    const other = x.d.options.findIndex((o) => o.choose !== x.d.resolution);
    await click($$(`[data-card="${CSS.escape(x.key)}"] .pick`)[other]!);
    expect(JSON.parse(localStorage.getItem("kjme:choices:" + RUN)!)).toEqual({ [x.d.batch]: x.d.options[other]!.choose });
    expect($("#cpmsg")!.textContent).toBe("Copy changes");
    await act(async () => { $("#cpmsg")!.click(); });
    expect(copied[0]).toContain(`Decision changes:\n- ${x.d.passage}`);
    await click($$(`[data-card="${CSS.escape(x.key)}"] .pick`).find((b) => b.textContent === "Choose " + "ABCDEFG"[x.d.options.findIndex((o) => o.choose === x.d.resolution)])!);
    expect(localStorage.getItem("kjme:choices:" + RUN)).toBe("{}");
    await click($("#prog .lnk"));
    expect(open()).toBe(firstPending.key);
  });

  test("a decision mark in the text opens that decision", async () => {
    await mount();
    await click($(".callmark"));
    expect($("#prog .pt")!.textContent).toBe(`Your ${model.decs.length} decisions`);
  });

  test("menus open, switch the view, and close on Escape or a click outside", async () => {
    await mount();
    await click($("#viewbtn"));
    expect($(".pop")).not.toBeNull();
    await act(() => { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect($(".pop")).toBeNull();
    await click($("#viewbtn"));
    await act(() => { $("#doc")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); });
    expect($(".pop")).toBeNull();
    await click($("#viewbtn"));
    await click($$(".pop button").find((b) => b.textContent!.includes("Side by side"))!);
    expect($("#doc")!.className).toContain("splitv");
    expect(localStorage.getItem("kjme:view2")).toBe('"split"');
    for (const id of ["#morebtn", "#bookbtn"]) { await click($(id)); expect($(".pop")).not.toBeNull(); await click($(id)); }
  });

  test("the glossary opens from a card and closes from its scrim", async () => {
    await mount();
    const g = model.ordered.find((x) => x.gloss && x.tier !== "rule");
    if (!g) return;
    await click($(`[data-card="${CSS.escape(g.key)}"] .card-h`));
    await click($(`[data-card="${CSS.escape(g.key)}"] .meta .tag`));
    expect($("#gloss")).not.toBeNull();
    await click($("#scrim"));
    expect($("#gloss")).toBeNull();
  });

  test("a verse link jumps to the verse", async () => {
    location.hash = "#v-PHP-2-6";
    await mount();
    expect($("#v-PHP-2-6")!.className).toContain("flash");
  });
});

describe("App", () => {
  const books = { PHP: data };
  beforeEach(() => { window.__KJME_INLINE__ = { manifest, books }; });
  afterEach(() => { delete window.__KJME_INLINE__; });

  test("loads the book in the address and shows it", async () => {
    location.hash = "#php";
    await act(async () => root.render(<App />));
    await act(async () => {});
    expect($("#bookname")!.textContent).toBe("Philippians");
    expect($$("#doc .v").length).toBe(data.verses.length);
  });

  test("says so when nothing has been exported", async () => {
    window.__KJME_INLINE__ = { manifest: { books: [] } as unknown as Manifest, books: {} };
    await act(async () => root.render(<App />));
    expect(host.textContent).toContain("No books have been exported yet.");
  });
});
