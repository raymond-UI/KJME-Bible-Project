# Update Rules

These rules apply to every agent that writes or judges text. Principle numbers (P1 to P8) refer to `SYSTEM.md`.

## Change categories

Every change carries exactly one category.

| Category | Use for | Example |
|---|---|---|
| `pronoun_sg` | thou, thee, thy, thine, thyself | thee → you (sg) |
| `pronoun_pl` | ye, you, your, yours, yourselves (plural in the KJV) | ye → you (pl) |
| `verb_form` | archaic verb endings and forms | hath → has, knowest → know |
| `archaic_word` | a word no longer in common use | thrice → three times |
| `shifted_meaning` | a word still in use whose meaning has changed | converted (turned around) → turned back |
| `syntax` | archaic word order or negation that blocks understanding | fail not → may not fail |
| `spelling` | an old spelling of the same word | shew → show |
| `punctuation` | only when another change forces it | |

## R1. Pronouns (P4)

The KJV marks number. Code tags every pronoun's number. Agents never re-judge it.

| KJV | Number | Update text | Mark |
|---|---|---|---|
| thou, thee | sg | you | sg |
| thy, thine (before a noun) | sg | your | sg |
| thine (standalone) | sg | yours | sg |
| thyself | sg | yourself | none needed |
| ye, you | pl | you | pl |
| your | pl | your | pl |
| yours | pl | yours | pl |
| yourselves | pl | yourselves | none needed |

### How number is shown

Number is stored as **data**, not baked into the text. Each candidate carries `pronoun_marks`: character spans with `sg` or `pl`.

How marks are displayed is a rendering choice, set by `config.plural_you_style`:

- **`marker`** (default): the text says "you". The renderer adds a plural marker, for example a superscript "pl". The text stays clean, and number is never lost.
- **`you_all`**: the text itself says "you all" for plural forms. Use this only when the output must be plain text. It is a visible edit, so log it as a `pronoun_pl` change.
- **`none`**: not allowed. It violates P4. Use it only to generate comparison views.

## R2. Verb forms

Archaic person endings go to modern forms. Code applies table entries from `data/archaic-forms.json`. Agents handle forms the table does not cover.

- **Second person singular** (with thou): knowest → know, art → are, hast → have, wast → were, dost → do, didst → did, wilt → will, canst → can.
- **Third person singular:** hath → has, doth/doeth → does, saith → says, loveth → loves, cometh → comes.
- **`shall` stays `shall`.** It is still understood, and changing it alters register (P3).
- **Not verbs:** words ending in -est or -eth that are not verbs (greatest, beneath, Nazareth, Elizabeth). Code uses a stoplist. Agents double-check.

## R3. Archaic words

Replace a word only if a typical adult reader would not understand it correctly without a footnote.

- Use the closest modern equivalent with the same meaning.
- Prefer one word for one word.
- Keep the part of speech.
- Check the glossary first. If an entry exists for this sense, use it.
- A `KEEP` entry means keep the word.

## R4. Shifted meaning (P1)

A word whose modern meaning differs from its KJV meaning **must** change. Keeping it would change the meaning for a modern reader, which breaks P1 as surely as a wrong replacement.

- Entries are sense-conditioned. "Suffer" meaning *allow* changes. "Suffer" meaning *endure pain* stays.
- Decide the sense from the KJV context.
- If the sense cannot be settled from the English, mark the change `uncertain` in the reason. The coordinator escalates it.

## R5. Syntax

Change archaic word order or negation only where it blocks understanding.

- **Default:** verb-plus-not becomes do-support when the meaning is otherwise unclear or awkward. "I know not" → "I do not know".
- **Mood must survive.** "That thy faith fail not" is a subjunctive purpose clause. "May not fail" keeps it. "Will not fail" does not.
- **Fixed phrases** recorded in the glossary as `KEEP` stay. "Fear not" is the obvious one.
- Never restructure a sentence to make it read more smoothly.

## R6. Supplied words (italics)

- Keep italic spans on words that remain.
- A replacement for an italic word inherits the italics.
- Remove a supplied word only when another change makes it redundant, and log the removal as a change.

## R7. Locked and escalate-only terms

See `data/locked-terms.json`.

- **`locked`:** never changed by an agent, in any category.
- **`escalate_only`:** an agent may propose a change, but it is always escalated. Examples: charity, Holy Ghost.
- Small-caps LORD and GOD keep their small-caps flag.

## R8. Punctuation and capitalization

- Keep KJV punctuation, including colon-heavy sentences.
- Keep KJV capitalization conventions. Do not capitalize pronouns referring to God; the KJV does not.

## R9. No additions

- No explanatory words.
- No footnotes in the text.
- No section headings.
- No harmonizing between parallel passages.

If a word count grows by more than 2 words at one change site, the change needs a reason that explains why fewer words could not carry the meaning.

## R10. Spelling

Modernize old spellings of the same word (shew → show, stablish → establish) through glossary entries. Proper names keep KJV spelling.

## R12. Reference lookups

Agents have no network access. The only outside source is the offline `lookup` tool (`reference/REFERENCE.md`).

- Use it to settle what a KJV English word meant in 1611, for example whether "converted" means *turned around* or religious conversion.
- A lookup can support keeping or restoring the KJV sense. It never justifies moving away from it.
- Dataset glosses are evidence of sense, never wording to copy.
- Cite every lookup a change relied on in its `evidence`.

## R11. When in doubt

Keep the KJV wording, and say why in the candidate's `notes`.

The reviewers and coordinator decide whether the doubt was justified.
