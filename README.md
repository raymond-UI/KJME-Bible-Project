# King James Margin Edition: the system

The **King James Margin Edition (KJME)** is an edition of the 1769 King James Version with its English updated for modern readers, meaning unchanged. Every change is shown in the margin, with its reason.

This folder is the system that produces it: a committee of AI agents, deterministic checks and human review, run through a granular pipeline. The system is defined in documents, not code, and it is published alongside the text. Anyone can see exactly how every word was decided.

The principles are adapted from the published goals of the KJV Update Project ("Imagine the KJV 2026", The Holy Scriptures Bible Society). KJME is an independent project by Raymond Asogwa. It is not affiliated with or endorsed by that project or society.

Every role, rule, schema, check and stage lives in this folder. Any runtime that can call a model, store records and run steps in order can run it.

> **Status:** pre-release. Pilot book: Philippians. The full record of the first run is in [`pilot/philippians-001`](pilot/philippians-001).

---

## Map

| Path | What it is |
|---|---|
| `SYSTEM.md` | Purpose, principles, scope, definitions. Read first. |
| `PIPELINE.md` | The stages, the batch state machine, escalation, concurrency, cost, pilot plan. |
| `PUBLISHING.md` | What a release contains, how it is versioned, cited and licensed, and how public feedback re-enters the pipeline. |
| `rules/update-rules.md` | The canonical rules every agent follows when changing text. |
| `rules/rubric.md` | Gates and scores used by reviewers and the coordinator. |
| `agents/` | One file per role. Frontmatter says what it reads, takes and returns. |
| `schemas/` | JSON Schemas for every record that moves through the pipeline, including published verses and public feedback. |
| `checks/CHECKS.md` | Deterministic checks. Implemented in code, never by a model. |
| `data/archaic-forms.json` | Lookup tables for pronouns and verb forms (the mechanical layer). |
| `data/glossary.seed.json` | Starting glossary. Every entry starts as `proposed`. |
| `data/locked-terms.json` | Terms agents may not change, and terms only a human may change. |
| `reference/` | The offline reference library agents may consult (KJV's Greek, Hebrew, lexicons, 1611 English), its fetch script and the `lookup` tool spec. |
| `config.example.json` | Run configuration: scope, batching, OpenRouter models per role, thresholds, budget, release metadata. |
| `tools/preflight.py` | Checks the configured models against OpenRouter's live catalog and estimates run cost. |
| `examples/luke-22-31-34.md` | One batch walked through every stage. |

## Reading order

For a developer wiring a runtime, or an agent orienting itself:

1. `SYSTEM.md`
2. `rules/update-rules.md`
3. `PIPELINE.md`
4. `PUBLISHING.md`
5. `agents/*`
6. `schemas/*`, `checks/CHECKS.md`

---

## Runtime contract

A runtime is anything that provides these four things. Nothing else in this folder assumes a specific platform.

### Inference: OpenRouter, plus Anthropic for judgment

Two gateways, chosen per agent by `config.agents.<name>.gateway`:

- **OpenRouter** (OpenAI-compatible API) runs the translators, the scorer and feedback triage. One key gives every model family, so the translators can run on different families without a separate integration per provider.
- **Anthropic** (the Messages API, called directly) runs the roles where judgment matters most:
  - the meaning auditor and the coordinator, on Opus 5.5
  - the consistency editor, on Haiku 5.5. It judges small drift groups that code has already found, so each prompt stays under Haiku's 100k-token surcharge threshold.
  - Uses native structured outputs and tool use.
  - Uses prompt caching on the system prompt (the rules and agent file), which is identical on every call for a role.
  - Optionally uses the Message Batches API at half price (see `PIPELINE.md`, Waves).
  - Its family (`anthropic`) is never used by a translator, so the auditor never reviews its own family's work.

OpenRouter specifics:

- **Routing is pinned:** `allow_fallbacks: false` and `require_parameters: true`. A call fails instead of silently moving to a different provider or a model without tool support.
- **The served model and provider** are read from each response and logged, since the same model can be served by several upstream providers.
- **Free and cheap models mix freely.** Free (`:free`) models share one per-account daily limit.
- **Run `python3 tools/preflight.py config.json` before every run.** It checks each OpenRouter model against the live catalog (exists, tool support, structured outputs), checks Anthropic model ids against a known list, enforces the family-diversity rules, and estimates cost with caching.

### 1. `run_agent(agent_file, input) -> output`

- Build the system prompt by concatenating, in order:
  1. every file listed in the agent's `context` frontmatter
  2. the `extends` file, if any
  3. the agent file body
- Send `input` as JSON in the user turn.
- Parse the model's reply as JSON and validate it against the agent's `output_schema`.
- On a parse or validation failure, retry up to 2 times, appending the validation errors to the input.
- After 3 failures, mark the step `failed` and escalate.

### 2. A store

Holds one collection per schema:

- `verse`, `batch`, `candidate`, `check_report`, `review`, `decision`, `glossary_entry`, `feedback`, `published_verse`
- an append-only `event` log

Every record keeps its `id` and the `id`s it references.

### 3. An orchestrator

Executes the state machine in `PIPELINE.md`.

- Steps must be idempotent: re-running a step with the same inputs replaces its output and does not duplicate it.

### 4. A checks module

Implements `checks/CHECKS.md` in any language.

- Pure functions: candidate + batch in, `check_report` out.

### 5. An offline reference library, and no network for agents

- Run `reference/fetch.sh` once at setup (see `reference/REFERENCE.md`).
- Agents get no internet access. Their only outside source is the `lookup` tool over that library.
- Every lookup is logged as an `event`.

### Mapping to common runtimes (non-binding)

Inference is the same two gateways in every case. Only the store and orchestrator vary.

| Runtime | Agents | Store | Orchestrator |
|---|---|---|---|
| Convex | actions calling the gateways | one table per schema | Workflow component, one workflow per batch |
| Cloudflare | Workers calling the gateways | D1, or one Durable Object per book | Workflows, one instance per batch |
| Plain script | HTTP calls to the gateways | SQLite | a loop over batches |

---

## Provenance

Every agent call logs an `event` with:

- agent file path and content hash
- model id and parameters
- input hash, output, token counts, cost, timestamps

A decision is reproducible if its inputs and agent hashes are known.

## Source text

- Use the 1769 Oxford standard (Blayney) text of the KJV, with translator-supplied words (italics) marked.
- Any public-domain USFM edition works, as long as `\add` marks italics and `\p` marks paragraphs. A JSON verse dump also works if italics are kept as spans.
- Verse ids use USFM book codes: `LUK.22.31`, `PHP.4.6`.

## Copyright note

The KJV is public domain in most countries. In the United Kingdom it is under Crown copyright, administered by Cambridge University Press. Resolve this before the first public release from a UK entity (see `PUBLISHING.md`, Licensing). This note is not legal advice.

## License

The system (this folder's rules, agents, schemas, checks, tools and harness) is [MIT](LICENSE). KJME text, margin, glossary and the run record are [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The base KJV wording is not covered by either. See [`LICENSE.md`](LICENSE.md).
