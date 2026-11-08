// Stage 2: batch a chapter's verses (PIPELINE.md, stage 2).
import type { PretaggedVerse } from "./pretag.js";

export interface BatchPlan { id: string; book: string; chapter: number; verses: PretaggedVerse[] }

const endsSentence = (t: string) => /[.?!]["'’)]*$/.test(t.trim());

export function planBatches(verses: PretaggedVerse[], min: number, max: number): BatchPlan[] {
  if (verses.length === 0) return [];
  // 1. Split into paragraphs.
  const paras: PretaggedVerse[][] = [];
  for (const v of verses) {
    if (v.paragraph_start || paras.length === 0) paras.push([v]);
    else paras[paras.length - 1].push(v);
  }
  // 2. Split long paragraphs at sentence ends, as evenly as the max allows.
  const groups: PretaggedVerse[][] = [];
  for (const p of paras) {
    let cur: PretaggedVerse[] = [];
    for (let i = 0; i < p.length; i++) {
      cur.push(p[i]);
      const remaining = p.length - i - 1;
      const atEnd = endsSentence(p[i].text);
      if (remaining === 0) { groups.push(cur); cur = []; break; }
      const target = Math.ceil(p.length / Math.ceil(p.length / max));
      if (atEnd && cur.length >= Math.min(target, max) && remaining >= 1) { groups.push(cur); cur = []; continue; }
      if (cur.length >= max * 2) { groups.push(cur); cur = []; } // hard stop: no sentence end found for a long run
    }
    if (cur.length) groups.push(cur);
  }
  // 3. Merge groups shorter than min into a neighbor when it fits.
  for (let i = 0; i < groups.length; i++) {
    if (groups[i].length >= min || groups.length === 1) continue;
    const prev = groups[i - 1], next = groups[i + 1];
    if (prev && prev.length + groups[i].length <= max) { prev.push(...groups[i]); groups.splice(i, 1); i--; }
    else if (next && next.length + groups[i].length <= max) { next.unshift(...groups[i]); groups.splice(i, 1); i--; }
  }
  const { book, chapter } = verses[0];
  return groups.map((g, k) => ({ id: `${book}.${chapter}.b${String(k + 1).padStart(2, "0")}`, book, chapter, verses: g }));
}
