# Rubric

Used by reviewers to judge candidates and by the coordinator to decide between them.

## Gates

A candidate that fails any gate is **ineligible**. It cannot win, and none of its changes can be merged.

| Gate | Passes when | Principle |
|---|---|---|
| **G1** Meaning | Every verse means what the KJV verse means. This includes tense, mood, number, aspect, agency and connotation. Ambiguity in the KJV is preserved, not resolved. | P1, P5 |
| **G2** Pronoun number | Every pretagged pronoun keeps its number in `pronoun_marks`, or in text under the `you_all` style. | P4 |
| **G3** Locked terms | No `locked` term is changed. Any `escalate_only` change is flagged in the reason. | R7 |
| **G4** Change log | The diff between the KJV text and the update is fully covered by logged changes, and nothing is added beyond them. | P8, R9 |
| **G5** Glossary | Every token that matches a `ratified` or `provisional` entry in the same sense follows it, or the candidate proposes an amendment with a reason. | P7 |

Code checks G2, G3 and G4 (`checks/CHECKS.md`). It checks G5 only partly, because sense needs judgment.

G1 is judged only by agents, and by humans on escalation.

## Scores

Each score is an integer from 1 to 5. Scores are given only to candidates that pass every gate.

| Score | Weight | 5 means | 1 means |
|---|---|---|---|
| **S1** Minimality | 0.4 | Only the changes the rules require. Nothing optional. | Many optional changes. Rewording where keeping was possible. |
| **S2** Clarity | 0.3 | A typical adult reader understands every verse on first reading. | Archaic barriers remain that the rules said to remove. |
| **S3** Cadence | 0.2 | Reads aloud like the KJV: rhythm, parallelism and stress kept. | Reads like modern prose. Rhythm broken. |
| **S4** Consistency | 0.1 | Matches the glossary and the accepted neighboring batches. | Renders the same sense differently from neighbors. |

**Weighted total** = 0.4·S1 + 0.3·S2 + 0.2·S3 + 0.1·S4, divided by 5. The result is between 0.2 and 1.0.

S1 sits in tension with S2 on purpose. P2 outranks clarity, which is why S1 carries the most weight.

## Change-level verdicts

For each change a reviewer has an opinion on, it records one of:

| Verdict | Meaning |
|---|---|
| `agree` | The change is right. |
| `disagree` | The change should not happen. Give the reason. |
| `alternative` | The change is needed, but with different wording. Give the alternative text and the reason. |

Change-level verdicts are what make change-level merges possible.

## Reporting rules for reviewers

- Judge each candidate on its own before comparing.
- Cite the rule (R1 to R11) or principle (P1 to P8) behind every gate failure and every `disagree`.
- Do not reward length, explanation or eloquence in `notes`. Only the text and the change log count.
