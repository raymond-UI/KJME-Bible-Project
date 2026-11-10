import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ViewerData } from "../types";
import { buildModel, type View } from "../model";
import { Doc, verseDomId, type Status } from "./Doc";
import php from "../../public/data/PHP.json";

const data = php as unknown as ViewerData;
const model = buildModel(data);
const [g0, g1, g2] = model.groups;

const render = (view: View, o: { mech?: boolean; active?: string | null; status?: (k: string) => Status } = {}) =>
  renderToStaticMarkup(
    <Doc data={data} model={model} view={view} mech={o.mech ?? false} focus active={o.active ?? null} status={o.status ?? (() => null)} onPick={() => {}} />,
  );
const count = (html: string, re: RegExp) => html.match(re)?.length ?? 0;

describe("Doc", () => {
  test("every verse is drawn once, with an anchor", () => {
    const html = render("clean");
    expect(count(html, /class="v[ "]/g)).toBe(data.verses.length);
    expect(html).toContain(`id="${verseDomId("PHP.2.6")}"`);
  });

  test("one heading per chapter", () => {
    expect(count(render("clean"), /<h2 class="ch"/g)).toBe(new Set(data.verses.map((v) => v.ch)).size);
  });

  test("every reviewable edit is underlined in the edited text", () => {
    const html = render("clean");
    for (const it of model.items) expect(html).toContain(`data-key="${it.key}"`);
  });

  test("track changes marks removals and insertions", () => {
    const html = render("track");
    expect(html).toMatch(/<del class="u /);
    expect(html).toMatch(/<ins class="u /);
  });

  test("side by side puts KJV and KJME in rows", () => {
    const html = render("split");
    expect(html).toContain("KJV 1769");
    expect(count(html, /class="v srow/g)).toBe(data.verses.length);
  });

  test("the original view shows the KJV wording", () => {
    expect(render("kjv")).toContain(' k"');
  });

  test("routine updates show only when asked for", () => {
    for (const view of ["clean", "track", "kjv"] as const) {
      expect(render(view)).not.toContain('class="m"');
      expect(render(view, { mech: true })).toContain('class="m"');
    }
  });

  test("the open check is lit, and the text dims around it", () => {
    const html = render("clean", { active: g0!.key });
    expect(html).toContain(" on\"");
    expect(html).toContain("hasA");
    expect(html).toContain("focusing");
    expect(render("clean")).not.toContain("focusing");
  });

  test("an open decision lights its passage", () => {
    const d = model.decs[0]!;
    expect(render("split", { active: d.key })).toMatch(new RegExp(`class="para split on hasA" data-batch="${d.d.batch}"`));
    expect(count(render("clean"), /class="callmark"/g)).toBe(model.decs.length);
  });

  test("checked and flagged edits are styled", () => {
    const html = render("clean", { status: (k) => (k === g1!.key ? "ok" : k === g2!.key ? "flag" : null) });
    expect(html).toContain(" done");
    expect(html).toContain(" flagged");
  });
});
