// Offline reference library: STEPBible TAGNT (Greek NT), TAHOT (Hebrew OT), TBESG and TBESH (lexicons),
// plus optional English 1611 dictionaries. See reference/REFERENCE.md.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NT_BOOKS, usfmToStep } from "./books.js";
import type { SourceVerse } from "./source.js";

export interface GreekWord {
  position: number; surface: string; transliteration: string; strongs: string; morphology: string;
  lemma: string; lemma_gloss: string; gloss: string; type: string;
  /** Hebrew only: the Ben Chayyim edition (the KJV's Hebrew) or another witness reads differently here. */
  variant?: string;
}
/** One TAHOT line as a word, or null for a word the KJV's Hebrew does not have (LXX-derived "X" text). */
const ENTRY_CHARS = 1500;
const ENGLISH_SOURCES = ["bible-word-book.json", "webster-1828.json"];
/** Base forms to try for an inflected KJV word with no entry of its own: prevented -> prevent, careth -> care. */
export function baseForms(w: string): string[] {
  const out: string[] = [];
  for (const [suf, add] of [["eth", ""], ["eth", "e"], ["est", ""], ["est", "e"], ["ed", ""], ["ed", "e"], ["ing", ""], ["ing", "e"], ["es", ""], ["s", ""], ["ly", ""]] as const)
    if (w.endsWith(suf) && w.length - suf.length >= 3) out.push(w.slice(0, -suf.length) + add);
  return [...new Set(out)];
}

export function tahotWord(line: string): { id: string; word: GreekWord } | null {
  const m = line.match(/^([1-3A-Za-z]{3})\.(\d+)\.(\d+)(?:\([^)]*\))?#(\d+)=(\S+)/);
  if (!m || m[5]!.startsWith("X")) return null;
  const cols = line.split("\t");
  // The root element of the expanded tags, e.g. {H7225G=רֵאשִׁית=: beginning»first:1_beginning}.
  const root = (cols[11] ?? "").match(/\{(H\d+[A-Z]?)=([^=]*)=([^}]*)\}/);
  const strongs = root?.[1] ?? ((cols[4] ?? "").match(/\{(H\d+[A-Z]?)\}/)?.[1] ?? "");
  const word: GreekWord = {
    position: +m[4]!, surface: (cols[1] ?? "").replace(/[/\\]/g, ""), transliteration: cols[2] ?? "", strongs,
    morphology: cols[5] ?? "", lemma: root?.[2] ?? "", lemma_gloss: (root?.[3] ?? "").replace(/^:\s*/, "").split("»")[0]!.trim(),
    gloss: (cols[3] ?? "").trim(), type: m[5]!,
  };
  if (/H/.test(m[5]!.slice(1))) word.variant = `the Ben Chayyim edition differs here${cols[6] ? `: ${cols[6].trim()}` : ""}`;
  else if (cols[6]?.trim()) word.variant = cols[6].trim();
  return { id: `${m[1]!.toUpperCase()}.${m[2]}.${m[3]}`, word };
}
export interface LexEntry { strongs: string; lemma: string; transliteration: string; gloss: string; definition: string }

export class Reference {
  private nt = new Map<string, GreekWord[]>(); // USFM verse id (KJV versification) -> words
  private ot = new Map<string, GreekWord[]>(); // USFM verse id (English versification) -> words
  private lex = new Map<string, LexEntry>();
  private english = new Map<string, unknown[]>();
  available = { greek: false, hebrew: false, lexicon: false, english: false };

  constructor(private dir: string, private source: Map<string, SourceVerse>, private accepted: () => Map<string, string>) {
    const step = join(dir, "stepbible");
    if (existsSync(step)) {
      for (const f of readdirSync(step)) {
        if (f.startsWith("TAGNT")) this.loadTagnt(join(step, f));
        if (f.startsWith("TAHOT")) this.loadTahot(join(step, f));
        if (f.startsWith("TBESG") || f.startsWith("TBESH")) this.loadLexicon(join(step, f));
      }
    }
    for (const f of ENGLISH_SOURCES) {
      const p = join(dir, "english", f);
      if (existsSync(p)) {
        const d = JSON.parse(readFileSync(p, "utf8"));
        for (const [k, v] of Object.entries(d)) this.english.set(k.toLowerCase(), [...(this.english.get(k.toLowerCase()) ?? []), { source: f, entries: v }]);
        this.available.english = true;
      }
    }
    this.available.greek = this.nt.size > 0;
    this.available.hebrew = this.ot.size > 0;
    this.available.lexicon = this.lex.size > 0;
  }

