# Auditor check: haiku-5-5 vs the reference auditor

Same passages, same candidates, same labels as the reference review. Verdicts compared on G1 (meaning).

| | |
|---|---|
| Candidates compared | 59 (of 60) |
| Agreement on meaning | 63% (37/59) |
| Meaning failures the reference caught | 40 |
| ...of those, the challenger **missed** | **12** |
| Failures only the challenger flagged | 10 |
| Failed calls | 0 |
| Notional cost at list price | $0.107 |
| Time | 581s total |

## Missed meaning failures (the dangerous direction)

- **PHP.2.b01 · 3**: reference said: "PHP.2.8: 'obedient unto death' was changed to 'obedient to death'. In the KJV, 'unto' here marks degree, meaning 'as far as death' (lexicon G3360 lists Php.2:8 under 'measure or degree'). The update reads naturally as an indirect object, 'obedient to death', meaning he obeyed dea"
- **PHP.2.b01 · 0-flash**: reference said: "PHP.2.8: 'obedient to death' fails G1. The extent sense of 'unto' (as far as death) becomes a likely indirect-object reading (he obeyed death). Lexicon G3360 puts Php.2:8 under measure or degree."
- **PHP.2.b01 · 5-super-vl**: reference said: "PHP.2.8: 'obedient to death' fails G1 because the extent sense of 'unto' becomes an indirect-object reading (lexicon G3360, Php.2:8 is measure or degree)."
- **PHP.2.b01 · 3**: reference said: "PHP.2.8: 'obedient to death' fails G1, for the same reason as A to C."
- **PHP.2.b01 · 1-flash**: reference said: "PHP.2.8: 'obedient to death' fails G1 because the extent sense of 'unto' (lexicon G3360) becomes an indirect-object reading. Everything else in the batch is faithful."
- **PHP.2.b01 · 1-flash**: reference said: "PHP.2.8, c9: the reason itself treats 'death' as 'the dative object after obedient'. That is exactly the misreading: in the KJV, 'unto death' means 'as far as death' (lexicon G3360). G1 fails."
- **PHP.2.b06 · 3**: reference said: (no note)
- **PHP.2.b06 · 5-super-vl**: reference said: "PHP.2.30: 'not caring for his life' can be read as 'not tending or nursing his life'. This is a minor ambiguity, not a G1 failure. See the alternative on c8."
- **PHP.2.b06 · 1-flash**: reference said: (no note)
- **PHP.2.b06 · 3**: reference said: (no note)
- **PHP.3.b04 · 3**: reference said: (no note)
- **PHP.4.b03 · 1-flash**: reference said: "PHP.4.12: 'abased' → 'humbled': G1 fail (P1, P5). Here the KJV's 'abased' means being brought low in circumstances, set against 'abound'. Modern 'humbled' points to humility of spirit or to embarrassment, so the connotation changes. The new word is the same as the dataset gloss f"

## Extra failures only the challenger raised

- **PHP.3.b03 · 1-flash**: "PHP.3.12: perfect: R4 and P1. Same glossary-driven failure as A. The KEEP entry conflicts with P1 and should be escalated for amendment." "PHP.3.15: perfect: same failure as PHP.3.12."
- **PHP.3.b03 · 0-flash**: "PHP.3.12: perfect: R4 and P1. Same glossary-driven failure as A." "PHP.3.15: perfect: same failure as PHP.3.12."
- **PHP.3.b03 · 3**: "PHP.3.12: perfect: same glossary-driven failure as A." "PHP.3.15: perfect: same failure as PHP.3.12."
- **PHP.3.b03 · 1-flash**: "PHP.3.12: perfect: same glossary-driven failure as A." "PHP.3.15: perfect: same failure as PHP.3.12."
- **PHP.3.b03 · 0-flash**: "PHP.3.12: perfect: same glossary-driven failure as A." "PHP.3.15: perfect: same failure as PHP.3.12."
- **PHP.4.b03 · 1-flash**: "PHP.4.11: 'want' kept: fails G1 under R4 and rubric G1. Modern 'want' means desire, so 'in respect of want' changes meaning for a modern reader. A and B changed it to 'need'. No change_id exists for this word, so this is a missed change, not a disagreed change."
- **PHP.4.b03 · 0-flash**: "PHP.4.11: 'want' kept: fails G1 under R4. Modern 'want' means desire. No change_id exists for this word."
- **PHP.4.b03 · 3**: "PHP.4.11: 'want' kept: fails G1 under R4. No change_id exists for this word."
- **PHP.4.b03 · 5-super-vl**: "PHP.4.11: 'want' kept: fails G1 under R4. No change_id exists for this word."
- **PHP.4.b03 · 0-flash**: "PHP.4.11: 'want' kept: fails G1 under R4. No change_id exists for this word."
