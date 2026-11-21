import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  RUNS_FILE,
  exportRuns,
  finishRun,
  listRuns,
  readRunEvents,
  recordRun,
  showRun,
  startRun,
  summarizeRuns,
  validateRun,
} from "../tools/lib/runs.mjs";
import { tempDir } from "./helpers.mjs";

function base(project) {
  return { name: "drax-ai-workflow", version: "0.7.0", commit: "abc1234" };
}

test("start, finish, list and show fold the JSONL events", () => {
  const project = tempDir("wb-runs-");
  const started = startRun({
    projectDir: project,
    kind: "hillclimb",
    task: "perception pass",
    project: "demo",
    base: base(project),
    models: ["surprise/model"],
    rubric: "perception",
  });

  const listed = listRuns(project);
  assert.equal(listed.runs.length, 1);
  assert.equal(listed.runs[0].status, "started");

  const finished = finishRun(project, started.run.id, {
    status: "passed",
    verdict: "SHIP",
    scores: { score: 8 },
    usage: { costUsd: 0.12, inputTokens: 100, outputTokens: 20 },
    notes: "kept",
  });

  assert.equal(finished.run.status, "passed");
  assert.equal(finished.run.scores.score, 8);
  assert.equal(finished.run.startedAt, started.run.startedAt);

  const shown = showRun(project, started.run.id);
  assert.equal(shown.run.status, "passed");
  assert.equal(shown.run.verdict, "SHIP");
  assert.equal(shown.run.events, 2);

  const events = readRunEvents(project);
  assert.equal(events.events.length, 2);
  assert.equal(events.errors.length, 0);
  assert.ok(existsSync(join(project, RUNS_FILE)));
});

test("evidence is hashed and the summary totals cost", () => {
  const project = tempDir("wb-runs-evidence-");
  mkdirSync(join(project, "artifacts"), { recursive: true });
  writeFileSync(join(project, "artifacts", "shot.txt"), "screen\n");

  const result = startRun({
    projectDir: project,
    kind: "visual-review",
    task: "blindspot",
    project: "demo",
    base: base(project),
  });
  finishRun(project, result.run.id, {
    status: "passed",
    usage: { costUsd: 0.25 },
    evidence: ["artifacts/shot.txt"],
  });

  const run = showRun(project, result.run.id).run;
  assert.equal(run.evidence.length, 1);
  assert.match(run.evidence[0].sha256, /^sha256:[0-9a-f]{64}$/);
  assert.equal(run.evidence[0].path, "artifacts/shot.txt");

  const summary = summarizeRuns(listRuns(project).runs);
  assert.equal(summary.total, 1);
  assert.equal(summary.byKind["visual-review"], 1);
  assert.equal(summary.costUsd, 0.25);
});

test("recordRun validates required fields and accepts a complete record", () => {
  const project = tempDir("wb-runs-record-");
  const invalid = validateRun({ kind: "unknown" });
  assert.ok(invalid.length > 0);

  const result = recordRun(project, {
    kind: "council",
    status: "passed",
    project: "demo",
    base: base(project),
    task: "shape decision",
    verdict: "proceed",
  });
  assert.equal(result.run.kind, "council");
  assert.equal(listRuns(project).runs.length, 1);
});

test("export writes the folded records", () => {
  const project = tempDir("wb-runs-export-");
  startRun({
    projectDir: project,
    kind: "security",
    task: "diff review",
    project: "demo",
    base: base(project),
  });
  const result = exportRuns(project, "artifacts/export.json");
  const text = JSON.parse(readFileSync(result.file, "utf8"));
  assert.equal(text.runs.length, 1);
  assert.equal(text.runs[0].kind, "security");
});