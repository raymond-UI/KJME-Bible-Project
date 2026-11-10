// Top bar, menus and overlays. Settings live in menus: opened once or twice a session, so they take no permanent space.
import { useEffect, useRef } from "react";
import type { Manifest, ViewerData } from "../types";
import { CANON, VDESC, VIEWS, bookName, type Model, type View } from "../model";

export type Overlay = null | "view" | "more" | "books" | "run" | "gloss";

const Chevron = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" /></svg>
);

export function TopBar({ code, view, overlay, toggle }: { code: string; view: View; overlay: Overlay; toggle: (o: Overlay) => void }) {
  return (
    <header className="bar">
      <div className="brand">
        <div className="mark" aria-hidden="true">KJ</div><b>KJME</b><span className="v2tag">Review</span><span className="sep" aria-hidden="true">/</span>
        <button className="bookbtn" id="bookbtn" aria-expanded={overlay === "books"} aria-haspopup="true" onClick={() => toggle("books")}>
          <span id="bookname">{bookName(code)}</span><Chevron />
        </button>
      </div>
      <div className="grow"></div>
      <button className="tbtn" id="viewbtn" aria-expanded={overlay === "view"} aria-haspopup="true" onClick={() => toggle("view")}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" /><circle cx="8" cy="8" r="2" /></svg>
        <span id="viewlbl">{VIEWS.find(([k]) => k === view)![1]}</span><Chevron />
      </button>
      <button className="tbtn" id="morebtn" aria-expanded={overlay === "more"} aria-haspopup="true" aria-label="More" onClick={() => toggle("more")}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="3.5" cy="8" r="1.3" /><circle cx="8" cy="8" r="1.3" /><circle cx="12.5" cy="8" r="1.3" /></svg>
      </button>
    </header>
  );
}

export function ViewMenu({ view, focus, mech, setView, setFocus, setMech }: {
  view: View; focus: boolean; mech: boolean; setView: (v: View) => void; setFocus: (b: boolean) => void; setMech: (b: boolean) => void;
}) {
  return (
    <section className="pop menu vmenu" id="viewmenu" aria-label="View options">
      <div className="msec">Text</div>
      {VIEWS.map(([k, l]) => (
        <button key={k} className={`mi${view === k ? " cur" : ""}`} role="menuitemradio" aria-checked={view === k} onClick={() => setView(k)}>
          <span>{l}</span><i>{VDESC[k]}</i>{view === k && <b className="mck">✓</b>}
        </button>
      ))}
      <div className="msep"></div>
      <label className="mt"><span><span>Focus</span><i>Dim everything but the change you're checking</i></span><input type="checkbox" id="focus" checked={focus} onChange={(e) => setFocus(e.target.checked)} /></label>
      <label className="mt"><span><span>Routine updates</span><i>Show thee → you, hath → has and plural marks</i></span><input type="checkbox" id="mech" checked={mech} onChange={(e) => setMech(e.target.checked)} /></label>
    </section>
  );
}

