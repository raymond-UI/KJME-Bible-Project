// Parse the eBible KJV OSIS file into verse records.
// The file uses milestone verses (<verse sID/> ... <verse eID/>), <p> paragraphs and
// <transChange type="added"> for translator-supplied (italic) words.
import { readFileSync } from "node:fs";
import { OSIS_TO_USFM } from "./books.js";

export interface Span { start: number; end: number }
export interface SourceVerse {
  id: string;            // USFM verse id, e.g. PHP.4.6
  book: string;
  chapter: number;
  verse: number;
  text: string;
  italics: Span[];
  paragraph_start: boolean;
}

const decode = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

export function loadOsis(path: string): Map<string, SourceVerse> {
  const xml = readFileSync(path, "utf8");
  const verses = new Map<string, SourceVerse>();
  // Walk the document as a token stream of tags and text.
  const re = /<[^>]+>|[^<]+/g;
  let current: { id: string; parts: string[]; italics: Span[]; inItalic: number | null; pstart: boolean } | null = null;
  let pendingParagraph = false;
  let len = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const tok = m[0];
    if (tok.startsWith("<")) {
      if (/^<p[\s>]/.test(tok)) { pendingParagraph = true; continue; }
      const sid = tok.match(/^<verse[^>]*osisID="([^"]+)"[^>]*sID=/);
      if (sid) {
        const [ob, c, v] = sid[1].split(".");
        const usfm = OSIS_TO_USFM.get(ob);
        if (!usfm) { current = null; continue; }
        current = { id: `${usfm}.${c}.${v}`, parts: [], italics: [], inItalic: null, pstart: pendingParagraph || v === "1" };
        pendingParagraph = false;
        len = 0;
        continue;
      }
      if (/^<verse[^>]*eID=/.test(tok) && current) {
        const raw = current.parts.join("");
        // Normalize whitespace, remapping italic offsets.
        const { text, map } = normalize(raw);
        const italics = current.italics
          .map((s) => ({ start: map[s.start], end: map[s.end] }))
          .map((s) => trimSpan(text, s))
          .filter((s) => s.end > s.start);
        const [b, c, v] = current.id.split(".");
        verses.set(current.id, { id: current.id, book: b, chapter: +c, verse: +v, text, italics, paragraph_start: current.pstart });
        current = null;
        continue;
      }
      if (current && /^<transChange[^>]*type="added"/.test(tok)) { current.inItalic = len; continue; }
      if (current && tok === "</transChange>" && current.inItalic !== null) {
        current.italics.push({ start: current.inItalic, end: len });
        current.inItalic = null;
        continue;
      }
      continue; // other tags ignored (titles, q, chapter milestones)
    }
    if (current) {
      const t = decode(tok);
      current.parts.push(t);
      len += t.length;
    }
  }
  return verses;
}

function normalize(raw: string): { text: string; map: number[] } {
  // map[i] = index in normalized text for raw index i (and raw.length).
  const map: number[] = new Array(raw.length + 1);
  let out = "";
  let prevSpace = true;
  for (let i = 0; i < raw.length; i++) {
    map[i] = out.length;
    const ch = raw[i];
    if (/\s/.test(ch)) {
      if (!prevSpace) { out += " "; prevSpace = true; }
    } else { out += ch; prevSpace = false; }
  }
  map[raw.length] = out.length;
  const trimmed = out.replace(/\s+$/, "");
  return { text: trimmed, map: map.map((x) => Math.min(x, trimmed.length)) };
}

function trimSpan(text: string, s: Span): Span {
  let { start, end } = s;
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  return { start, end };
}

export function chapterVerses(all: Map<string, SourceVerse>, book: string, chapter: number): SourceVerse[] {
  const out: SourceVerse[] = [];
  for (const v of all.values()) if (v.book === book && v.chapter === chapter) out.push(v);
  return out.sort((a, b) => a.verse - b.verse);
}

export function bookChapters(all: Map<string, SourceVerse>, book: string): number[] {
  const set = new Set<number>();
  for (const v of all.values()) if (v.book === book) set.add(v.chapter);
  return [...set].sort((a, b) => a - b);
}
