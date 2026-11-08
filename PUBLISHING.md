# Publishing

KJME is a published work. This file defines what a release contains, how text is formatted, how releases are versioned and cited, and how public feedback becomes a revision.

The rule behind all of it is P9: nothing in the edition is decided anywhere the public cannot see.

## Release gates

A book can be released only when all of these hold:

1. The book is `locked`: every batch is accepted, and the consistency pass has no remaining patches.
2. There are zero open escalations for the book.
3. Every accepted verse passes the hard checks (C1 to C5, C8, C9) when re-run on the final text.
4. A human editor has signed off on the book. The sign-off is recorded as an `event`, with the editor's name.
5. Every glossary entry the book uses is `ratified`. Provisional entries are ratified by an editor or by use count before release.

A release can contain one book or many. Early releases are partial, book by book.

## Versioning

- Releases use `MAJOR.MINOR`. For example, `KJME 0.1` is the Philippians preview.
- Released text is **immutable**. A correction ships in a new release, never as an edit to an old one.

| Bump | When |
|---|---|
| MINOR | New books are added, or verse corrections are made through feedback. Every changed verse is listed in the changelog. |
| MAJOR | The rules or principles change in a way that affects already-released text, which then gets re-run. |
| 1.0 | The full 66 books, with every book released. |

A verse's identity is stable across releases: `KJME 0.3 PHP.4.6`.

When a later decision replaces an earlier one, the new decision's `supersedes` field names the old one, so the full history of a verse can always be traced.

## Release layout

```
kjme-0.1/
  README.md                 front matter (below), rendered as the landing page
  CHANGELOG.md              per release: books added, verses changed, rules changed
  LICENSE.md
  CITATION.cff
  text/
    usfm/PHP.usfm           canonical text
    json/PHP.json           one published-verse record per verse
    plain/PHP.txt           readable text, plural style as configured
  margin/
    PHP.changes.json        every change, per verse
  glossary.json             every entry used by the release, with history
  record/
    candidates.jsonl
    check_reports.jsonl
    reviews.jsonl
    decisions.jsonl
    feedback.jsonl          public feedback received, and what happened to it
    events.jsonl            agent calls (prompt hashes, models, timings), sign-offs
    lookups.jsonl           every reference lookup: agent, batch, query, result
    reference-manifest.json sources, pinned commits and hashes of the offline library (data itself not reposted)
  system/                   snapshot of this folder at the commit used
    MANIFEST.json           path and content hash of every system file
```

The review site reads straight from this layout. Anything the site shows, someone can download and verify.

## Text formats

### USFM (canonical)

- Standard USFM 3, with `\add ...\add*` for italics carried over from the KJV.
- Pronoun number uses custom character markers, so number survives in the canonical text:
  - `\zsg you\zsg*` for singular
  - `\zpl you\zpl*` for plural
- Small caps: `\nd LORD\nd*`, the standard divine-name marker.
- No footnotes, headings or cross-references. The margin is published separately, not mixed into the text.

### JSON

One `published-verse` record per verse (`schemas/published-verse.schema.json`):

- the KJME text, pronoun marks and italics
- the KJV text
- change ids into `margin/`
- the decision id
- the release it first appeared in, and the release it last changed in

### Plain text

- Rendered with `release.plain_style`. The default, `marker`, prints plural "you" as "you(pl)".
- One verse per line, prefixed by its reference.
- For reading and for search engines. It is never the canonical text.

## The margin

`margin/<BOOK>.changes.json` holds every change in the book's final text, using the standard change format plus:

- `decision_id`: the decision that accepted it
- `glossary_id`: the entry it applied, if any
- `alternatives`: the other candidates' renderings at the same site, when they differed, with their authors
- `escalated`: whether a human decided it, and the editor's note

This is what the review site shows beside each verse: what changed, why, what else was proposed, and who decided.

## Front matter

Every release README, and the review site's "About" page, contains these sections in this order.

