// Loads the list of exported books, picks one (from the address, then the last one opened) and loads its data.
import { useEffect, useState } from "react";
import type { Manifest, ViewerData } from "./types";
import { loadBook, loadManifest, store } from "./data";
import { Viewer } from "./Viewer";

/** #php opens Philippians; #v-PHP-1-1 opens it at that verse. */
function bookFromHash(m: Manifest): string | null {
  const h = location.hash.slice(1);
  const code = (h.startsWith("v-") ? h.slice(2).split("-")[0] : h).toUpperCase();
  return m.books.some((b) => b.code === code) ? code : null;
}

function pickBook(m: Manifest): string | null {
  const saved = store.get<string | null>("book", null);
  return bookFromHash(m) ?? (m.books.some((b) => b.code === saved) ? saved : null) ?? m.books[0]?.code ?? null;
}

export function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [data, setData] = useState<{ code: string; d: ViewerData } | null>(null);
  const [error, setError] = useState<{ code: string | null; msg: string } | null>(null);

  useEffect(() => {
    document.title = "KJME Review";
    loadManifest().then((m) => { setManifest(m); setCode(pickBook(m)); }, (e: Error) => setError({ code: null, msg: e.message }));
  }, []);

  useEffect(() => {
    if (!manifest) return;
    const on = () => { const c = bookFromHash(manifest); if (c) setCode(c); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, [manifest]);

  useEffect(() => {
    if (!manifest || !code) return;
    let live = true;
    loadBook(manifest, code).then((d) => { if (live) setData({ code, d }); }, (e: Error) => { if (live) setError({ code, msg: e.message }); });
    return () => { live = false; };
  }, [manifest, code]);

  const switchBook = (c: string) => {
    store.set("book", c);
    if (c === code) return;
    history.replaceState(null, "", "#" + c.toLowerCase());
    setCode(c);
  };

  if (error && (error.code === null || error.code === code)) return <div className="boot">Could not load the review data. {error.msg}</div>;
  if (manifest && !manifest.books.length) return <div className="boot">No books have been exported yet. Run <code>bun src/cli.ts export-viewer</code> in harness/.</div>;
  if (!manifest || !data || data.code !== code) return <div className="boot">Loading…</div>;
  return <Viewer key={code} data={data.d} manifest={manifest} code={code} switchBook={switchBook} />;
}
