# Reference Library

An offline library that agents can consult **only to settle what the KJV English meant** (P5).

- It is fetched once at setup.
- Agents run with no network access. Their only route to outside knowledge is the `lookup` tool defined here.
- Every lookup is logged and published.

## Why offline

1. **P5 is enforceable only if the sources are fixed.** An agent with web access can pull in any modern version's wording. An agent with a pinned library can only see what we chose.
2. **Reproducibility.** The same inputs plus the same library give the same evidence. The library's manifest hashes go into every release.
3. **Transparency.** We can publish exactly which sources the committee was allowed to see.

## Contents

### Original languages: STEPBible Data (Tyndale House), CC BY 4.0

| File | What | Used for |
|---|---|---|
| TAGNT (2 files) | Greek NT, word by word: Strong's number, morphology, lemma gloss, and which editions contain each word | NT lookups |
| TAHOT (4 files) | Hebrew OT, word by word: Strong's number, morphology, gloss | OT lookups |
| TBESG / TBESH | Brief lexicons, keyed by extended Strong's number | Sense of a lemma |
| TVTMS | Versification mappings | Map KJV verse ids to the datasets' versification |

**The NT is filtered to the KJV's own Greek.** TAGNT tags each word's sources:

- `N` = Nestle-Aland
- `K` = the Greek of the KJV translators (Textus Receptus, Scrivener 1894)
- `O` = other editions

`lookup` returns only words whose type contains `K` or `k`. Words found only in modern critical texts never reach an agent. This keeps P6 (one base text) intact.

**The OT is close, not exact.** TAHOT is based on the Leningrad Codex. The KJV translators used the Bomberg/Ben Chayyim edition (1524–25). The two differ in a small number of places. Where the data marks a variant, `lookup` includes it. An agent must never treat a TAHOT reading as a reason to change the KJV.

How the harness reads TAHOT:

- It keeps Leningrad words (`L`), Qere corrections (`Q`, which the KJV translators normally followed) and restored text (`R`).
- It drops words reconstructed from the Septuagint (`X`), which the KJV's Hebrew does not have.
- A Ketiv or other meaning variant is shown with the word. Where the data says the Ben Chayyim edition differs (`H`), the word is flagged, because that edition is the KJV's Hebrew.
- Verses are keyed by TAHOT's English reference (NRSV versification). That matches the KJV almost everywhere in the OT. Psalm titles are verse 0 and are not looked up, because the source text does not yet carry them.

### English of 1611 (manual step, public domain)

The original languages tell us what the Greek or Hebrew word meant. They do not tell us what the **KJV's English word** meant in 1611, which is the real question under P5.

Two public-domain works answer that directly. `reference/fetch.sh` fetches both, through `harness/scripts/fetch-english.ts`:

| Work | Why |
|---|---|
| **The Bible Word-Book** (Eastwood & Wright, 1866; revised edition by W. Aldis Wright, 1884) | A glossary of archaic words and phrases in the Authorized Version, with KJV citations. The closest thing to a purpose-built source for this project. |
| **Webster's American Dictionary of the English Language** (1828) | Early modern senses of common words, before many of the shifts the glossary deals with. |

Sources, all archive.org OCR text of scans of the printed books (marked `NOT_IN_COPYRIGHT`), pinned by sha256:

- Bible Word-Book, 2nd edition (1884): `thebiblewordbook00eastuoft` (Knox College, Toronto). Of the seven scans, this one has the best OCR.
- Webster 1828: `americandictiona01websrich` (A to I) and `americandictiona02websrich` (J to Z), from the University of California Libraries.

Clean e-texts of Webster 1828 exist (on GitHub and elsewhere), but every one found is the modernised text of a website whose terms forbid storing it. They are not used, so do not swap one in.

