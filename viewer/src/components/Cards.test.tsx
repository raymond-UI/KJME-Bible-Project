import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { Batch, ViewerData } from "../types";
import { buildModel } from "../model";
import type { Status } from "./Doc";
import { DecisionCard, GroupCard, type CardApi } from "./Cards";
import { HowDecided, PlainRuns, Snippet } from "./bits";
import php from "../../public/data/PHP.json";

const data = php as unknown as ViewerData;
const model = buildModel(data);
const noop = () => {};
const api = (o: Partial<CardApi> = {}): CardApi => ({
  data, model, active: null, status: () => null, note: () => "", choices: {}, focusNote: 0,
  open: noop, approve: noop, flag: noop, undo: noop, setNote: noop, pick: noop, jump: noop, gloss: noop, ...o,
});
const html = (el: React.ReactElement) => renderToStaticMarkup(el);
const card = (key: string, o: Partial<CardApi> = {}) => html(<GroupCard gr={model.groupBy.get(key)!} api={api({ active: key, ...o })} />);

const routine = model.groupBy.get("routine")!;
const single = model.groups.find((g) => g.items.length === 1 && g.key !== "routine" && (g.items[0]!.c.evidence?.length ?? 0) > 0)!;
const many = model.groups.find((g) => g.items.length > 1 && g.key !== "routine")!;

describe("GroupCard", () => {
  test("closed, it shows the swap, a dot and where it is", () => {
    const h = html(<GroupCard gr={single} api={api()} />);
    expect(h).toContain("<s>" + single.c.kjv);
    expect(h).toContain(`dot c-${single.color}`);
    expect(h).toContain(`${single.items[0]!.v.ch}:${single.items[0]!.v.v}`);
    expect(h).not.toContain('class="cb"');
    expect(html(<GroupCard gr={many} api={api()} />)).toContain(`×${many.items.length}`);
    expect(html(<GroupCard gr={routine} api={api()} />)).toContain("<b>Routine forms</b>");
  });

  test("open, a single edit shows its context, reason and extras", () => {
    const h = card(single.key);
    expect(h).toContain('class="cb"');
    expect(h).toContain('class="ctx"');
    expect(h).toContain("Looks right");
    expect(h).toContain("<summary>Evidence</summary>");
    expect(h).toMatch(/Compare \d+ translations/);
  });

  test("open, a repeated edit lists every place and approves them together", () => {
    const h = card(many.key);
    expect(h.match(/class="place"/g)?.length).toBe(many.items.length);
    expect(h).toContain(`Approve all ${many.items.length}`);
    expect(h).toContain(`${many.items.length} places`);
  });

  test("routine forms list each pair once", () => {
    const h = card("routine");
    expect(h).toContain("follow a fixed table");
    const pairs = new Set(routine.items.map((x) => x.c.kjv.toLowerCase() + "→" + x.c.update));
    expect(h.match(/<span><s>/g)?.length).toBe(pairs.size);
  });

  test("approved and flagged states", () => {
    const ok = card(many.key, { status: (): Status => "ok" });
    expect(ok).toContain(`Approved in all ${many.items.length} places`);
    expect(ok).toContain('class="chk"');
    expect(card(single.key, { status: (): Status => "ok" })).toContain("✓ Approved<");
    const fl = card(single.key, { status: (): Status => "flag", note: () => "too loose" });
    expect(fl).toContain("Flagged");
    expect(fl).toContain('id="note"');
    expect(fl).toContain("too loose");
    expect(html(<GroupCard gr={single} api={api({ status: () => "flag" })} />)).toContain('class="flg"');
  });

  test("a glossary edit links to its entry", () => {
    const g = model.groups.find((x) => x.gloss)!;
    expect(card(g.key)).toContain(`Glossary · ${g.gloss!.status}`);
  });
});

describe("DecisionCard", () => {
  const x = model.decs[0]!, d = x.d;

  test("closed, it shows the question", () => {
    const h = html(<DecisionCard x={x} api={api()} />);
    expect(h).toContain(d.question.replace(/"/g, "&quot;"));
    expect(h).not.toContain('class="opts"');
  });

  test("open, it shows every option and the decision made", () => {
    const h = html(<DecisionCard x={x} api={api({ active: x.key })} />);
    expect(h.match(/class="opt[ "]/g)?.length).toBe(d.options.length);
    expect(h).toContain(`Decided by ${d.resolved_by}`);
    expect(h).toContain("Keep the KJV wording");
    expect(h).toContain("Recommended");
    expect(h).toContain("Why it was flagged");
    expect(h).toContain("Why it&#x27;s recommended.");
  });

  test("a changed choice is marked as not sent yet", () => {
    const other = d.options.find((o) => o.choose !== d.resolution)!;
    const h = html(<DecisionCard x={x} api={api({ active: x.key, choices: { [d.batch]: other.choose } })} />);
    expect(h).toContain("not sent yet");
    expect(h).toContain("keeps the earlier choice");
  });

  test("an open question waits for a call, and clean options say so", () => {
    const y = model.decs.find((z) => z.d.options.some((o) => !o.review_fails.length && !o.failed_checks))!;
    const h = html(<DecisionCard x={{ ...y, d: { ...y.d, status: "pending" } }} api={api({ active: y.key })} />);
    expect(h).toContain("Waiting for your call");
    expect(h).toContain("Passed both reviewers");
  });

  test("an option that breaks a rule but no reviewer flagged says so", () => {
    const o = { ...d.options[0]!, review_fails: [], failed_checks: true };
    const h = html(<DecisionCard x={{ ...x, d: { ...d, options: [o] } }} api={api({ active: x.key })} />);
    expect(h).toContain("Breaks a rule");
  });
});

describe("bits", () => {
  test("PlainRuns marks insertions and deletions and drops markers", () => {
    const h = html(<PlainRuns runs={[{ t: "a " }, { t: "old", c: "del" }, { t: "new", c: "ins" }, { t: "x", m: "pl" }]} />);
    expect(h).toBe("a <del>old</del><ins>new</ins>");
  });

  test("Snippet highlights one change", () => {
    const v = model.items[0]!.v, cid = model.items[0]!.c.id;
    expect(html(<Snippet v={v} cid={cid} />)).toContain('class="hl"');
  });

  test("HowDecided says who chose the wording", () => {
    const b = (d: object) => ({ decision: d }) as unknown as Batch;
    expect(html(<>{HowDecided({ b: undefined })}</>)).toBe("");
    expect(html(<>{HowDecided({ b: b({ decided_by: "human" }) })}</>)).toContain("Your call");
    expect(html(<>{HowDecided({ b: b({ outcome: "select", winner_author: "translator-cadence", confidence: 0.8 }) })}</>)).toBe("<span>From the Cadence translation · 80% sure</span>");
    expect(html(<>{HowDecided({ b: b({ outcome: "merge" }) })}</>)).toBe("<span>Combined from several translations</span>");
  });
});
