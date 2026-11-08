// Glossary store: seeded from data/glossary.seed.json, versioned, with provisional/ratified lifecycle.
import { existsSync } from "node:fs";
import { readJson, writeJson, now } from "./util.js";
import { tokenize } from "./text.js";

export interface GlossaryEntry {
  id: string;
  kjv_form: string;
  forms?: string[];
  sense: string;
  update: string;
  category: string;
  examples?: string[];
  exceptions?: string[];
  status: "proposed" | "provisional" | "ratified" | "rejected";
  uses?: number;
  created_in?: string | null;
  ratified_by?: string | null;
  notes?: string;
}

export interface GlossaryProposal { kjv_form: string; sense: string; update: string; category: string; example?: string; notes?: string }

export interface Conflict { kjv_form: string; sense: string; existing: string; proposed: string; existing_id: string; decision_id: string }

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
const normSense = (s: string) => s.toLowerCase().replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();

export class Glossary {
  version = 0;
  entries: GlossaryEntry[] = [];
  constructor(private path: string, private ratifyAfter: number) {}

  static open(path: string, seedPath: string, ratifyAfter: number): Glossary {
    const g = new Glossary(path, ratifyAfter);
    if (existsSync(path)) {
      const d = readJson(path);
      g.version = d.glossary_version;
      g.entries = d.entries;
    } else {
      const seed = readJson(seedPath);
      g.entries = seed.entries.map((e: GlossaryEntry) => ({ ...e, uses: 0 }));
      g.save();
    }
    return g;
  }

  save(): void {
    writeJson(this.path, { glossary_version: this.version, saved_at: now(), entries: this.entries });
  }

  formsOf(e: GlossaryEntry): string[] {
    return [e.kjv_form, ...(e.forms ?? [])];
  }

  /** Entries whose forms occur in the text (whole-token match). */
  relevant(texts: string[]): GlossaryEntry[] {
    const toks = texts.map((t) => tokenize(t).map((x) => x.norm));
    return this.entries.filter((e) => e.status !== "rejected" && this.formsOf(e).some((f) => {
      const p = tokenize(f).map((x) => x.norm);
      return toks.some((ts) => ts.some((_, i) => p.every((w, k) => ts[i + k] === w)));
    }));
  }

  get(id: string): GlossaryEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  /** Record that an accepted decision applied these entries. Returns ids whose status changed. */
  recordUses(ids: string[]): string[] {
    const changed: string[] = [];
    for (const id of new Set(ids)) {
      const e = this.get(id);
      if (!e || e.status === "rejected") continue;
      e.uses = (e.uses ?? 0) + 1;
      if (e.status === "proposed") { e.status = "provisional"; changed.push(id); }
      if (e.status === "provisional" && e.uses >= this.ratifyAfter) { e.status = "ratified"; e.ratified_by = "auto"; changed.push(id); }
    }
    if (changed.length || ids.length) { this.version++; this.save(); }
    return changed;
  }

  /** Add coordinator proposals. Identical proposals merge; different updates for the same form+sense conflict. */
  propose(proposals: GlossaryProposal[], decisionId: string): { added: string[]; conflicts: Conflict[] } {
    const added: string[] = [], conflicts: Conflict[] = [];
    for (const p of proposals) {
      if (!p?.kjv_form || !p?.update) continue;
      const sameForm = (e: GlossaryEntry) => e.kjv_form.toLowerCase() === p.kjv_form.toLowerCase();
      // Same form and same rendering is one decision, however the sense is worded: merge it.
      const dup = this.entries.find((e) => sameForm(e) && e.update.toLowerCase() === p.update.toLowerCase() && e.status !== "rejected");
      if (dup) {
        if (p.example && !(dup.examples ?? []).includes(p.example)) dup.examples = [...(dup.examples ?? []), p.example];
        if (normSense(dup.sense) !== normSense(p.sense) && !(dup.notes ?? "").includes(p.sense)) dup.notes = [dup.notes, `also: ${p.sense}`].filter(Boolean).join("; ");
        continue;
      }
      const same = this.entries.find((e) => sameForm(e) && normSense(e.sense) === normSense(p.sense));
      if (same) {
        if (same.update.toLowerCase() !== p.update.toLowerCase())
          conflicts.push({ kjv_form: p.kjv_form, sense: p.sense, existing: same.update, proposed: p.update, existing_id: same.id, decision_id: decisionId });
        else if (p.example && !(same.examples ?? []).includes(p.example)) same.examples = [...(same.examples ?? []), p.example];
        continue;
      }
      let id = `g-${slug(p.kjv_form)}-${slug(p.update === "KEEP" ? "keep" : p.update)}`;
      while (this.get(id)) id += "-x";
      this.entries.push({
        id, kjv_form: p.kjv_form, sense: p.sense, update: p.update, category: p.category,
        examples: p.example ? [p.example] : [], status: "provisional", uses: 0, created_in: decisionId, notes: p.notes,
      });
      added.push(id);
    }
    if (added.length) { this.version++; this.save(); }
    return { added, conflicts };
  }
}
