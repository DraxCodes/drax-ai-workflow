import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";
import { toPosix } from "./manifest.mjs";

export const RUNS_REL = ".scratch/runs";
export const RUNS_FILE = `${RUNS_REL}/runs.jsonl`;
export const RUN_KINDS = [
  "benchmark",
  "visual-review",
  "hillclimb",
  "council",
  "security",
  "probe",
  "docs",
  "workflow",
];
export const RUN_STATUSES = ["started", "passed", "failed", "skipped", "dry-run"];

function nowIso() {
  return new Date().toISOString();
}

function newId(date = new Date()) {
  const stamp = date.toISOString().replace(/[-:.]/g, "").slice(0, 15);
  return `${stamp}-${randomUUID().slice(0, 8)}`;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function validateRun(value) {
  const errors = [];
  if (!isObject(value)) return ["run: expected an object"];
  if (value.schemaVersion !== 1) errors.push("schemaVersion: expected 1");
  if (!nonEmpty(value.id)) errors.push("id: expected a non-empty string");
  if (!RUN_KINDS.includes(value.kind)) {
    errors.push(`kind: expected one of ${RUN_KINDS.join(", ")}`);
  }
  if (!RUN_STATUSES.includes(value.status)) {
    errors.push(`status: expected one of ${RUN_STATUSES.join(", ")}`);
  }
  if (!nonEmpty(value.startedAt)) errors.push("startedAt: expected an ISO timestamp");
  if (!isObject(value.base) || !nonEmpty(value.base.version)) {
    errors.push("base.version: expected the base version");
  }
  if (!nonEmpty(value.project)) errors.push("project: expected a project name");
  if (value.models !== undefined && !Array.isArray(value.models)) {
    errors.push("models: expected an array");
  }
  if (value.evidence !== undefined && !Array.isArray(value.evidence)) {
    errors.push("evidence: expected an array");
  }
  if (value.usage !== undefined && !isObject(value.usage)) {
    errors.push("usage: expected an object");
  }
  return errors;
}

function fold(events) {
  const byId = new Map();
  for (const event of events) {
    const current = byId.get(event.id);
    if (!current) {
      byId.set(event.id, { ...event });
      continue;
    }
    byId.set(event.id, {
      ...current,
      ...event,
      startedAt: current.startedAt ?? event.startedAt,
      events: (current.events ?? 1) + 1,
    });
  }
  return [...byId.values()].sort((a, b) =>
    String(b.startedAt).localeCompare(String(a.startedAt)),
  );
}

export function readRunEvents(projectDir) {
  const file = join(projectDir, RUNS_FILE);
  if (!existsSync(file)) return { events: [], errors: [], file };
  const errors = [];
  const events = [];
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line);
      const problems = validateRun(value);
      if (problems.length > 0) {
        errors.push(`line ${index + 1}: ${problems.join("; ")}`);
      } else {
        events.push(value);
      }
    } catch (error) {
      errors.push(`line ${index + 1}: ${error.message}`);
    }
  }
  return { events, errors, file };
}

export function listRuns(projectDir) {
  const { events, errors, file } = readRunEvents(projectDir);
  return { runs: fold(events), errors, file };
}

export function showRun(projectDir, id) {
  const { runs, errors, file } = listRuns(projectDir);
  return { run: runs.find((run) => run.id === id) ?? null, errors, file };
}

export function appendRun(projectDir, value) {
  const problems = validateRun(value);
  if (problems.length > 0) {
    const error = new Error(problems.join("; "));
    error.problems = problems;
    throw error;
  }
  const file = join(projectDir, RUNS_FILE);
  mkdirSync(join(projectDir, RUNS_REL), { recursive: true });
  appendFileSync(file, `${JSON.stringify(value)}\n`, "utf8");
  return { run: value, file };
}

export function hashFile(path) {
  if (!existsSync(path)) return null;
  const stat = statSync(path);
  if (!stat.isFile()) return null;
  return `sha256:${createHash("sha256").update(readFileSync(path)).digest("hex")}`;
}

function evidenceEntry(projectDir, entry, kind = "artifact") {
  if (isObject(entry)) {
    const file = resolve(projectDir, entry.path);
    return {
      ...entry,
      path: existsSync(file) ? toPosix(relative(projectDir, file)) : entry.path,
      sha256: entry.sha256 ?? hashFile(file),
      kind: entry.kind ?? kind,
    };
  }
  const file = resolve(projectDir, String(entry));
  const inside = !relative(projectDir, file).startsWith("..");
  return {
    path: inside ? toPosix(relative(projectDir, file)) : file,
    sha256: hashFile(file),
    kind,
  };
}

export function startRun({
  projectDir,
  kind,
  task,
  project,
  base,
  commit,
  models,
  rubric,
  protocol,
  pack,
  operator,
  notes,
  evidence,
}) {
  const record = {
    schemaVersion: 1,
    id: newId(),
    kind,
    status: "started",
    startedAt: nowIso(),
    base: {
      name: base?.name ?? "drax-ai-workflow",
      version: base?.version ?? "unknown",
      commit: base?.commit ?? null,
    },
    project,
    task: task ?? null,
    commit: commit ?? null,
    models: models ?? [],
    rubric: rubric ?? null,
    protocol: protocol ?? null,
    pack: pack ?? null,
    operator: operator ?? null,
    notes: notes ?? null,
    evidence: (evidence ?? []).map((entry) => evidenceEntry(projectDir, entry)),
  };
  return appendRun(projectDir, record);
}

export function finishRun(projectDir, id, updates = {}) {
  const { run, errors } = showRun(projectDir, id);
  if (!run) {
    const error = new Error(
      errors.length > 0 ? errors.join("; ") : `no run ${id} in ${join(projectDir, RUNS_FILE)}`,
    );
    error.problems = errors;
    throw error;
  }
  const patch = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) patch[key] = value;
  }
  const next = {
    ...run,
    ...patch,
    id: run.id,
    startedAt: run.startedAt,
    endedAt: patch.endedAt ?? nowIso(),
    evidence: [
      ...(run.evidence ?? []),
      ...(patch.evidence ?? []).map((entry) => evidenceEntry(projectDir, entry)),
    ],
  };
  delete next.events;
  return appendRun(projectDir, next);
}

export function recordRun(projectDir, value) {
  const record = {
    schemaVersion: 1,
    ...value,
    id: value.id ?? newId(),
    startedAt: value.startedAt ?? nowIso(),
    base: {
      name: value.base?.name ?? "drax-ai-workflow",
      version: value.base?.version ?? "unknown",
      commit: value.base?.commit ?? null,
    },
    evidence: (value.evidence ?? []).map((entry) => evidenceEntry(projectDir, entry)),
  };
  return appendRun(projectDir, record);
}

export function exportRuns(projectDir, outFile) {
  const { runs, errors } = listRuns(projectDir);
  const target = outFile ? resolve(projectDir, outFile) : join(projectDir, RUNS_REL, "export.json");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify({ schemaVersion: 1, runs }, null, 2)}\n`, "utf8");
  return { file: target, runs: runs.length, errors };
}

export function summarizeRuns(runs) {
  const byKind = {};
  const byStatus = {};
  let costUsd = 0;
  for (const run of runs) {
    byKind[run.kind] = (byKind[run.kind] ?? 0) + 1;
    byStatus[run.status] = (byStatus[run.status] ?? 0) + 1;
    if (Number.isFinite(run.usage?.costUsd)) costUsd += run.usage.costUsd;
  }
  return { total: runs.length, byKind, byStatus, costUsd: Number(costUsd.toFixed(6)) };
}