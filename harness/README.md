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
- **Usage limits stop the run cleanly too.** A run stops, keeping every finished batch, when:
  - the provider is out of credit;
  - rate limits outlast six retries (each retry waits as long as `retry-after` asks, up to two minutes);
  - `claude -p` reports a subscription usage limit;
  - `max_consecutive_failures` batches (default 3) fail one after another, which usually means the provider is down.

  Re-run the same command once the provider serves calls again.

## Glossary pre-pass, then the main work

Before the main work, settle the senses of the words that need care. No model calls are made (PIPELINE.md, stage 0):

```bash
bun src/cli.ts glossary-survey --config main.config.json --top 50       # or --words let,prevent,conversation
# read runs/glossary-survey/<word>.md, fill in senses/<word>.json, set "reviewed": true
bun src/cli.ts glossary-import --config main.config.json --by <your name>
```

Rulings go into the shared glossary, `runs/main-glossary.json`, which every main run reads and adds to. Take a few words at a time; unreviewed files are skipped and existing templates are never overwritten.

The main work runs in small pieces, each checked before the next:

```bash
bun src/cli.ts run --config main.config.json --book JUD --run main-jud
bun src/cli.ts run --config main.config.json --book ROM --chapters 1 --run main-rom-1
```

`main.config.json` uses the Anthropic API (key in `.env`): Haiku 5.5 for the translators, scorer, coordinator and consistency editor, Opus 5.5 for the auditor, a $25 budget per run. When the auditor finds every candidate clear and agrees with the scorer, its second debate round is skipped (`debate_skip_clear_auditor`).

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

Escalated batches keep provisional text as `pending_human`, so the rest of the chapter has context. The provisional text keeps every agreed change and holds only the disputed words at the mechanical draft (`PIPELINE.md`, Escalation). Resolve each one yourself:

```bash
bun src/cli.ts resolve --batch PHP.2.b03 --select PHP.2.b03.cadence --note "Keeps the 1611 sense."
bun src/cli.ts resolve --batch PHP.2.b03 --select recommended
bun src/cli.ts resolve --batch PHP.2.b03 --select provisional
```

`bun src/cli.ts hold` rebuilds the provisional text of a run's open escalations from the record, for runs made before it existed.

The resolution is recorded as a human decision that supersedes the coordinator's.

## Review a run in the viewer

The Margin Viewer is a separate web app in [`../viewer`](../viewer). Export a run into it, one file per book:

```bash
bun src/cli.ts export-viewer --run pilot-php-001          # a run under runs/
bun src/cli.ts export-viewer --dir ../pilot/philippians-001  # or any run folder
```

This writes `../viewer/public/data/<BOOK>.json` and adds the book to `index.json`. Exporting the same book again replaces it. Use `--out <dir>` to write somewhere else.

## Outputs (`runs/<run id>/`)

| File | What |
|---|---|
| `report.md` | Pilot metrics: cost per verse and per agent, reviewer agreement before and after debate, escalations by trigger, win share, glossary growth per chapter. |
| `viewer-data.json` | What the Margin Viewer shows: every verse in three forms (KJV, accepted, tracked), its changes with reasons, candidates, reviews, decisions and the glossary. Read by [`../viewer`](../viewer). |
| `viewer-verification.json` | Proof every verse in the viewer data was rebuilt and matched against the KJV and the accepted text. |
| `accepted.json` | Accepted text per verse, with offsets, pronoun marks, italics and changes. |
| `glossary.json` | The glossary as it evolved during the run. |
| `record/*.jsonl` | Batches, candidates, check reports, reviews, decisions, escalations, lookups, consistency results, and every agent call (model served, provider, prompt hash, tokens, cost). |
| `state.json` | Batch states and spend, for resume. |

## How agent output becomes a candidate

- Agents return text and word-pair changes, never character offsets.
- `src/checks.ts` aligns each verse against the mechanical draft. From the alignment it locates every change, carries pronoun number and italics through, and logs the mechanical changes.
- It then runs checks C1 to C10. C11 runs at pretag time.

## Not in the pilot harness yet

- Psalm titles (superscriptions). The source reader skips OSIS `<title>` elements, so they are not yet translated or looked up.
- Anthropic batch-mode waves. The pilot uses standard calls.
- Consistency patches are found, judged and checked, but **not applied**. They are listed for you to review in `record/consistency.jsonl`. The `stale_glossary` and `boundary_seam` drift groups are not built yet.
- Release packaging and public feedback triage.
