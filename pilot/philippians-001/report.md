# KJME pilot report: pilot-php-001

Generated 2026-11-08T16:26:12.489Z.

## Summary

| | |
|---|---|
| Verses with text | 104 (104 accepted, 0 pending human) |
| Batches decided | 21 |
| Total cost | $11.062 |
| Cost per verse | $0.1064 |
| Reviewer top-pick agreement, round 1 | 29% |
| Reviewer top-pick agreement, final | 33% |
| Batches that went to debate | 15 of 21 |
| Escalations per 100 verses | 11.5 |
| Reference lookups (tool calls) | 283 |
| Consistency groups judged | 1 (0 with patches to review) |

## Cost by agent

| Agent | Calls | Failed | Input tok | Cached tok | Output tok | Cost |
|---|---|---|---|---|---|---|
| translator-cadence | 30 | 4 | 350153 | 223744 | 369240 | $0.208 |
| translator-minimalist | 23 | 0 | 377771 | 234496 | 83939 | $0.044 |
| translator-clarity | 30 | 3 | 588884 | 467725 | 135732 | $0.107 |
| reviewer-meaning-auditor | 42 | 0 | 1047750 | 584824 | 165715 | $7.727 |
| reviewer-scorer | 45 | 4 | 418505 | 237056 | 104587 | $0.070 |
| coordinator | 22 | 1 | 476679 | 202333 | 44259 | $2.902 |
| consistency-editor | 2 | 0 | 4797 | 0 | 3966 | $0.004 |

## Who won

| Winner | Batches |
|---|---|
| translator-minimalist | 7 |
| translator-cadence | 6 |
| merge | 4 |
| translator-clarity | 2 |
| mechanical | 2 |

## Translator check failures (first attempt)

| Translator | Failed / total |
|---|---|
| translator-cadence | 1 / 21 |
| translator-minimalist | 0 / 21 |
| translator-clarity | 0 / 21 |

## Escalations by trigger

| Trigger | Count |
|---|---|
| no_eligible_candidate; escalate_only term 'robbery'; glossary sense conflict for 'unto' (degree) | 2 |
| uncertain_sense_R4 (auditor rev-2-mw7ujm0s-41 recommends escalation; 1611 sources unavailable; no eligible wording offers a replacement) | 2 |
| uncertain_sense | 2 |
| merge_new_wording | 2 |
| escalate_only term (PHP.3.20 'conversation') with G1 split between reviewers | 2 |
| no_eligible_candidate; glossary_conflict (g-careful-anxious sense split) | 2 |

- **PHP.2.b01** (no_eligible_candidate; escalate_only term 'robbery'; glossary sense conflict for 'unto' (degree)): Should PHP.2.8 keep 'obedient unto death' (unto = degree, μέχρι, outside g-unto-to), and should PHP.2.6 keep 'robbery' in its active AV sense, or change it to 'something to grasp' (the RV passive sense)? Recommended: `PHP.2.b01.mechanical`
- **PHP.2.b03** (uncertain_sense_R4 (auditor rev-2-mw7ujm0s-41 recommends escalation; 1611 sources unavailable; no eligible wording offers a replacement)): In PHP.2.15 'harmless' (KJV sense: guileless, innocent) and in PHP.2.16 'Holding forth' (KJV sense: holding out, offering), would a typical modern reader take the wrong meaning (modern 'not harmful' and 'speaking at length'), so that R4 requires a change? Or can both be kept as KEEP entries? Recommended: `PHP.2.b03.cadence`
- **PHP.2.b05** (uncertain_sense): In PHP.2.20, does the KJV word 'naturally' ('who will naturally care for your state') mean 'sincerely/genuinely', which a modern reader would misread and so must change under R4? Or does it carry a sense still current today, so that it should be kept under P2 and R11? Recommended: `PHP.2.b05.clarity`
- **PHP.2.b06** (merge_new_wording): Merge introduced wording not in any eligible candidate or reviewer alternative: "not regarding his life" -> "not heeding his life" Recommended: `PHP.2.b06.minimalist`
- **PHP.3.b04** (escalate_only term (PHP.3.20 'conversation') with G1 split between reviewers): PHP.3.20: 'conversation' is an escalate_only term and is listed as an exception to g-conversation-conduct. Should it stay as 'conversation', become 'citizenship', or follow the provisional entry and become 'conduct' (manner of life)? Recommended: `PHP.3.b04.cadence`
- **PHP.4.b03** (no_eligible_candidate; glossary_conflict (g-careful-anxious sense split)): In PHP.4.10, 'wherein ye were also careful' echoes 'your care of me'. Should 'careful' follow the provisional entry g-careful-anxious ('anxious'), or is it a separate sense (concerned for someone, as in 2KI.4.13) that should be rendered 'concerned' under a new glossary entry? Recommended: `PHP.4.b03.mechanical`

## New glossary entries per 100 verses, by chapter

| Chapter | Verses | New entries | Per 100 verses |
|---|---|---|---|
| 1 | 30 | 30 | 100.0 |
| 2 | 30 | 3 | 10.0 |
| 3 | 21 | 13 | 61.9 |
| 4 | 23 | 19 | 82.6 |

This should fall chapter over chapter. If it does not, a full run will drift.