The script keeps the raw text in `reference/data/english/raw/`, and parses each work into `reference/data/english/bible-word-book.json` and `webster-1828.json`, each as `{ headword: [entries] }`. Each entry is `{ headword, pos, refs?, text, within? }`. It records sources and hashes in `MANIFEST.json`. The parser uses alphabetical order to reject OCR-garbled headwords and quotations that look like headwords. A word that the Word-Book treats inside another entry ("Conversation" under "Conversant") is keyed to that entry, with `within` set.

What to expect:

- **OCR noise.** Expect misread letters in the body text, mostly in Webster.
- **Gaps in Webster.** The scan lost some entries where a column was misread. "Careful" and "Approve" are missing, for example.
- **Inflected forms.** For a word with no entry of its own, the lookup tries the base form (prevented → prevent, careth → care), separately in each work.
- **Long entries** are trimmed to 1,500 characters.

Without the files, `lookup.english_1611` returns `unavailable`, and agents lean on the glossary and on context.

## Setup

```
reference/fetch.sh                 # writes reference/data/ and reference/data/MANIFEST.json
```

- About 115 MB.
- The commit is pinned in the script. Bump it deliberately, re-run, and note the change in the changelog.
- `reference/data/` is **not** committed and **not** published. The STEPBible license asks that copies not be reposted, so releases publish the manifest (source, commit and hashes) and link to the source.

## The `lookup` tool

The runtime exposes one tool, `lookup`, to the agents listed below. It is read-only. Each call returns JSON and appends a `lookup` event to the record.

### Functions

| Function | Returns |
|---|---|
| `lookup.original(verse_id)` | The verse's source-language words, in order: `{position, surface, transliteration, strongs, morphology, lemma, lemma_gloss, sources}`. The NT is filtered to K words. |
| `lookup.lexicon(strongs)` | The brief lexicon entry for a Strong's number. |
| `lookup.english_1611(headword)` | Bible Word-Book and Webster 1828 entries for an English word. |
| `lookup.occurrences(kjv_form, limit)` | Up to `limit` other KJV verses containing the form, with their accepted KJME text if any. Used to check consistency of sense. |

### Example: Luke 22:32, "converted"

```
lookup.original("LUK.22.32")
  #05  σοῦ          G4771  P-2GS      "you"     sources NKO   → singular: matches "thee"
  #15  ἐπιστρέψας   G1994  V-AAP-NSM  "to turn" sources NKO
lookup.lexicon("G1994")
  ἐπιστρέφω: to turn about, round or towards; metaphorically, to turn
```

This confirms that 1611 "converted" here means *turned (back)*, which supports `g-converted-turn`. The agent cites it in the change's `evidence`.

## Preloading

Most of what agents need is predictable, so the batch stage runs it ahead of time (`PIPELINE.md`, stage 2):

- `original` for every verse
- `lexicon` for the lemmas behind pretagged and glossary tokens
- `english_1611` for those tokens

The pilot harness preloads `original` only; agents fetch lexicon entries with the tool. Preloading lexicon entries for tagged tokens needs an English-to-Greek word alignment, which is a later improvement.

The results go into the batch's `reference` block. That keeps tool calls rare, and makes single-turn batch mode possible. Preloaded lookups are logged and cited exactly like tool lookups.

## Rules of use

- **Who has access:** translators, the meaning auditor, the coordinator and the consistency editor.
  - The scorer does not, so it judges the English as an English reader would.
  - Feedback triage does not.
- **Budget:** `config.reference.max_lookups_per_agent_per_batch` (default 8).
- **Purpose:** to settle the KJV English sense, and nothing else. Specifically:
  - The **lemma glosses** in the data ("may fail", "you have turned back") are modern renderings by the dataset's editors. They are evidence of sense, **never wording to copy.** A change whose update text matches a gloss, where the KJV wording would have served, is a P5 failure.
  - A lookup can justify **keeping or restoring** the KJV sense. It can never justify **moving away** from it. If the Greek seems to say something the KJV English does not, keep the KJV and note it; that is outside this edition's scope.
- **Citation:** any change that relied on a lookup lists it in `evidence`, as `{lookup_id, note}`. The margin shows it.