  private loadTagnt(path: string): void {
    const stepToUsfm = new Map<string, string>();
    for (const b of NT_BOOKS) stepToUsfm.set(usfmToStep(b), b);
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^([1-3A-Za-z]{3})\.(\d+)\.(\d+)(?:\[(\d+)\.(\d+)\])?(?:\([^)]*\))?(?:\{[^}]*\})?#(\d+)=(\S+)/);
      if (!m) continue;
      const type = m[7];
      if (!/k/i.test(type)) continue; // keep only words in the KJV's Greek (Textus Receptus, Scrivener 1894)
      const usfm = stepToUsfm.get(m[1]);
      if (!usfm) continue;
      const ch = m[4] ?? m[2], vs = m[5] ?? m[3]; // square brackets carry the KJV versification
      const cols = line.split("\t");
      const sm = (cols[1] ?? "").match(/^(.*?)\s*\((.*)\)\s*$/);
      const [strongs, morphology] = (cols[3] ?? "").split("=");
      const [lemma, lemma_gloss] = (cols[4] ?? "").split("=");
      const id = `${usfm}.${ch}.${vs}`;
      const arr = this.nt.get(id) ?? [];
      arr.push({
        position: +m[6], surface: sm ? sm[1] : cols[1], transliteration: sm ? sm[2] : "", strongs: strongs ?? "",
        morphology: morphology ?? "", lemma: lemma ?? "", lemma_gloss: lemma_gloss ?? "", gloss: (cols[2] ?? "").trim(), type,
      });
      this.nt.set(id, arr);
    }
  }

  private loadTahot(path: string): void {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const w = tahotWord(line);
      if (w) this.ot.set(w.id, [...(this.ot.get(w.id) ?? []), w.word]);
    }
  }

  private loadLexicon(path: string): void {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const cols = line.split("\t");
      if (!/^[GH]\d+/.test(cols[0] ?? "")) continue;
      const estrong = (cols[1] ?? "").split(/\s/)[0];
      const def = (cols[7] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 700);
      const e: LexEntry = { strongs: estrong, lemma: cols[3], transliteration: cols[4], gloss: cols[6], definition: def };
      if (estrong && !this.lex.has(estrong)) this.lex.set(estrong, e);
      if (!this.lex.has(cols[0])) this.lex.set(cols[0], e);
    }
  }

  original(verseId: string): { verse_id: string; available: boolean; language?: "greek" | "hebrew"; words?: GreekWord[]; note?: string } {
    const nt = NT_BOOKS.has(verseId.split(".")[0]!);
    const language = nt ? "greek" : "hebrew";
    const words = (nt ? this.nt : this.ot).get(verseId);
    if (!words) return { verse_id: verseId, available: false, note: `no ${language === "greek" ? "Greek" : "Hebrew"} data for this verse; run reference/fetch.sh` };
    return { verse_id: verseId, available: true, language, words };
  }

  /** Compact one-line-per-word form for prompts. */
  originalCompact(verseId: string): string {
    const r = this.original(verseId);
    if (!r.available) return `${verseId}: ${r.note}`;
    return `${verseId} (${r.language}):\n` + r.words!.map((w) => `  #${w.position} ${w.surface} (${w.transliteration}) ${w.strongs} ${w.morphology} ${w.lemma}="${w.lemma_gloss}"${w.variant ? ` [variant: ${w.variant}]` : ""}`).join("\n");
  }

  lexicon(strongs: string): LexEntry | { strongs: string; available: false } {
    return this.lex.get(strongs) ?? this.lex.get(strongs.replace(/[A-Z]$/, "")) ?? { strongs, available: false };
  }

  english1611(headword: string): unknown {
    if (!this.available.english) return { headword, available: false, note: "English 1611 sources not installed (reference/REFERENCE.md)" };
    const key = headword.toLowerCase().trim(), tries = [key, ...baseForms(key)];
    // Each source separately: one may have the inflected form and the other only the base word.
    const results = ENGLISH_SOURCES.flatMap((source) => {
      for (const k of tries) {
        const r = (this.english.get(k) ?? []).find((x: any) => x.source === source) as { entries: { text: string }[] } | undefined;
        if (r) return [{ source, ...(k !== key ? { matched: k } : {}), entries: r.entries.slice(0, 4).map((e) => e.text.length > ENTRY_CHARS ? { ...e, text: `${e.text.slice(0, ENTRY_CHARS)} [...]` } : e) }];
      }
      return [];
    });
    return { headword, available: true, results,
      note: "OCR of the printed books: expect misread letters. Webster 1828 lacks some entries where the scan lost a column." };
  }

  occurrences(kjvForm: string, limit = 10): unknown {
    const needle = new RegExp(`\\b${kjvForm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    const acc = this.accepted();
    const hits: unknown[] = [];
    for (const v of this.source.values()) {
      if (needle.test(v.text)) hits.push({ verse_id: v.id, kjv: v.text, kjme: acc.get(v.id) ?? null });
      if (hits.length >= Math.min(limit, 25)) break;
    }
    return { kjv_form: kjvForm, results: hits };
  }

  /** Second-person singular/plural counts from Greek or Hebrew morphology (for check C11). */
  secondPersonCounts(verseId: string): { sg: number; pl: number } | null {
    const r = this.original(verseId);
    if (!r.available) return null;
    const count = r.language === "hebrew" ? hebrewSecondPerson : greekSecondPerson;
    return r.words!.reduce((n, w) => { const c = count(w.morphology); return { sg: n.sg + c.sg, pl: n.pl + c.pl }; }, { sg: 0, pl: 0 });
  }
}

function greekSecondPerson(m: string): { sg: number; pl: number } {
  const person = /^(P-2|V-)/.test(m);
  return { sg: +(person && /(^|-)2[A-Z]*S$|2S/.test(m)), pl: +(person && /(^|-)2[A-Z]*P$|2P/.test(m)) };
}
/** Hebrew and Aramaic codes carry person, gender and number together, e.g. Vqp2ms or a suffix Sp2fp; each counts. */
function hebrewSecondPerson(m: string): { sg: number; pl: number } {
  const hits = [...m.matchAll(/2[mfcb]([sp])/g)].map((x) => x[1]);
  return { sg: hits.filter((n) => n === "s").length, pl: hits.filter((n) => n === "p").length };
}
