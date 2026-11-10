// Where the data comes from: a standalone build inlines it; the web app fetches data/index.json and one file per book.
import type { Manifest, ViewerData } from "./types";

interface Inline { manifest: Manifest; books: Record<string, ViewerData> }
declare global { interface Window { __KJME_INLINE__?: Inline } }

const inline = () => window.__KJME_INLINE__;

export async function loadManifest(): Promise<Manifest> {
  const i = inline();
  if (i) return i.manifest;
  const r = await fetch("data/index.json", { cache: "no-cache" });
  if (!r.ok) throw new Error(`data/index.json: ${r.status}`);
  return r.json();
}

const cache = new Map<string, Promise<ViewerData>>();

export function loadBook(manifest: Manifest, code: string): Promise<ViewerData> {
  const i = inline();
  if (i?.books[code]) return Promise.resolve(i.books[code]);
  const entry = manifest.books.find((b) => b.code === code);
  if (!entry) return Promise.reject(new Error(`no data for ${code}`));
  let p = cache.get(code);
  if (!p) {
    p = fetch(`data/${entry.file}`, { cache: "no-cache" }).then((r) => {
      if (!r.ok) throw new Error(`data/${entry.file}: ${r.status}`);
      return r.json() as Promise<ViewerData>;
    });
    p.catch(() => cache.delete(code));
    cache.set(code, p);
  }
  return p;
}

/** localStorage under the "kjme:" prefix, the same keys the single-file viewer used. */
export const store = {
  get<T>(k: string, d: T): T {
    try { const v = localStorage.getItem("kjme:" + k); return v == null ? d : (JSON.parse(v) as T); } catch { return d; }
  },
  set(k: string, v: unknown): void {
    try { localStorage.setItem("kjme:" + k, JSON.stringify(v)); } catch { /* storage full or blocked */ }
  },
};
