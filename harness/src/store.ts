// Run directory: one folder per run, JSONL per record type, plus state.json for resume.
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { appendJsonl, readJson, readJsonl, writeJson, now } from "./util.js";

export type BatchState = "queued" | "translating" | "checking" | "reviewing" | "debating" | "coordinating" | "accepted" | "escalated" | "failed";

export class Store {
  state: { run_id: string; created_at: string; batches: Record<string, { state: BatchState; updated_at: string; error?: string }>; spend_usd: number };
  constructor(public dir: string, runId: string) {
    mkdirSync(dir, { recursive: true });
    const p = join(dir, "state.json");
    this.state = existsSync(p) ? readJson(p) : { run_id: runId, created_at: now(), batches: {}, spend_usd: 0 };
    this.save();
  }
  path(name: string): string { return join(this.dir, name); }
  save(): void { writeJson(this.path("state.json"), this.state); }
  setBatch(id: string, state: BatchState, error?: string): void {
    this.state.batches[id] = { state, updated_at: now(), ...(error ? { error } : {}) };
    this.save();
  }
  batchState(id: string): BatchState | undefined { return this.state.batches[id]?.state; }
  add(kind: string, record: unknown): void { appendJsonl(this.path(`record/${kind}.jsonl`), record); }
  all<T = any>(kind: string): T[] { return readJsonl<T>(this.path(`record/${kind}.jsonl`)); }
  addSpend(usd: number): void { this.state.spend_usd += usd; this.save(); }
}
