// Parsers for the OCR text of the two English 1611 sources (reference/REFERENCE.md, "English of 1611"):
// the Bible Word-Book (Eastwood & Wright, 2nd ed. 1884) and Webster's American Dictionary (1828).
// Both come from archive.org scans of the printed books, so the text has OCR noise; the parsers split
// it into entries by headword, using alphabetical order to reject OCR-garbled headwords and quotations that look like headwords.

export interface DictEntry { headword: string; pos: string; refs?: string; text: string; within?: string }
export type Dictionary = Record<string, DictEntry[]>;

/** Page furniture in the Word-Book scan: running heads and signature marks. */
const WB_FURNITURE = /^(\d+\s+THE\s+BIBLE|WORD-BOOK\.\s+\S+|[IVX]+\s*[—-]+\s*\d+|THE\s+BIBLE\s+WORD-BOOK\.?)\s*$/;
const WB_POS = String.raw`sb\.|adj\.|adv\.|v\.\s*t\.|v\.\s*i\.|v\.|prep\.|conj\.|pron\.|interj\.|part\.|pp\.|pt\.|p\.\s*p\.|n\.`;
const WB_REF = String.raw`\((?=[^)]*\b[A-Z][a-z]+\.?\s+[ivxlc]+\.)`;
/** A Word-Book headword, before any prose: a word or phrase with a part of speech ("Let, v. t."); a phrase with
 * a bracketed Bible reference ("Let alone (Mark xv. 36)"); or a word, a short qualifier and a reference ("Conversant, to be (Josh."). */
const WB_HEAD = new RegExp(String.raw`^(?:([A-Z][a-z'-]+(?:\s{1,2}[a-z'-]+){0,3}),\s+(${WB_POS})|([A-Z][a-z'-]+(?:\s{1,2}[a-z'-]+){0,3})\s+${WB_REF}|([A-Z][a-z'-]+),\s+[a-z]+(?:\s{1,2}[a-z]+){0,2}\s+${WB_REF})`);

/** Webster's column heads ("CON") and page numbers. */
const WEB_FURNITURE = /^([A-Z]{2,4}|\d{1,4})\s*$/;
/** A Webster headword: capitals (OCR sometimes lowers one), with stress marks, then a comma. */
const WEB_HEAD = /^([A-Z][A-Za-z' -]{0,30}[A-Za-z]'?),\s+(\S{1,8})/;

const clean = (s: string) => s.replace(/(\w)-\s*\n\s*([a-z])/g, "$1$2").replace(/\s+/g, " ").trim();

interface Head { headword: string; pos: string; key: string }

/** An OCR-garbled headword sorts out of place against both headwords before it, or both after it (by first 3 letters). */
function outliers(keys: string[]): boolean[] {
  const k3 = keys.map((k) => k.slice(0, 3));
  const before = (i: number, j: number) => j >= 0 && k3[i]! < k3[j]!;
  const after = (i: number, j: number) => j < k3.length && k3[i]! > k3[j]!;
  return k3.map((_, i) => (before(i, i - 1) && before(i, i - 2)) || (after(i, i + 1) && after(i, i + 2)));
}

function split(text: string, furniture: RegExp, head: (line: string) => Head | null): { head: Head; body: string[] }[] {
  const lines = text.split("\n").filter((l) => !furniture.test(l.trim()));
  const heads = lines.map(head);
  const at = heads.flatMap((h, i) => (h ? [i] : []));
  const bad = new Set(outliers(at.map((i) => heads[i]!.key)).flatMap((o, n) => (o ? [at[n]!] : [])));
  const out: { head: Head; body: string[] }[] = [];
  lines.forEach((line, i) => {
    const h = heads[i];
    if (h && !bad.has(i)) out.push({ head: h, body: [line] });
    else out.at(-1)?.body.push(line);
  });
  return out;
}

function collect(parts: { head: Head; body: string[] }[], refs?: (body: string) => string | undefined): Dictionary {
  const d: Dictionary = {};
  for (const { head, body } of parts) {
    const text = clean(body.join("\n"));
    const r = refs?.(text);
    (d[head.key] ??= []).push({ headword: head.headword, pos: head.pos, ...(r ? { refs: r } : {}), text });
  }
  return d;
}

function wordBookHead(line: string): Head | null {
  const m = WB_HEAD.exec(line);
  if (!m) return null;
  const headword = (m[1] ?? m[3] ?? m[4])!.replace(/\s+/g, " ");
  return { headword, pos: (m[2] ?? "").replace(/\s+/g, " "), key: headword.toLowerCase() };
}

/** Words treated inside another entry ("Conversation occurs twice ..." in "Conversant"): a body line that starts
 * with a capitalised form of the headword's stem, at least six letters in common. */
function runIns(head: Head, body: string[]): string[] {
  const stem = head.key.slice(0, 6);
  return [...new Set(body.slice(1).flatMap((l) => {
    const w = /^([A-Z][a-z]{5,})\s/.exec(l)?.[1]?.toLowerCase();
    return w && head.key.length >= 6 && w.startsWith(stem) && w !== head.key ? [w] : [];
  }))];
}

/** Bible Word-Book: entries keyed by lowercase headword (phrases keep their spaces, e.g. "let alone"). A word treated
 * inside another entry is keyed too, to that entry, with `within` naming the headword it sits under. */
export function parseWordBook(text: string): Dictionary {
  const start = text.search(/^A,\s|^Abase,|^Abated|^Abide/m);
  const parts = split(start > 0 ? text.slice(start) : text, WB_FURNITURE, wordBookHead);
  const d = collect(parts, (t) => /^[^(]{0,60}\(([^)]{1,200})\)/.exec(t)?.[1]);
  for (const { head, body } of parts) for (const w of runIns(head, body)) {
    if (d[w]) continue;
    d[w] = d[head.key]!.filter((e) => e.headword === head.headword).map((e) => ({ ...e, within: e.headword }));
  }
  return d;
}

function websterHead(line: string): Head | null {
  const m = WEB_HEAD.exec(line);
  if (!m) return null;
  const letters = m[1]!.replace(/[^A-Za-z]/g, "");
  if (letters.length < 2 || letters.replace(/[^A-Z]/g, "").length < letters.length * 0.7) return null;
  return { headword: m[1]!, pos: m[2]!, key: letters.toLowerCase() };
}

/** Webster 1828: entries keyed by the headword without stress marks, lowercase. Each volume's dictionary text begins
 * at the first headword matching its `start` (the front matter before it is skipped). */
export function parseWebster(volumes: { text: string; start: RegExp }[]): Dictionary {
  const d: Dictionary = {};
  for (const v of volumes) {
    const at = v.text.search(v.start);
    for (const [k, es] of Object.entries(collect(split(at >= 0 ? v.text.slice(at) : v.text, WEB_FURNITURE, websterHead)))) (d[k] ??= []).push(...es);
  }
  return d;
}