1. **Title.** "King James Margin Edition (KJME), release `<version>`."
2. **How this edition was made.** The statement below, unedited.
3. **The Committee to the Reader.** A short preface in the spirit of the 1611 translators' "The Translators to the Reader": why this edition exists, what it keeps, and what it changes. A human editor writes it.
4. **Principles and rules.** `SYSTEM.md` principles and `rules/update-rules.md`, in full.
5. **Base text.** The 1769 source edition used, with where it came from and its hash.
6. **Credits.**
   - every model used, by role, with versions
   - every human editor, by name
   - public contributors whose feedback changed a verse, by name or handle, if they opted in
   - reference sources: "Original-language data from STEPBible Data, Tyndale House (STEPBible.github.io/STEPBible-Data), CC BY 4.0", plus the English historical works used
7. **Acknowledgment.** The principles are adapted from the KJV Update Project (The Holy Scriptures Bible Society). KJME is independent, and not affiliated with or endorsed by them.
8. **License and citation.**

### "How this edition was made"

Use this text on every published surface:

> The King James Margin Edition updates the English of the 1769 King James Version for modern readers, without changing its meaning. It is not a new translation from Hebrew or Greek.
>
> Each passage was updated by three AI translator agents working independently under published rules, checked by code, and judged by two AI reviewer agents. A coordinator agent selected the final wording, and human editors decided every contested case and signed off on each book.
>
> Every change is shown in the margin with its reason. Every draft, review and decision is public, along with the system that produced them. If you think a change is wrong, tell us. Corrections are published, never made silently.

## Licensing

Decide these before the first public release. Recorded here as defaults to confirm:

| Part | Default | Note |
|---|---|---|
| KJME text, margin, glossary | CC BY 4.0 | Free to reuse with attribution, including in apps and churches. |
| Record (candidates, reviews, decisions) | CC BY 4.0 | |
| System (this folder) | MIT | |
| Base KJV text | Public domain outside the UK | In the UK, Crown copyright administered by Cambridge University Press. Get advice or permission before releasing from a UK entity. |

## Citation

`CITATION.cff` names the edition, the release, the date, Mzed Studio as publisher and the editors.

Short citation: `KJME 0.1, Philippians 4:6`.

## Public feedback

Feedback is how the crowd improves the text without anyone being able to edit it directly.

### Intake

- On the review site, a reader can flag a single **change**, or a single **verse** where a change is missing.
- Each flag records a `feedback` record (`schemas/feedback.schema.json`):
  - the verse, and the change if one was flagged
  - a type: `meaning`, `missed_archaism`, `unneeded_change`, `consistency`, `pronoun`, or `other`
  - the reader's argument
  - an optional proposed wording
  - optional attribution: name or handle, with opt-in

### Triage

Triage runs on a schedule, using `agents/feedback-triage.md`. For each verse with new feedback, it decides:

| Outcome | When |
|---|---|
| `merge` | Duplicates an existing open item. Attach the feedback to it. |
| `dismiss` | No argument, off-topic, or asks for something the rules forbid (for example, a paraphrase). The reason is published. |
| `answer` | Already decided, and the margin explains it. Point to the decision. |
| `reopen` | Makes an argument the record does not already address. |

### Re-review

- A `reopen` creates a new batch run for the affected verses only.
  - The original decision, and the feedback argument, are passed to the translators and reviewers as context.
  - The new decision `supersedes` the old one.
- Feedback that argues against a G1 decision, or against a ratified glossary entry, always goes to a human editor.
- Accepted changes ship in the next MINOR release. Every changed verse appears in the changelog, with the feedback id that caused it.

### Published outcomes

Every feedback item, and what happened to it, is published in `record/feedback.jsonl`, including dismissals. Readers can see that feedback is actually read.

## Never

- Never edit released text in place.
- Never publish a decision without its rationale.
- Never remove a record, including candidates that lost, dismissed feedback, or superseded decisions.
- Never present KJME as a translation from the original languages, or as associated with another project.
