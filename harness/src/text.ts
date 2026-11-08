// Tokenization and alignment. Offsets are character offsets into the verse text.

export interface Token { text: string; norm: string; start: number; end: number; word: boolean }

const TOKEN_RE = /[A-Za-zÀ-ɏ]+(?:['’-][A-Za-zÀ-ɏ]+)*|\d+|[^\sA-Za-zÀ-ɏ\d]/g;

export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    const t = m[0];
    out.push({ text: t, norm: t.toLowerCase().replace(/’/g, "'"), start: m.index!, end: m.index! + t.length, word: /\w/.test(t) });
  }
  return out;
}

export function words(text: string): number {
  return tokenize(text).filter((t) => t.word).length;
}

/** Longest common subsequence alignment on normalized tokens. pairs[i] = j or -1. */
export function align(a: Token[], b: Token[]): { aToB: number[]; bToA: number[] } {
  const n = a.length, m = b.length;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i].norm === b[j].norm ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const aToB = new Array(n).fill(-1), bToA = new Array(m).fill(-1);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i].norm === b[j].norm) { aToB[i] = j; bToA[j] = i; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return { aToB, bToA };
}

export interface Hunk { a: [number, number]; b: [number, number] } // half-open token ranges

/** Contiguous regions where the two token lists differ. */
export function hunks(a: Token[], b: Token[], al = align(a, b)): Hunk[] {
  const out: Hunk[] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && al.aToB[i] === j) { i++; j++; continue; }
    const si = i, sj = j;
    while (i < a.length && al.aToB[i] === -1) i++;
    while (j < b.length && al.bToA[j] === -1) j++;
    if (i === si && j === sj) { // safety: should not happen with a consistent alignment
      if (i < a.length) i++; else j++;
    }
    out.push({ a: [si, i], b: [sj, j] });
  }
  return out;
}

/** Find a contiguous token sequence (by normalized text) in tokens, preferring the occurrence nearest `near`. */
export function locate(tokens: Token[], phrase: string, near = 0, used?: Set<number>): [number, number] | null {
  const p = tokenize(phrase).map((t) => t.norm);
  if (p.length === 0) return null;
  let best: [number, number] | null = null;
  for (let i = 0; i + p.length <= tokens.length; i++) {
    let ok = true;
    for (let k = 0; k < p.length; k++) if (tokens[i + k].norm !== p[k]) { ok = false; break; }
    if (!ok) continue;
    if (used && [...Array(p.length).keys()].some((k) => used.has(i + k))) continue;
    if (!best || Math.abs(i - near) < Math.abs(best[0] - near)) best = [i, i + p.length];
  }
  return best;
}

export function spanOf(tokens: Token[], r: [number, number]): { start: number; end: number } {
  if (r[0] >= r[1]) {
    const at = r[0] < tokens.length ? tokens[r[0]].start : tokens.length ? tokens[tokens.length - 1].end : 0;
    return { start: at, end: at };
  }
  return { start: tokens[r[0]].start, end: tokens[r[1] - 1].end };
}

export function matchCase(source: string, replacement: string): string {
  if (source.length > 1 && source === source.toUpperCase()) return replacement.toUpperCase();
  if (source[0] === source[0].toUpperCase() && source[0] !== source[0].toLowerCase())
    return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

/** Replace tokens by index with new strings, keeping all other characters as they were. */
export function replaceTokens(text: string, tokens: Token[], repl: Map<number, string>): string {
  let out = "", pos = 0;
  tokens.forEach((t, i) => {
    if (!repl.has(i)) return;
    out += text.slice(pos, t.start) + repl.get(i)!;
    pos = t.end;
  });
  return out + text.slice(pos);
}
