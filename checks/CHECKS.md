# Checks

These are deterministic. Implement them in code, never with a model.

- **In:** `candidate` + `batch`.
- **Out:** `check_report` (`schemas/check-report.schema.json`).

A **hard** failure makes the candidate ineligible after its one repair attempt. A **warning** is passed to reviewers as information.

**Agents give text, code gives positions.** An agent returns each verse's text and its changes as word pairs (KJV words, replacement words). Before checking, code turns that into the full candidate:

- character offsets for every change, located by token
- pronoun number marks, carried from the pretags through the token alignment
- italics, carried the same way
- the mechanical changes (pronouns and table verb forms), logged automatically

So no model ever has to count characters. The reference implementation is `harness/src/checks.ts`.

## Tokenization

- Split on whitespace and punctuation. Keep punctuation as separate tokens.
- Compare case-insensitively.
- Character offsets refer to the verse text as stored.

## C1. Schema (hard)

The candidate validates against `candidate.schema.json`, and its verse ids exactly match the batch's verse ids, in order.

## C2. Change log covers the diff (hard). Gate G4.

```
for each verse:
  hunks = token_diff(kjv.text, update.text)          # LCS over tokens
  for each hunk:
    require some change c where c.kjv span covers the hunk's kjv side
                          and c.update span covers its update side
  for each change c:
    require kjv.text[c.kjv.start:c.kjv.end] == c.kjv.text
    require update.text[c.update.start:c.update.end] == c.update.text
```

Changes must not overlap within a verse.

## C3. Pronoun number (hard). Gate G2.

```
for each pretag p with tag == "pronoun" and p.number:
  u = aligned position of p in the update (via the diff)
  if style == "marker":  require a pronoun_mark covering u with number == p.number
                         (except thyself and yourselves, which carry number in the word)
  if style == "you_all": pl → require "you all" (or "your", "yours" + mark) at u;
                         sg → require a mark or no mark per config
  require no pronoun_mark exists without a matching pretag
```

## C4. Mandatory updates applied (hard)

Every pretag with a non-null `mandatory_update` is replaced exactly by that text at its aligned position. Capitalization follows the source token.

The one exception is a glossary `KEEP` entry for that token in this verse.

## C5. Locked terms untouched (hard). Gate G3.

Every `locked` term in the KJV verse appears unchanged at its aligned position, and its small-caps flag is kept.

Any change touching an `escalate_only` term must have `uncertain: true`. If it does not, the check fails.

## C6. Glossary compliance (warning)

Sense cannot be checked by code, so this is a warning, not a hard failure.

For each `ratified` or `provisional` entry whose `kjv_form` or `forms` appear in the verse:

- If the verse id is in `examples`, require the entry's update.
  - Here the check is **hard**, because the sense is pinned.
- If the verse id is in `exceptions`, skip it.
- Otherwise, warn when the token was rendered differently. The reviewers judge the sense.

## C7. No additions (warning)

Warn for each change where the update has more than `max(2, 2 × kjv_words)` words. Reviewers check its reason against R9.

## C8. Italics preserved (hard)

Every KJV italic span is either:

- still present, as an italics span in the update covering the same aligned words, or
- covered by a logged change whose update inherits the italics, or
- covered by a logged removal.

## C9. Names and numbers (hard)

These must be unchanged at their aligned positions unless a `spelling` change covers them:

- capitalized tokens that are not sentence-initial and not in the pretag table
- digits, and the number words one through twenty, hundred and thousand

## C11. Pronoun number against the source language (warning, pretag stage)

For NT verses, compare each pretagged KJV pronoun's number with the second-person forms in the verse's `lookup.original` data:

- Morphology ending in `-2S` or `2S` means singular; `-2P` or `2P` means plural.
- Pronouns and second-person verbs both count, since the KJV often renders a Greek verb's person as a pronoun.

Warn when the counts per number do not reconcile. This catches tagging bugs, not KJV choices: the KJV wording still governs (P5). Run it once at pretag time, not per candidate.

## C10. Metrics (always)

Compute, per candidate:

| Metric | Definition |
|---|---|
| `change_count` | Number of logged changes. |
| `optional_change_count` | Changes that are not covering a pretag `mandatory_update` and not applying an entry in `examples`. |
| `word_delta` | Update word count minus KJV word count. |
| `chars_changed_ratio` | Levenshtein distance divided by KJV length. |

The scorer uses these as evidence for S1. The pilot metrics use them too.
