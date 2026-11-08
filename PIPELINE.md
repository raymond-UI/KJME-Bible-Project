# Pipeline

## Overview

```
ingest → pretag → batch → translate (x3) → check → review (x2) → [debate] → coordinate → glossary → accept
                                              ↑ repair once            ↓
                                                                   escalate → human → accept
after every batch in a book is accepted: consistency pass → lock book → editor sign-off → release
after release: public feedback → triage → reopen → re-run affected verses → next release
```

Code runs the stages in **bold** below. Agents run the rest.

## Stages

### Setup (once)

- Run `reference/fetch.sh` and add the English historical sources (`reference/REFERENCE.md`).
- Record `reference/data/MANIFEST.json` as an `event`.
- From here on, agents run with no network access.

### 0. **Ingest** (code)

- **In:** source USFM or JSON.
- **Out:** `verse` records.

Steps:

- Parse each verse into `id`, `text`, `italics` spans and `paragraph_start` (true if a `\p` precedes it).
- Keep LORD/GOD small caps as a flag on the span.
- Normalize whitespace only. Never change characters.

### 1. **Pretag** (code)

- **In:** `verse`.
- **Out:** `verse.pretag[]` and `verse.mechanical`.

Steps:

- Tokenize. Tag each token from `data/archaic-forms.json`, `data/locked-terms.json` and the current glossary.
- For pronouns, record `number`.
- For table-covered forms, record `mandatory_update`.
- Build `mechanical`, the verse with only `mandatory_update` replacements applied, plus its `pronoun_marks`.
- Flag any untabled `-est` or `-eth` form near "thou" or a third-person subject as `verb_form` with `mandatory_update: null`. An agent resolves it.

### 2. **Batch** (code)

- **In:** a chapter's verses.
- **Out:** `batch` records, valid against `schemas/batch.schema.json`.

Rules:

- Start a new batch at each `paragraph_start`.
- Split paragraphs longer than `config.batch.max_verses`. Split only at a verse whose text ends with `.` `?` or `!`, and never inside a sentence.
- Merge a batch shorter than `config.batch.min_verses` into its neighbor, unless that would exceed the maximum.
- Context attached to each batch:
  - full KJV chapter text
  - text of the up to 2 previous accepted batches in the chapter (if any)
  - glossary entries whose `kjv_form` appears in the batch, plus their `glossary_version`
  - **preloaded reference:** `lookup.original` for every verse in the batch, plus `lookup.lexicon` for every lemma behind a pretagged or glossary token. Agents with reference access get it in their input, so most batches need no tool calls at all. The `lookup` tool stays available for anything else.

### 3. Translate (agents, parallel)

- **Agents:** `translator-minimalist`, `translator-clarity`, `translator-cadence`.
- **In:** `batch`.
- **Out:** one `candidate` each.

All three run in parallel and do not see each other.

### 4. **Check** (code)

- **In:** `candidate` + `batch`.
- **Out:** `check_report`.

Steps:

- Run every check in `checks/CHECKS.md`.
- **Repair:** if a hard check fails, send the candidate back to its author once, with the report attached. Run the checks again.
- A candidate that still fails is `ineligible`. It is kept for the record.

### 5. Review (agents, parallel)

- **Agents:** `reviewer-scorer`, `reviewer-meaning-auditor`.
- **In:** `batch`, the eligible candidates relabeled `A`, `B`, `C` in a random order per reviewer, and their check reports. The mechanical draft is included as label `M`.
- **Out:** `review` with `round: 1`.

### 6. Debate (agents, conditional)

Debate runs if any of these hold:

- the reviewers' top-ranked labels differ
- they disagree on any gate for any candidate
- the scorer's top two weighted totals differ by less than `config.escalation.score_gap`

Each reviewer then receives the other's round-1 review and returns a `review` with `round: 2`. There is at most one round (`config.debate_rounds`). No further rounds.

### 7. Coordinate (agent)

