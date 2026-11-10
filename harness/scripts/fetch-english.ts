#!/usr/bin/env bun
// Fetch and convert the English 1611 sources (reference/REFERENCE.md, "English of 1611"):
//
//   bun harness/scripts/fetch-english.ts [target_dir]     (default: reference/data; run by reference/fetch.sh)
//
// Both are archive.org OCR text of scans of the printed books, which are out of copyright. Clean e-texts of
// Webster 1828 exist, but every one found traces to a site whose terms forbid keeping a copy, so they are not used.
// The raw text is pinned by sha256 and kept in english/raw/; the parsed dictionaries go to english/*.json, and
// both are recorded in MANIFEST.json. Like the rest of reference/data, none of it is committed.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseWebster, parseWordBook, type Dictionary } from "../src/dictionaries.js";

const TARGET = resolve(process.argv[2] ?? join(import.meta.dir, "..", "..", "reference", "data"));
const IA = "https://archive.org/download";

interface Raw { item: string; file: string; sha256: string; start?: RegExp }
const SOURCES: { name: string; out: string; license: string; edition: string; raws: Raw[]; parse: (texts: string[], raws: Raw[]) => Dictionary }[] = [
  {
    name: "The Bible Word-Book (Eastwood & Wright)", out: "bible-word-book.json", license: "Public domain (1884); archive.org NOT_IN_COPYRIGHT",
    edition: "2nd edition, revised by W. Aldis Wright, London: Macmillan, 1884. Scan: Knox College, University of Toronto",
    raws: [{ item: "thebiblewordbook00eastuoft", file: "thebiblewordbook00eastuoft_djvu.txt", sha256: "16107f84653d666e3cdab12dbd392793cf5f890f8d3a6074e93fbb6eaa23401f" }],
    parse: ([t]) => parseWordBook(t!),
  },
  {
    name: "Webster, An American Dictionary of the English Language", out: "webster-1828.json", license: "Public domain (1828); archive.org NOT_IN_COPYRIGHT",
    edition: "1st edition, New York: S. Converse, 1828, 2 volumes. Scan: University of California Libraries",
    raws: [
      { item: "americandictiona01websrich", file: "americandictiona01websrich_djvu.txt", sha256: "a6983cbcd36b07355b57a6cae6342da40008557468781e575ac68cceec652832", start: /^AB.ACIST,/m },
      { item: "americandictiona02websrich", file: "americandictiona02websrich_djvu.txt", sha256: "31666d1d34d7579a135a3865a6fe21671991f0e56b025f9025772df0c3923b2b", start: /^JAB.BER,/m },
    ],
    parse: (texts, raws) => parseWebster(texts.map((text, i) => ({ text, start: raws[i]!.start! }))),
  },
];

const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

async function raw(r: Raw): Promise<string> {
  const p = join(TARGET, "english", "raw", r.file);
  if (!existsSync(p)) {
    const url = `${IA}/${r.item}/${r.file}`;
    console.log(`  downloading ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    writeFileSync(p, Buffer.from(await res.arrayBuffer()));
  }
  const buf = readFileSync(p);
  if (sha(buf) !== r.sha256) throw new Error(`${r.file}: sha256 ${sha(buf)} does not match the pinned ${r.sha256}. Delete it and re-run, or bump the pin deliberately.`);
  return buf.toString("utf8");
}

mkdirSync(join(TARGET, "english", "raw"), { recursive: true });
const files: { path: string; sha256: string; bytes: number }[] = [];
const record = (rel: string) => { const b = readFileSync(join(TARGET, rel)); files.push({ path: rel, sha256: sha(b), bytes: b.length }); };
for (const s of SOURCES) {
  console.log(s.name);
  const texts = await Promise.all(s.raws.map(raw));
  const d = s.parse(texts, s.raws);
  writeFileSync(join(TARGET, "english", s.out), JSON.stringify(d));
  console.log(`  ${Object.keys(d).length} headwords -> english/${s.out}`);
  for (const r of s.raws) record(`english/raw/${r.file}`);
  record(`english/${s.out}`);
}

// Merge into MANIFEST.json, replacing any earlier English entries.
const mp = join(TARGET, "MANIFEST.json");
const m = existsSync(mp) ? JSON.parse(readFileSync(mp, "utf8")) : { sources: [], files: [] };
m.sources = [...(m.sources ?? []).filter((x: any) => !SOURCES.some((s) => s.name === x.name)),
  ...SOURCES.map((s) => ({ name: s.name, edition: s.edition, license: s.license, urls: s.raws.map((r) => `${IA}/${r.item}/${r.file}`), fetched_at: new Date().toISOString() }))];
m.files = [...(m.files ?? []).filter((f: any) => !String(f.path).startsWith("english/")), ...files];
writeFileSync(mp, JSON.stringify(m, null, 2) + "\n");
console.log(`English sources ready in ${join(TARGET, "english")}; MANIFEST.json updated.`);
