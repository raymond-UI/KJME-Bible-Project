# Pilot: Philippians (run pilot-php-001)

The first full KJME run. All four chapters of Philippians, 104 verses, through the whole pipeline: translators, code checks, anonymized review, debate, coordinator, escalation and the consistency pass.

This is a working record, not a release. The text has not been through public review, The text, glossary and record are CC BY 4.0 (see [`LICENSE.md`](../../LICENSE.md)).

## Numbers

| | |
|---|---|
| Verses | 104, all accepted |
| Batches | 21, of which 15 went to debate |
| Escalations | 12, all resolved by a human |
| Cost | $11.06 ($0.11 per verse) |

Full breakdown in [report.md](report.md).

## Files

| File | What it is |
|---|---|
| `accepted.json` | The accepted KJME text per verse, with its changes, italics and pronoun marks |
| `viewer.html` | The Margin Viewer for this run, built as one file with the data inside. Open it in a browser, no server needed |
| `viewer-data.json` | The data the viewer shows, as JSON |
| `viewer-verification.json` | Proof the viewer data was checked against both texts before it was written |
| `report.md` | Cost, agreement, winners, escalations |
| `glossary.json` | Glossary state at the end of the run |
| `escalation-notes.json` | The human rulings on each escalation |
| `state.json` | Run state |
| `record/*.jsonl` | Every batch, candidate, check report, review, decision, escalation, lookup and agent call |
| `model-tests/` | The translator bake-off and the Haiku auditor check run after the pilot |

## What is left out

- **Lexicon and original-text lookup results.** They are STEPBible data, and its license asks that copies are not reposted. The lookup queries stay in `record/lookups.jsonl`. Run `bun src/cli.ts setup` in `harness/` and repeat a lookup to see its result.
- **Prompts and raw model responses.** Each agent call is recorded by hash (`prompt_hash`, `input_hash`), along with its parsed output, so a run can be checked against a replay.

## Open items from this run

- Split the "careful" glossary entry into two (4:6 and 4:10).
- A ruling on "perfect" (3:12, 3:15).