function Ring({ data }: { data: ViewerData }) {
  const V = data.run.verification, verified = V.issues.length === 0;
  const pct = V.checked ? (V.checked - V.issues.length) / V.checked : 0, C = 2 * Math.PI * 8.5;
  return (
    <svg className="ring" id="ring" viewBox="0 0 22 22" aria-hidden="true">
      <circle cx="11" cy="11" r="8.5" fill="none" stroke="var(--line)" strokeWidth="3" />
      <circle cx="11" cy="11" r="8.5" fill="none" stroke={verified ? "var(--ok)" : "var(--call)"} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${C * pct} ${C}`} transform="rotate(-90 11 11)" />
    </svg>
  );
}

export function MoreMenu({ data, overlay, open }: { data: ViewerData; overlay: Overlay; open: (o: Overlay) => void }) {
  const V = data.run.verification, verified = V.issues.length === 0;
  return (
    <section className="pop menu" id="moremenu" aria-label="More">
      <button className="mi" id="glossbtn" aria-expanded={overlay === "gloss"} onClick={() => open("gloss")}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M3 2.5h7.5L13 5v8.5H3z" /><path d="M5.5 7h5M5.5 9.5h5M5.5 12h3" /></svg>
        <span>Glossary</span><i>Word rules and their status</i>
      </button>
      <button className="mi" id="runbtn" aria-expanded={overlay === "run"} aria-label="Run details" onClick={() => open("run")}>
        <Ring data={data} /><span>Run details</span><i id="ringlbl">{verified ? `${V.checked} verified` : `${V.issues.length} issues`}</i>
      </button>
    </section>
  );
}

export function RunPop({ data }: { data: ViewerData }) {
  const R = data.run, verified = R.verification.issues.length === 0;
  const wins = Object.entries(R.wins).sort((a, b) => b[1] - a[1]), max = Math.max(1, ...wins.map(([, n]) => n));
  return (
    <section className="pop" id="pop" aria-label="Run details">
      <h3>Run {R.id}</h3>
      <dl className="kv">
        <dt>Verses</dt><dd>{R.verses} · {R.accepted} accepted, {R.pending} waiting</dd>
        <dt>Passages</dt><dd>{R.batches} · {R.debated} debated</dd>
        <dt>Changes</dt><dd>{R.changes} edits, {R.mechanical} routine</dd>
        <dt>Cost</dt><dd>${R.spend_usd.toFixed(2)} · ${(R.spend_usd / Math.max(1, R.verses)).toFixed(3)} a verse</dd>
        <dt>Generated</dt><dd>{new Date(R.generated).toLocaleString()}</dd>
      </dl>
      <div className="bars">
        {wins.map(([k, n]) => (
          <div key={k} className="br"><span>{k}</span><span className="tr"><span className="fl" style={{ width: `${(n / max) * 100}%` }}></span></span><span>{n}</span></div>
        ))}
      </div>
      <p>
        {verified
          ? `Every verse was rebuilt from the data shown here and matched against the KJV and the accepted text. All ${R.verification.checked} passed.`
          : R.verification.issues.map((x, i) => <span key={i}>{i > 0 && <br />}{x.verse}: {x.issue}</span>)}
      </p>
      <p>Your checks and flags are saved in this browser only. Copy them from the rail to send them on.</p>
      <p>An independent experiment by Raymond Asogwa. Principles adapted from the KJV Update Project, which is not affiliated. Base text KJV 1769. Greek data from STEPBible (CC BY 4.0).</p>
    </section>
  );
}

export function BooksPop({ manifest, code, pendingHere, switchBook }: { manifest: Manifest; code: string; pendingHere: number; switchBook: (c: string) => void }) {
  const ready = new Set(manifest.books.map((b) => b.code));
  const rest = CANON.map(([t, bs]) => [t, bs.filter(([c]) => !ready.has(c))] as const);
  const nRest = rest.reduce((n, [, bs]) => n + bs.length, 0);
  return (
    <section className="pop bpop" id="books" aria-label="Books">
      <div className="bsec">Ready to review</div>
      {manifest.books.map((b) => (
        <button key={b.code} className={`brow${b.code === code ? " cur" : ""}`} onClick={() => switchBook(b.code)}>
          <span className="bn">{bookName(b.code, b.book)}</span>
          <span className="bm">{b.verses} verses · {b.edits} edits{b.code === code ? ` · ${pendingHere} checks left` : ""}</span>
          {b.code === code && <span className="bc">✓</span>}
        </button>
      ))}
      <details className="dd bdet">
        <summary>{nRest} books not run yet</summary>
        {rest.map(([t, bs]) => bs.length ? (
          <div key={t}>
            <div className="bsec" style={{ marginTop: 10 }}>{t === "OT" ? "Old Testament" : "New Testament"}</div>
            <div className="bgrid">{bs.map(([c, n]) => <span key={c}>{n}</span>)}</div>
          </div>
        ) : null)}
      </details>
      <p className="bhint">A book appears here once its run is exported to the viewer.</p>
    </section>
  );
}

export type GlossFilter = "all" | "chg" | "keep";

export function GlossarySheet({ data, model, q, f, setQ, setF, close, jump }: {
  data: ViewerData; model: Model; q: string; f: GlossFilter; setQ: (q: string) => void; setF: (f: GlossFilter) => void; close: () => void; jump: (vid: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const ql = q.trim().toLowerCase();
  const rows = data.glossary.filter((g) => (f === "all" || (f === "keep" ? g.update === "KEEP" : g.update !== "KEEP")) && (!ql || [g.kjv_form, g.update, g.sense].join(" ").toLowerCase().includes(ql)));
  const short = (vid: string) => { const v = model.byId.get(vid); return v ? `${v.ch}:${v.v}` : vid; };
  return (
    <section className="sheet" id="gloss" aria-label="Glossary">
      <div className="sheet-h"><h2>Glossary</h2><button className="x" aria-label="Close" onClick={close}>×</button></div>
      <div className="sheet-t">
        <div className="seg" id="glf">
          {([["all", "All"], ["chg", "Changes"], ["keep", "Kept"]] as const).map(([k, l]) => (
            <button key={k} aria-pressed={f === k} onClick={() => setF(k)}>{l}</button>
          ))}
        </div>
        <input ref={input} className="search" id="gq" type="search" placeholder="Find a word" aria-label="Find a glossary word" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="sheet-b" id="glist">
        {rows.length ? rows.map((g) => (
          <div key={g.id} className="gr">
            <div className="gw">{g.update === "KEEP" ? <>{g.kjv_form}<span className="kept">kept as is</span></> : <><s>{g.kjv_form}</s> → {g.update}</>}</div>
            <span className={`st ${g.status}`}>{g.status}</span>
            <div className="gs">{g.sense}{g.notes ? " " + g.notes : ""}</div>
            <div className="gx">
              <span style={{ color: "var(--faint)" }}>{g.uses} uses</span>
              {g.examples.filter((x) => model.byId.has(x)).map((x) => <a key={x} onClick={() => jump(x)}>{short(x)}</a>)}
            </div>
          </div>
        )) : <p className="empty">No entries match.</p>}
      </div>
    </section>
  );
}
