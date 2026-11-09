# Licensing

This repository holds two kinds of work under two licenses.

| Part | License | Where |
|---|---|---|
| The system: rules, agent files, schemas, checks, tools, harness code and docs | [MIT](LICENSE) | everything not listed below |
| KJME text, margin notes and glossary | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | `pilot/**/accepted.json`, `pilot/**/glossary.json`, `pilot/**/viewer.html`, and the `text/`, `margin/` and `glossary.json` of any release |
| The record: candidates, reviews, decisions, escalations, events, reports | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | `pilot/**/record/`, `pilot/**/report.md`, `pilot/**/escalation-notes.json`, `pilot/**/model-tests/`, and the `record/` of any release |

Attribution for CC BY 4.0 material: "King James Margin Edition (KJME), Raymond Asogwa", with the release or run id (for example `KJME pilot-php-001`) and a link to this repository.

## What these licenses do not cover

- **The base KJV text.** The 1769 King James Version is public domain in most countries. In the United Kingdom it is under Crown copyright, administered by Cambridge University Press. The CC BY 4.0 license covers only Raymond Asogwa's changes, margin notes, glossary and record, not the underlying KJV wording. Anyone reusing KJME text in the UK should check that position for themselves. This is not legal advice.
- **STEPBible data.** Greek and Hebrew data from STEPBible Data, Tyndale House (STEPBible.github.io/STEPBible-Data), is CC BY 4.0 under its own terms. It is not redistributed here. `harness` fetches it at setup.
- **Model output terms.** Text produced by third-party models is published under the licenses above to the extent Raymond Asogwa holds rights in it.