- **Agent:** `coordinator`.
- **In:** `batch`, candidates (de-anonymized), check reports, all reviews.
- **Out:** `decision`.

There are three possible outcomes:

- **`select`:** one eligible candidate wins as-is.
- **`merge`:** the final text is assembled change by change from eligible candidates. The merged text goes back through stage 4. If it fails, the decision becomes `escalate`.
- **`escalate`:** see Escalation below.

### 8. **Glossary update** (code)

- **In:** `decision.glossary_proposals`.

Steps:

- A new entry becomes `provisional`, recorded with the decision id.
- An entry used in `config.glossary.ratify_after_uses` accepted decisions, with no conflicting proposal, becomes `ratified`.
- Conflicting proposals (same `kjv_form` and sense, different `update`) pause ratification and raise a `glossary_conflict` escalation.
- Every write bumps `glossary_version`.

### 9. **Accept** (code)

- Store `decision.final_verses` as the accepted text for the batch.
- Mark the batch `accepted`.

### 10. Consistency pass (code, then agent, per book)

- **Runs when:** every batch in the book is `accepted`.

**10a. Drift grouping (code).** Build one **drift group** per finding, from the accepted change logs:

| Group type | Built from |
|---|---|
| `divergent_rendering` | The same `kjv_form` updated to different texts in different verses, or kept in some and changed in others. |
| `stale_glossary` | Decisions made under an older glossary version whose rendering no longer matches the current entry. |
| `pronoun_mark` | Any mark that differs from its pretag. Fixed by code directly; listed for the record. |
| `boundary_seam` | Sentences that cross a batch boundary. Both sides go in one group. |

Each group carries only the verses involved, their KJV text, their accepted text and the relevant glossary entries. A group is small: well under 100k tokens, so Haiku 5.5 stays at its base rate.

**10b. Judge (agent).**

- **Agent:** `consistency-editor`, one call per drift group. Calls are independent, so they can run in parallel or as one Message Batch.
- **Out:** `patch` proposals, one per affected batch, in the candidate format, or `no_change` with a reason.

Each patch goes through stage 4 (checks), then stage 7 (the coordinator), with the original decision as context. When no patches remain, the book is `locked`.

### 11. **Release** (code, plus human sign-off)

- **Runs when:** the release gates in `PUBLISHING.md` hold for every book in the release.
- **Out:** the release folder described in `PUBLISHING.md`.

Steps:

- Re-run the hard checks on the final text.
- Build the USFM, JSON and plain-text files, the margin and the glossary export.
- Export the full record, and snapshot this folder with a `MANIFEST.json` of content hashes.
- Write the changelog against the previous release.
- Mark the books `released`.

### 12. Feedback (agent, scheduled)

- **Agent:** `feedback-triage`.
- **In:** new `feedback` records per verse, with that verse's published text, margin, decisions and open items.
- **Out:** a triage outcome per feedback item, and a public reply.

A `reopen` outcome:

- creates a new batch for the affected verses only, with the original decision and the feedback argument attached as context
- runs stages 3 to 9 on that batch; the new decision's `supersedes` field names the old one
- sends feedback against a G1 decision, or a ratified glossary entry, to a human editor (escalation trigger `public_feedback`)

Accepted changes wait for the next release. Released text is never edited in place.

## Batch states

```
queued → pretagged → translating → checking → reviewing → debating? → coordinating
       → accepted
       → escalated → resolved → accepted
       → failed (an agent call failed 3 times; retried manually)
```

## Book states

```
open → all batches accepted → consistency pass → locked → signed_off → released
released → (feedback reopens verses) → revising → locked → signed_off → released (next version)
```

## Escalation

The coordinator escalates when:

1. No candidate is eligible after repair.
2. Reviewers still disagree on any G1 gate after debate.
3. The coordinator's `confidence` is below `config.escalation.min_confidence`.
4. A change touches an `escalate_only` term, or a translator marked a sense as `uncertain`.
5. A merged text fails checks.
6. A `glossary_conflict` is raised.
7. Public feedback argues against a G1 decision or a ratified glossary entry (`public_feedback`).

