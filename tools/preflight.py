#!/usr/bin/env python3
"""Preflight for a KJME run: check every configured model and estimate cost.

Per agent:
  - OpenRouter models: the slug exists in the live catalog, supports tools if the
    agent needs them, and (warning) supports structured outputs.
  - Anthropic models: the id is in the known price table below.
Across agents:
  - translators use distinct model families (OpenRouter: the part of the slug before '/';
    Anthropic: 'anthropic')
  - the meaning auditor's family differs from every translator's
Cost:
  - OpenRouter at catalog prices.
  - Anthropic with prompt caching on the system prompt, and the Batch API discount
    if enabled in config (or forced with --batch).
  - Anthropic subtotal shown against --credit if given.

Usage:  python3 tools/preflight.py config.json [--verses 104] [--batch] [--credit 200]
Exit code 1 on any hard failure. No API key needed.
"""
import json
import sys
import urllib.request

MODELS_URL = "https://openrouter.ai/api/v1/models"

# USD per million tokens, from Anthropic's pricing page (checked 2026-11-08). Update when prices change.
# Haiku 5.5 is priced at its <=100k-prompt rate; our prompts stay well under that.
ANTHROPIC_PRICES = {
    "claude-fable-5-1":  {"in": 10.0, "cache_write": 12.5,  "cache_hit": 0.25, "out": 50.0},
    "claude-opus-5-5":   {"in": 4.0,  "cache_write": 5.0,   "cache_hit": 0.20, "out": 20.0},
    "claude-sonnet-5-5": {"in": 2.0,  "cache_write": 2.5,   "cache_hit": 0.10, "out": 10.0},
    "claude-haiku-5-5":  {"in": 0.10, "cache_write": 0.125, "cache_hit": 0.01, "out": 0.50},
}
BATCH_DISCOUNT = 0.5

# Rough per-batch token profile (see PIPELINE.md, Cost). Tune after the pilot.
# 'cached' = the system prompt (shared rules + agent file), identical on every call for a role.
PROFILE = {
    "translator":         {"calls": 1.3, "in": 11000, "cached": 6000, "out": 2500},  # incl. repairs
    "reviewer":           {"calls": 1.5, "in": 14000, "cached": 7000, "out": 2000},  # incl. debate
    "coordinator":        {"calls": 1.0, "in": 18000, "cached": 7000, "out": 2500},
    "consistency-editor": {"calls": 0.0, "in": 0, "cached": 0, "out": 0},  # per book; not estimated here
    "feedback-triage":    {"calls": 0.0, "in": 0, "cached": 0, "out": 0},
}
VERSES_PER_BATCH = 4.2


def role_of(agent):
    if agent.startswith("translator-"):
        return "translator"
    if agent.startswith("reviewer-"):
        return "reviewer"
    return agent


def family(agent_cfg):
    if agent_cfg.get("gateway") == "anthropic":
        return "anthropic"
    return agent_cfg["model"].split("/", 1)[0].lower()


