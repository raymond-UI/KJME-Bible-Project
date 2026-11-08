# System

## Purpose

Produce the **King James Margin Edition (KJME)**: an edition of the King James Version that a modern reader understands, without changing its meaning anywhere. It is made by a committee of agents, with human review, through a granular pipeline, and every part of the process is published.

Each release has three outputs, all public (see `PUBLISHING.md`):

- **The text:** the accepted KJME text for every verse in scope.
- **The margin:** every change against the KJV, with its category, reason and glossary entry. This is what readers see beside the text, and what gives the edition its name.
- **The record:** every candidate, check, review, decision and glossary revision, plus this system as it was when the release was made.

## Principles

These come from the KJV Update Project's published goals. Every rule, rubric item and check traces back to one of them.

| # | Principle | Source idea |
|---|---|---|
| P1 | **Meaning never changes.** For 100% of the text, the update means what the KJV means. | "without changing the meaning for 100% of the text" |
| P2 | **Change as little as possible.** A change needs a reason. Keeping is the default. | "alter as little of the text as possible" |
| P3 | **Keep the style.** Word order, cadence, register and sentence shape stay KJV. | "fully maintaining the same meaning and style" |
| P4 | **Keep pronoun number.** Singular and plural "you" stay distinguishable. | "making known the grammatical number of second person pronouns" |
| P5 | **Update the English, not the translation.** The source is the KJV text. Hebrew and Greek may be consulted only to settle what the KJV English meant, never to prefer a different rendering or reading. | Critique of the NKJV as "new translation from the original languages" |
| P6 | **One base text.** No textual-variant notes. No alternative readings. | Critique of NKJV "textual notes regarding variant readings" |
| P7 | **Consistency.** The same word in the same sense gets the same update everywhere. | Implied by "definitive" |
| P8 | **Every change is explainable.** Each change is tagged with a category and a reason. | Added for this system: makes review possible |
| P9 | **Everything is published.** The text, the margin, the record and the system. Nothing in the edition is decided anywhere the public cannot see. Released text is never edited silently; corrections ship as new versions with a changelog. | Added for this system: the edition's identity |

When principles conflict:

- **P1 wins over everything.**
- **P4 wins over P2 and P3.**
- **P2 wins over clarity.**

## Scope

- **In scope:** the 66 books of the KJV (1769 text), processed book by book, chapter by chapter, in batches.
- **First run:** one pilot book (see `PIPELINE.md`, Pilot).
- **Out of scope:**
  - the Apocrypha
  - the 1611 translators' preface and marginal notes
  - chapter summaries
  - cross-references

## What KJME is, and is not

**KJME is a version of the KJV.** It is an edition of the 1769 text with its English updated. Describe it that way everywhere.

It is not:

- **A translation from the original languages.** In Bible publishing, "translation" means working from Hebrew and Greek. KJME works from the KJV English (P5). Saying so plainly is part of being transparent.
- **A paraphrase or a study Bible.** There are no added notes, headings or interpretations.
- **The KJV Update Project's text,** or an attempt to predict it.

### How it was made

Every published surface carries the "How this edition was made" statement from `PUBLISHING.md`: AI agents working under published rules, with human review of contested decisions, and the full record available to anyone.

## Definitions

| Term | Meaning |
|---|---|
| **Verse** | One KJV verse with its text, italic spans and pretags. |
| **Pretag** | A token-level tag produced by code from `data/` tables. Examples: a pronoun and its number, an archaic verb form, a glossary hit, a locked term. |
| **Mechanical draft** | The text with only table-driven updates applied (pronouns, verb forms). Produced by code. Every candidate starts from it. |
| **Batch** | 2 to 6 consecutive verses, usually a paragraph. The unit of work. |
| **Candidate** | One translator's update of a batch, with a change log. |
| **Change** | One edit: KJV span → update span, with a category and a reason. |
| **Gate** | A pass/fail rubric item. A candidate that fails any gate cannot win. |
| **Glossary entry** | A decision about one KJV word or phrase in one sense: what it becomes, or `KEEP`. |
| **Escalation** | A batch, or a glossary entry, sent to a human. |

## Roles

| Role | Count | Agent file | Job |
|---|---|---|---|
| Translator | 3 | `agents/translator-*.md` | Produce candidates, each from a different instinct inside the same rules. |
| Reviewer | 2 | `agents/reviewer-scorer.md`, `agents/reviewer-meaning-auditor.md` | Judge candidates: one by the full rubric, one only for meaning and number. |
| Coordinator | 1 | `agents/coordinator.md` | Decide, merge, update the glossary, escalate. |
| Consistency editor | 1 | `agents/consistency-editor.md` | Book-level pass after all of a book's batches are accepted. |
| Feedback triage | 1 | `agents/feedback-triage.md` | Groups and filters public feedback, and turns substantive feedback into re-review requests. |
| Human editor | 1+ | none | Resolves escalations. Ratifies glossary entries on locked or contested terms. Signs off each book before release. Named in the release credits. |

Translators are most useful when they run on **different model families**. Persona prompts alone tend to converge.
