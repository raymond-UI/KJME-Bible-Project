// Offline reference library: STEPBible TAGNT (Greek NT) and TBESG (Greek lexicon), plus optional
// English 1611 dictionaries. See reference/REFERENCE.md. OT (TAHOT) lookups are not wired in the pilot.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NT_BOOKS, usfmToStep } from "./books.js";
import type { SourceVerse } from "./source.js";

export interface GreekWord {
  position: number; surface: string; transliteration: string; strongs: string; morphology: string;
  lemma: string; lemma_gloss: string; gloss: string; type: string;
}
export interface LexEntry { strongs: string; lemma: string; transliteration: string; gloss: string; definition: string }

export class Reference {
  private nt = new Map<string, GreekWord[]>(); // USFM verse id (KJV versification) -> words
  private lex = new Map<string, LexEntry>();
  private english = new Map<string, unknown[]>();
  available = { greek: false, lexicon: false, english: false };

  constructor(private dir: string, private source: Map<string, SourceVerse>, private accepted: () => Map<string, string>) {
    const step = join(dir, "stepbible");
    if (existsSync(step)) {
      for (const f of readdirSync(step)) {
        if (f.startsWith("TAGNT")) this.loadTagnt(join(step, f));
        if (f.startsWith("TBESG")) this.loadLexicon(join(step, f));
      }
    }
    for (const f of ["bible-word-book.json", "webster-1828.json"]) {
      const p = join(dir, "english", f);
      if (existsSync(p)) {
        const d = JSON.parse(readFileSync(p, "utf8"));
        for (const [k, v] of Object.entries(d)) this.english.set(k.toLowerCase(), [...(this.english.get(k.toLowerCase()) ?? []), { source: f, entries: v }]);
        this.available.english = true;
      }
    }
    this.available.greek = this.nt.size > 0;
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

  private loadLexicon(path: string): void {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const cols = line.split("\t");
      if (!/^G\d+/.test(cols[0] ?? "")) continue;
      const estrong = (cols[1] ?? "").split(/\s/)[0];
      const def = (cols[7] ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 700);
      const e: LexEntry = { strongs: estrong, lemma: cols[3], transliteration: cols[4], gloss: cols[6], definition: def };
      if (estrong && !this.lex.has(estrong)) this.lex.set(estrong, e);
      if (!this.lex.has(cols[0])) this.lex.set(cols[0], e);
    }
  }

  original(verseId: string): { verse_id: string; available: boolean; words?: GreekWord[]; note?: string } {
    const book = verseId.split(".")[0];
    if (!NT_BOOKS.has(book)) return { verse_id: verseId, available: false, note: "OT (Hebrew) lookups are not enabled in the pilot harness" };
    const words = this.nt.get(verseId);
    if (!words) return { verse_id: verseId, available: false, note: "no Greek data for this verse; run reference/fetch.sh" };
    return { verse_id: verseId, available: true, words };
  }

  /** Compact one-line-per-word form for prompts. */
  originalCompact(verseId: string): string {
    const r = this.original(verseId);
    if (!r.available) return `${verseId}: ${r.note}`;
    return `${verseId}:\n` + r.words!.map((w) => `  #${w.position} ${w.surface} (${w.transliteration}) ${w.strongs} ${w.morphology} ${w.lemma}="${w.lemma_gloss}"`).join("\n");
  }

  lexicon(strongs: string): LexEntry | { strongs: string; available: false } {
    return this.lex.get(strongs) ?? this.lex.get(strongs.replace(/[A-Z]$/, "")) ?? { strongs, available: false };
  }

  english1611(headword: string): unknown {
    if (!this.available.english) return { headword, available: false, note: "English 1611 sources not installed (reference/REFERENCE.md)" };
    return { headword, available: true, results: this.english.get(headword.toLowerCase()) ?? [] };
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

  /** Second-person singular/plural counts from Greek morphology (for check C11). */
  secondPersonCounts(verseId: string): { sg: number; pl: number } | null {
    const r = this.original(verseId);
    if (!r.available) return null;
    let sg = 0, pl = 0;
    for (const w of r.words!) {
      if (/(^|-)2[A-Z]*S$|2S/.test(w.morphology) && /^(P-2|V-)/.test(w.morphology)) sg++;
      if (/(^|-)2[A-Z]*P$|2P/.test(w.morphology) && /^(P-2|V-)/.test(w.morphology)) pl++;
    }
    return { sg, pl };
  }
}