def arg(flag, default=None):
    return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv else default


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    cfg = json.load(open(sys.argv[1]))
    verses = int(arg("--verses", 104))
    credit = float(arg("--credit")) if arg("--credit") else None
    batches = verses / VERSES_PER_BATCH
    anth_cfg = cfg.get("inference", {}).get("anthropic", {})
    batch_mode = "--batch" in sys.argv or anth_cfg.get("batch_api", {}).get("enabled", False)
    caching = anth_cfg.get("prompt_caching", {}).get("enabled", True)

    agents = dict(cfg.get("agents", {}))
    agents.update(cfg.get("agents_feedback", {}))

    catalog = None
    if any(a.get("gateway", "openrouter") == "openrouter" for a in agents.values()):
        with urllib.request.urlopen(MODELS_URL, timeout=30) as r:
            catalog = {m["id"]: m for m in json.load(r)["data"]}

    failures, warnings = [], []
    totals = {"openrouter": 0.0, "anthropic": 0.0}

    print(f"{'agent':26} {'gateway':10} {'model':42} {'tools':5} {'json':5} {'$/M in':>7} {'$/M out':>7} {'est $':>9}")
    for name, a in agents.items():
        gw = a.get("gateway", "openrouter")
        slug = a["model"]
        prof = PROFILE.get(role_of(name), {"calls": 0, "in": 0, "cached": 0, "out": 0})
        calls = batches * prof["calls"]

        if gw == "anthropic":
            p = ANTHROPIC_PRICES.get(slug)
            if not p:
                failures.append(f"{name}: '{slug}' is not a known Anthropic model id ({', '.join(ANTHROPIC_PRICES)})")
                continue
            tools = js = True
            cached = prof["cached"] if caching else 0
            per_call = ((prof["in"] - cached) * p["in"] + cached * p["cache_hit"] + prof["out"] * p["out"]) / 1e6
            est = calls * per_call * (BATCH_DISCOUNT if batch_mode else 1.0)
            p_in, p_out = p["in"], p["out"]
        elif gw == "openrouter":
            m = catalog.get(slug)
            if not m:
                failures.append(f"{name}: model '{slug}' not in the OpenRouter catalog")
                continue
            params = set(m.get("supported_parameters", []))
            tools = "tools" in params
            js = "structured_outputs" in params or "response_format" in params
            p_in = float(m["pricing"]["prompt"]) * 1e6
            p_out = float(m["pricing"]["completion"]) * 1e6
            est = calls * (prof["in"] * p_in + prof["out"] * p_out) / 1e6
        else:
            failures.append(f"{name}: unknown gateway '{gw}'")
            continue

        if gw == "anthropic" and slug == "claude-haiku-5-5" and not a.get("max_prompt_tokens"):
            warnings.append(f"{name}: Haiku 5.5 costs 5x more above 100k prompt tokens; set max_prompt_tokens")
        if a.get("needs_tools") and not tools:
            failures.append(f"{name}: '{slug}' does not support tools, but this agent needs the lookup tool")
        if not js:
            warnings.append(f"{name}: '{slug}' has no structured-output support; relying on validate-and-retry")
        totals[gw] += est
        print(f"{name:26} {gw:10} {slug:42} {str(tools):5} {str(js):5} {p_in:7.3f} {p_out:7.3f} {est:9.2f}")

    rules = cfg.get("model_rules", {})
    tr = {n: family(a) for n, a in agents.items() if n.startswith("translator-")}
    if rules.get("translators_distinct_families") and len(set(tr.values())) < len(tr):
        failures.append(f"translators share a model family: {tr}")
    aud = agents.get("reviewer-meaning-auditor")
    if aud and rules.get("auditor_family_differs_from_translators") and family(aud) in tr.values():
        failures.append(f"meaning auditor family '{family(aud)}' is also used by a translator")

    free_models = [a["model"] for a in agents.values() if a["model"].endswith(":free")]
    if free_models:
        warnings.append(f"free models in use ({len(free_models)}): shared limit of 50 requests/day per account, "
                        "1,000/day after a one-time 10-credit purchase; free IDs can be withdrawn")

    total = sum(totals.values())
    mode = "batch API" if batch_mode else "standard"
    print(f"\nScope: {verses} verses, about {batches:.0f} batches.")
    print(f"OpenRouter: ${totals['openrouter']:.2f}   Anthropic ({mode}, caching {'on' if caching else 'off'}): "
          f"${totals['anthropic']:.2f}   Total: ${total:.2f}")
    print("Excludes the consistency pass and lookups beyond the preloaded reference.")
    if credit is not None:
        share = totals["anthropic"] / credit * 100 if credit else 0
        print(f"Anthropic credit: ${credit:.2f}. This run uses about {share:.1f}% of it.")
        if totals["anthropic"] > credit:
            warnings.append(f"Anthropic estimate ${totals['anthropic']:.2f} exceeds the ${credit:.2f} credit")
    for w in warnings:
        print("WARN ", w)
    for f in failures:
        print("FAIL ", f)
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
