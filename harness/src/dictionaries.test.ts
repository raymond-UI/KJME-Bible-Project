import { expect, test } from "bun:test";
import { parseWebster, parseWordBook } from "./dictionaries.js";

const wordBook = [
  "PREFACE text before the entries.",
  "Abide,  v.  t.  (Acts  xx.  23).  To  await.",
  "Abject,  sb.  (Ps.  xxxv.  15).  A  worthless  per-",
  "son.",
  "Abjects  were  they  all.     Some  Author.",
  "6  THE  BIBLE",
  "Ability,  sb.  (Lev.  v.  7).  Means.",
  "Let  us  go,  said  he  (Gen.  i.  1).",
  "Let,  sb.  (Deut.  xv.  c).     Hindrance.",
  "Let,  v.  t.  (Rom.  i.  13).  To  hinder.",
  "Let  alone  (Mark  xv.  36).  Leave.",
  "Zcalous,  adj.  (Phil.  iii.  6).  Garbled  heading.",
  "Lewd,  adj.  (Acts  xvii.  5).  Ignorant.",
  "Lewdness,  sb.  (Judg.  xx.  6).  Wickedness.",
].join("\n");

test("parseWordBook splits entries by headword, with part of speech and references", () => {
  const d = parseWordBook(wordBook);
  expect(Object.keys(d)).toEqual(["abide", "abject", "ability", "let", "let alone", "lewd", "lewdness", "abjects"]);
  expect(d.abjects![0]!.within).toBe("Abject");
  expect(d.abject).toEqual([{ headword: "Abject", pos: "sb.", refs: "Ps. xxxv. 15", text: "Abject, sb. (Ps. xxxv. 15). A worthless person. Abjects were they all. Some Author." }]);
  expect(d.let!.map((e) => e.pos)).toEqual(["sb.", "v. t."]);
});

test("parseWordBook leaves quotations and garbled headings inside the entry before them", () => {
  const d = parseWordBook(wordBook);
  expect(d.ability![0]!.text).toContain("Let us go, said he");
  expect(d["let alone"]![0]!.text).toContain("Zcalous, adj.");
});

const vol = (heads: string[]) => ["FRONT MATTER, BY THE AUTHOR.", ...heads.flatMap((h) => [h, "body line."]), "CON"].join("\n");

test("parseWebster keys headwords without stress marks and skips front matter and column heads", () => {
  const d = parseWebster([{ text: vol(["CHAR'IOT, n. A car.", "CUAR'IOTEB, pp. Borne.", "CHARIOT-MAN, n. A driver.", "CHAR'ITY, n. Love.", "CHARM, n. A spell."]), start: /^CHAR'IOT,/m }]);
  expect(Object.keys(d)).toEqual(["chariot", "chariotman", "charity", "charm"]);
  expect(d.chariot![0]!.text).toContain("CUAR'IOTEB");
  expect(d.charm![0]!.text).toBe("CHARM, n. A spell. body line.");
});

test("parseWebster joins the volumes", () => {
  const d = parseWebster([
    { text: vol(["ABASE, v. t. To lower.", "ABATE, v. t. To lessen."]), start: /^ABASE,/m },
    { text: vol(["JAB'BER, v. i. To talk.", "JADE, n. A horse."]), start: /^JAB'BER,/m },
  ]);
  expect(Object.keys(d)).toEqual(["abase", "abate", "jabber", "jade"]);
});

test("parseWordBook keys a word treated inside another entry to that entry", () => {
  const d = parseWordBook(["Conversant,  to  be  (Josh.  viii.  35).  To  dwell.", "Conversation  occurs  twice  in  the  Old  Testament.", "Convert,  v.  t.  (Ps.  li.  13).  To  turn."].join("\n"));
  expect(d.conversation).toEqual([{ ...d.conversant![0]!, within: "Conversant" }]);
  expect(d.conversant![0]!.text).toContain("Conversation occurs twice");
});
