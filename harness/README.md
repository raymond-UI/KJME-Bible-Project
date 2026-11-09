# KJME pilot harness

A runnable implementation of the KJME system for the pilot (Philippians). It is the "plain script" runtime from the main README:

- **Agents:** read straight from `../agents/*.md` and `../rules/*.md`. Edit the documents, and the next run uses them.
- **Store:** JSON and JSONL files in `runs/<run id>/`.
- **Orchestrator:** `src/pipeline.ts`.

The modules (pretag, checks, gateways, pipeline) are plain TypeScript with no framework, so they can move into Convex actions or Workers later.

## Requirements

- [Bun](https://bun.sh) 1.2 or newer, `git`, `bash`, and `python3` (for the preflight script)
- Network access to openrouter.ai, api.anthropic.com and github.com

## Setup

```bash
cd harness
bun install
cp .env.example .env              # add OPENROUTER_API_KEY and ANTHROPIC_API_KEY
bun src/cli.ts setup              # fetches the KJV source (~10 MB) and the reference library (~115 MB)
bun src/cli.ts preflight --credit 200
```

Before committing, run `bun run check` (TypeScript typecheck plus [oxlint](https://oxc.rs)).

`preflight` checks every model against OpenRouter's live catalog, the diversity rules, and the estimated cost.

## Try it without keys

```bash
bun src/cli.ts run --mock --run mock1
```

The mock model is scripted, not smart. It exercises every path end to end in about two seconds:

- three translators, the checks and repairs
- anonymized reviews, with a planted meaning failure ("let" misread as "hinder" in 4:6)
- debate, selection and glossary updates
- the consistency pass, which finds the "conversation" divergence between 1:27 and 3:20

## Run the pilot

```bash
bun src/cli.ts run                        # all of Philippians, per pilot.config.json
bun src/cli.ts run --chapters 1           # one chapter first is a good idea
bun src/cli.ts status                     # batch states, spend, open escalations
```

- **Runs resume.** Re-run the same command and it skips accepted and escalated batches, and retries failed ones.
- **The budget is a hard stop.** `budget.max_usd` in the config ends the run cleanly when spend reaches it.

## Model tests

Two commands compare models without touching a run's accepted text:

```bash
# Translator bake-off: every variant in bakeoff.config.json on the same passages, judged in one anonymized review
bun src/cli.ts bakeoff

# Auditor check: replay the reference auditor's reviews through another model and count missed meaning failures
bun src/cli.ts auditcheck --model claude-haiku-5-5 --gateway opencode-anthropic --label haiku-5-5
```

Results go to `runs/<run id>/bakeoff.md` and `runs/auditcheck-001/auditcheck-<label>.md`.

### Gateways

| Gateway | Format | Key |
|---|---|---|
| `openrouter` | OpenAI-compatible, with OpenRouter routing | `OPENROUTER_API_KEY` |
| `anthropic` | Anthropic Messages | `ANTHROPIC_API_KEY` |
| `opencode-anthropic` | OpenCode Go, Anthropic format (Claude, Qwen, MiniMax M3) | `OPENCODE_GO_API_KEY` |
| `opencode-openai` | OpenCode Go, OpenAI-compatible format (DeepSeek, GLM, Kimi, MiniMax M3.1 Flash) | `OPENCODE_GO_API_KEY` |

Choose per agent with `"gateway"` in the config. OpenCode Go is designed for coding-agent traffic; check its terms before running large batches through it.

## Escalations

Escalated batches keep the coordinator's recommendation as `pending_human` text, so the rest of the chapter has context. Resolve each one yourself:

```bash
bun src/cli.ts resolve --batch PHP.2.b03 --select PHP.2.b03.cadence --note "Keeps the 1611 sense."
bun src/cli.ts resolve --batch PHP.2.b03 --select recommended
```

The resolution is recorded as a human decision that supersedes the coordinator's.

## Outputs (`runs/<run id>/`)

| File | What |
|---|---|
| `report.md` | Pilot metrics: cost per verse and per agent, reviewer agreement before and after debate, escalations by trigger, win share, glossary growth per chapter. |
| `viewer.html` | Every verse: the KJV, the accepted text with changes highlighted and plural "you" marked, and the margin of changes with reasons. |
| `accepted.json` | Accepted text per verse, with offsets, pronoun marks, italics and changes. |
| `glossary.json` | The glossary as it evolved during the run. |
| `record/*.jsonl` | Batches, candidates, check reports, reviews, decisions, escalations, lookups, consistency results, and every agent call (model served, provider, prompt hash, tokens, cost). |
| `state.json` | Batch states and spend, for resume. |

## How agent output becomes a candidate

- Agents return text and word-pair changes, never character offsets.
- `src/checks.ts` aligns each verse against the mechanical draft. From the alignment it locates every change, carries pronoun number and italics through, and logs the mechanical changes.
- It then runs checks C1 to C10. C11 runs at pretag time.

## Not in the pilot harness yet

- OT (Hebrew) lookups. NT Greek is wired; Philippians needs nothing else.
- English 1611 dictionaries, until they are added by hand (`../reference/REFERENCE.md`).
- Anthropic batch-mode waves. The pilot uses standard calls.
- Consistency patches are found, judged and checked, but **not applied**. They are listed for you to review in `record/consistency.jsonl`. The `stale_glossary` and `boundary_seam` drift groups are not built yet.
- Release packaging and public feedback triage.