An escalation record contains:

- one specific question for the human
- the options to choose from, each tied to a candidate or a change
- the coordinator's recommendation

The human answers in a `decision` with `outcome: select | merge`. Their glossary rulings are entered as `ratified` directly.

## Waves (optional: Anthropic batch mode)

With `config.inference.anthropic.batch_api.enabled: true`, the Anthropic-hosted stages run in **waves** rather than per batch, at half price:

1. Run stages 0 to 4 for every batch in a chapter, or a whole book, as usual.
2. **Wave A:** submit every round-1 meaning-auditor call as one Message Batch. Scorer calls go to OpenRouter in parallel.
3. Compute which batches need debate, and submit their round-2 calls as **Wave B**.
4. **Wave C:** submit every coordinator call as one Message Batch.
5. Continue from stage 8 for each batch as its results arrive.

Rules for batch mode:

- **Single-turn only.** Tool calls are disabled. Agents rely on the preloaded reference in the batch input. A call that needs more evidence returns `"needs_lookup": [...]` instead; the orchestrator runs those lookups and resubmits the call in the next wave.
- **Glossary staleness.** Every batch in a wave sees the glossary version from when the wave was built. Drift is caught by the consistency pass, as with parallel batches.
- **Latency.** Message Batches finish within 24 hours, usually much sooner. Use batch mode for full-book runs, and the normal per-batch mode for the pilot, where fast iteration matters more than cost.

## Concurrency

- Batches within a chapter may run in parallel, up to `config.parallel_batches`.
- Each batch records the `glossary_version` it was given.
- Parallel batches can propose the same new entry. Identical proposals merge. Different proposals conflict.
- Decisions made under an older glossary version are listed for the consistency pass, so drift is fixed in one place at book level.

## Cost

Agent calls per batch:

| Stage | Calls |
|---|---|
| Translate | 3 |
| Repair | 0 to 3 |
| Review | 2 |
| Debate | 0 or 2 |
| Coordinate | 1 |
| **Total** | **6 to 11** |

Rough scale:

- **Philippians** (104 verses): about 25 batches, about 200 calls.
- **Full KJV** (31,102 verses): about 6,500 batches, about 50,000 to 70,000 calls.

`config.budget.max_usd` stops the run cleanly when spend crosses the limit. In-flight batches finish; new ones do not start.

**Optional saving:** with `config.skip_agents_when_mechanical_complete: true`, a batch skips straight to the coordinator when the mechanical draft has no untagged archaic tokens and no glossary misses. Keep it `false` for the pilot, so we learn how often the agents improve on the mechanical draft.

## Pilot

- **Book:** Philippians (`PHP`), 4 chapters, 104 verses.
- **Why Philippians:** it is short, and it contains the classic hard cases:
  - "careful" (4:6), which means *anxious*
  - "communicate" (4:14–15), which means *share*
  - "bowels" (1:8, 2:1), which means *affection*
  - "conversation" (1:27; 3:20), which means *conduct*, and is debated in 3:20
  - "betwixt" (1:23)

### Measure

| Metric | Why |
|---|---|
| Cost per verse | Projects the full-run cost. |
| Reviewer agreement rate, round 1 and after debate | Shows whether debate earns its cost. |
| Escalations per 100 verses, by trigger | Shows how much human time a full run needs. |
| New glossary entries per 100 verses, per chapter | It should fall. If it does not fall, a full run will drift. |
| Win share by translator, and how often `M` wins | Shows whether three translators are worth it. |
| Consistency-pass patches per book | Shows how much drift survives the glossary. |

### Scale only when

- escalations are under 10 per 100 verses, and
- new glossary entries per 100 verses are falling chapter over chapter, and
- the consistency pass leaves no G1 failures.
