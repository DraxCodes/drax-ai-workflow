#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadPack,
  readRecords,
  aggregateRecords,
} from "../tools/lib/benchmark.mjs";

const siteRoot = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(siteRoot, "..");

const args = process.argv.slice(2);
function arg(name, fallback) {
  const at = args.indexOf(`--${name}`);
  return at === -1 ? fallback : args[at + 1];
}

const project = resolve(arg("project", resolve(repoRoot, "..", "personal-website")));
const outFile = resolve(arg("out", join(siteRoot, "data", "findings.json")));
const benchmarks = join(project, ".scratch", "benchmarks");

const packs = {
  security: loadPack(join(repoRoot, "benchmarks", "packs", "security-review")),
  chair: loadPack(join(repoRoot, "benchmarks", "packs", "council-chair")),
  shape: loadPack(join(repoRoot, "benchmarks", "packs", "council-shape")),
  experience: loadPack(join(repoRoot, "benchmarks", "packs", "council-experience")),
  visual: loadPack(join(repoRoot, "benchmarks", "packs", "visual-project-list")),
};

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

const round = (value, places = 0) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};
const mean = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0);

/** Deterministic bootstrap so the report does not change on every build. */
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bootstrapCi(values, rounds = 20000) {
  if (values.length < 3) return null;
  const random = mulberry32(0x51ed270b);
  const means = [];
  for (let roundIndex = 0; roundIndex < rounds; roundIndex += 1) {
    let sum = 0;
    for (let index = 0; index < values.length; index += 1) {
      sum += values[Math.floor(random() * values.length)];
    }
    means.push(sum / values.length);
  }
  means.sort((a, b) => a - b);
  const low = means[Math.floor(0.025 * (means.length - 1))];
  const high = means[Math.floor(0.975 * (means.length - 1))];
  return [round(low * 100), round(high * 100)];
}

function summaryRow(row) {
  const catchPct = Math.round(row.catch * 100);
  const precisionPct = row.precision === null ? null : Math.round(row.precision * 100);
  const completeness =
    row.scored === 0
      ? "none"
      : row.failed > 0 || row.failedTasks > 0
        ? "partial"
        : row.scored >= row.minTasks
          ? "complete"
          : "short";
  return {
    model: row.model,
    tier: row.tier,
    confidence: row.confidence,
    completeness,
    scored: row.scored,
    failed: row.failed,
    failedTasks: row.failedTasks,
    samples: row.samples,
    retries: row.retries ?? 0,
    catch: catchPct,
    precision: precisionPct,
    fp: row.falsePositives,
    cost: row.costUsd,
    costPerTask:
      row.costUsd === null ? null : Number((row.costUsd / Math.max(1, row.scored)).toFixed(6)),
    costPerCall:
      row.costUsd === null
        ? null
        : Number(
            (row.costUsd / Math.max(1, row.scored) / Math.max(1, row.samples ?? 1)).toFixed(6),
          ),
    unique: row.uniqueCatch,
    maxTokens: row.maxTokens,
    packHash: row.packHash,
    protocol: row.protocol,
    pack: row.pack,
    packVersion: row.packVersion,
    lastDate: row.lastDate,
    stale: row.stale,
  };
}

function seatRecords(config) {
  const records = [];
  const files = new Set();
  for (const [model, modelFiles] of Object.entries(config.models)) {
    for (const file of modelFiles) {
      if (!existsSync(file)) continue;
      files.add(file);
      const { records: read, error } = readRecords(file);
      if (error) throw new Error(error);
      records.push(
        ...read.filter(
          (record) =>
            record.model === model &&
            record.pack === config.pack.pack?.id &&
            record.slot === config.pack.pack?.slot,
        ),
      );
    }
  }
  return { records, files: [...files] };
}

function taskScores(records, row) {
  const byTask = new Map();
  for (const record of records) {
    if (
      record.model !== row.model ||
      record.ok === false ||
      (record.maxTokens ?? null) !== (row.maxTokens ?? null) ||
      (record.packHash ?? null) !== (row.packHash ?? null)
    ) {
      continue;
    }
    const current = byTask.get(record.task) ?? [];
    current.push((record.weightedCaught ?? 0) / Math.max(1, record.weightedTotal ?? 0));
    byTask.set(record.task, current);
  }
  return [...byTask.values()].map(mean);
}

function cellFor(records, model, task, maxTokens) {
  const all = records.filter(
    (record) =>
      record.model === model &&
      record.task === task.id &&
      (maxTokens === null || (record.maxTokens ?? null) === maxTokens),
  );
  const valid = all.filter((record) => record.ok !== false);
  const total = task.key.criteria?.length ?? task.key.defects?.length ?? 0;
  const allIds = (task.key.criteria ?? task.key.defects ?? []).map((entry) => entry.id);
  if (valid.length === 0) {
    return {
      ok: false,
      reason: all.length ? "invalid answer" : "not run",
      caught: [],
      missed: allIds,
      caughtCount: 0,
      total,
      weightedPct: 0,
      fp: 0,
      samples: all.length,
      invalid: all.length,
      maxTokens,
    };
  }
  const first = valid[0];
  return {
    ok: true,
    reason: null,
    caught: first.caught ?? [],
    missed: first.missed ?? [],
    caughtCount: round(mean(valid.map((record) => record.caught?.length ?? 0))),
    total,
    weightedPct: round(
      mean(
        valid.map(
          (record) => (record.weightedCaught ?? 0) / Math.max(1, record.weightedTotal ?? 0),
        ),
      ) * 100,
    ),
    fp: round(mean(valid.map((record) => record.falsePositives ?? 0))),
    samples: valid.length,
    invalid: all.length - valid.length,
    maxTokens: first.maxTokens ?? null,
  };
}

function tasksFor(config, records, rows) {
  const tokenByModel = Object.fromEntries(rows.map((row) => [row.model, row.maxTokens]));
  return config.pack.tasks.map((task) => {
    const models = {};
    for (const [model, maxTokens] of Object.entries(tokenByModel)) {
      models[model] = cellFor(records, model, task, maxTokens);
    }
    const ids = (task.key.criteria ?? task.key.defects ?? []).map((entry) => entry.id);
    return {
      task: task.id,
      total: (task.key.criteria ?? task.key.defects ?? []).length,
      ids,
      models,
    };
  });
}

function diffTasks(tasks, first, second) {
  return tasks.map((task) => {
    const a = new Set(task.models[first]?.caught ?? []);
    const b = new Set(task.models[second]?.caught ?? []);
    const both = task.ids.filter((id) => a.has(id) && b.has(id));
    const onlyFirst = task.ids.filter((id) => a.has(id) && !b.has(id));
    const onlySecond = task.ids.filter((id) => b.has(id) && !a.has(id));
    const neither = task.ids.filter((id) => !a.has(id) && !b.has(id));
    return { task: task.task, both, onlyFirst, onlySecond, neither };
  });
}

function uniqueIds(tasks, model, reference) {
  const unique = [];
  for (const task of tasks) {
    const mine = new Set(task.models[model]?.caught ?? []);
    const theirs = new Set(task.models[reference]?.caught ?? []);
    for (const id of task.ids) {
      if (mine.has(id) && !theirs.has(id)) unique.push({ task: task.task, id });
    }
  }
  return unique;
}

function readSeat(config) {
  const { records, files } = seatRecords(config);
  const rows = aggregateRecords({
    records,
    slot: config.pack.pack.slot,
    referenceModel: config.reference,
  }).map((row) => {
    const summary = summaryRow(row);
    summary.catchCi = bootstrapCi(taskScores(records, row));
    return summary;
  });
  const tasks = tasksFor(config, records, rows);
  for (const row of rows) {
    row.uniqueIds = config.reference ? uniqueIds(tasks, row.model, config.reference) : [];
  }
  const chosen = rows.find((row) => row.model === config.chosen) ?? rows[0] ?? null;
  const runnerUp =
    rows
      .filter(
        (row) =>
          row !== chosen &&
          row.completeness === "complete" &&
          row.maxTokens === chosen?.maxTokens,
      )
      .sort((a, b) => b.catch - a.catch || (b.precision ?? -1) - (a.precision ?? -1))[0] ??
    rows
      .filter((row) => row !== chosen && row.scored > 0 && row.completeness === "complete")
      .sort((a, b) => b.catch - a.catch || (b.precision ?? -1) - (a.precision ?? -1))[0] ??
    null;
  const diff = chosen && runnerUp ? diffTasks(tasks, chosen.model, runnerUp.model) : [];
  return { rows, tasks, models: rows.map((row) => row.model), chosen, runnerUp, diff, files };
}

const sources = {
  risk: join(benchmarks, "2026-11-21-risk-16k-head-to-head.json"),
  risk4k: join(benchmarks, "2026-11-21-risk-4k", "records.json"),
  chair: join(benchmarks, "2026-11-21-chair-10-16k", "records.json"),
  chair8: join(benchmarks, "2026-11-21-chair-10", "records.json"),
  chair16: join(benchmarks, "2026-11-22-glmflash-16k-chair", "records.json"),
  chair53: join(benchmarks, "2026-11-22-glm53-16k-chair", "records.json"),
  shape: join(benchmarks, "2026-11-21-shape-10-16k", "records.json"),
  shape8: join(benchmarks, "2026-11-21-shape-10", "records.json"),
  shape16: join(benchmarks, "2026-11-22-glmflash-16k-shape", "records.json"),
  shape53: join(benchmarks, "2026-11-22-glm53-16k-shape", "records.json"),
  experience: join(benchmarks, "2026-11-21-experience-10", "records.json"),
  experience16: join(benchmarks, "2026-11-22-glmflash-16k-experience", "records.json"),
  experience53: join(benchmarks, "2026-11-22-glm53-16k-experience", "records.json"),
  visual: join(benchmarks, "2026-11-22-visual-10-task-retry", "records.json"),
};

const seatConfigs = {
  chair: {
    pack: packs.chair,
    chosen: "surplus/deepseek-v4.1-flash-1017",
    reference: "surplus/deepseek-v4.1-flash-1017",
    models: {
      "surplus/deepseek-v4.1-flash-1017": [sources.chair],
      "surplus/qwen3.8-flash": [sources.chair],
      "surplus/glm-5.3-flash": [sources.chair16],
      "surplus/glm-5.3": [sources.chair53],
    },
  },
  shape: {
    pack: packs.shape,
    chosen: "surplus/deepseek-v4.1-flash-1017",
    reference: "surplus/deepseek-v4.1-flash-1017",
    models: {
      "surplus/deepseek-v4.1-flash-1017": [sources.shape],
      "surplus/qwen3.8-flash": [sources.shape],
      "surplus/glm-5.3-flash": [sources.shape16],
      "surplus/glm-5.3": [sources.shape53],
    },
  },
  experience: {
    pack: packs.experience,
    chosen: "surplus/deepseek-v4.1-flash-1017",
    reference: "surplus/deepseek-v4.1-flash-1017",
    models: {
      "surplus/deepseek-v4.1-flash-1017": [sources.experience],
      "surplus/glm-5.3-flash": [sources.experience16],
      "surplus/glm-5.3": [sources.experience53],
    },
  },
  risk: {
    pack: packs.security,
    chosen: "surplus/glm-5.3",
    reference: "surplus/glm-5.3",
    models: {
      "surplus/glm-5.3": [sources.risk],
      "surplus/qwen3.8-flash": [sources.risk],
      "surplus/glm-5.3-flash": [sources.risk4k],
      "surplus/deepseek-v4.1-flash-1017": [sources.risk4k],
      "surplus/claude-haiku-4.5": [sources.risk4k],
    },
  },
  visual: {
    pack: packs.visual,
    chosen: "surplus/glm-5.3-flash",
    reference: "surplus/glm-5.3-flash",
    models: {
      "surplus/glm-5.3-flash": [sources.visual],
    },
  },
};

const seats = {};
for (const [id, config] of Object.entries(seatConfigs)) {
  seats[id] = readSeat(config);
}

const runDirs = existsSync(benchmarks)
  ? readdirSync(benchmarks, { withFileTypes: true })
  : [];
const EVIDENCE_RUNS = new Set([
  "2026-11-21-chair-10-16k",
  "2026-11-21-shape-10-16k",
  "2026-11-21-experience-10",
  "2026-11-21-risk-glm53-16k",
  "2026-11-21-risk-qwen-16k",
  "2026-11-22-visual-10-task-retry",
]);
const STABILITY_RUNS = new Set(["2026-11-22-chair-10-16k-samples2"]);
const CHALLENGER_RUNS = new Set([
  "2026-11-22-glm53-16k-chair",
  "2026-11-22-glm53-16k-shape",
  "2026-11-22-glm53-16k-experience",
  "2026-11-22-glmflash-16k-chair",
  "2026-11-22-glmflash-16k-chair-timeout60",
  "2026-11-22-glmflash-16k-shape",
  "2026-11-22-glmflash-16k-experience",
]);
const PILOT_RUNS = new Set([
  "2026-11-21-chair-10",
  "2026-11-21-shape-10",
  "2026-11-21-risk-4k",
  "2026-11-21-visual-pack-final",
  "2026-11-22-visual-10-task",
  "2026-11-22-glmflash-16k-chair",
  "2026-11-22-glmflash-16k-chair-timeout60",
  "2026-11-22-glmflash-16k-shape",
  "2026-11-22-glmflash-16k-experience",
  "2026-11-22-glm53-16k-chair",
  "2026-11-22-glm53-16k-shape",
  "2026-11-22-glm53-16k-experience",
]);

function purposeFor(dir, run) {
  if (EVIDENCE_RUNS.has(dir)) return "evidence";
  if (STABILITY_RUNS.has(dir)) return "stability check";
  if (CHALLENGER_RUNS.has(dir)) return "challenger";
  if (PILOT_RUNS.has(dir)) return "pilot";
  if (dir.includes("1200") || dir.includes("4k")) return "token tuning";
  if ((run.failed ?? 0) > 0) return "failed";
  return "pilot";
}

const runs = [];
for (const entry of runDirs) {
  if (!entry.isDirectory()) continue;
  const dir = join(benchmarks, entry.name);
  const run = readJson(join(dir, "run.json"));
  if (!run) continue;
  const samples = run.plan?.samples ?? 1;
  const maxTokens = run.plan?.maxTokens ?? null;
  runs.push({
    dir: entry.name,
    pack: run.plan?.pack ?? "unknown",
    protocol: run.protocol ?? null,
    models: run.plan?.models ?? [],
    samples,
    retries: run.plan?.retries ?? 0,
    maxTokens,
    records: run.records ?? 0,
    failed: run.failed ?? 0,
    spent: run.spentUsd ?? 0,
    startedAt: run.startedAt ?? null,
    selected: EVIDENCE_RUNS.has(entry.name),
    purpose: purposeFor(entry.name, run),
  });
}
runs.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));

let probeSpend = 0;
const ledger = join(project, ".scratch", "runs", "runs.jsonl");
if (existsSync(ledger)) {
  for (const line of readFileSync(ledger, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line);
      if (record.kind === "probe" && Number.isFinite(record.usage?.costUsd)) {
        probeSpend += record.usage.costUsd;
      }
    } catch {
      /* skip a malformed ledger line */
    }
  }
}

const runSpend = runs.reduce((sum, run) => sum + (Number.isFinite(run.spent) ? run.spent : 0), 0);
const evidenceSpend = runs
  .filter((run) => run.selected)
  .reduce((sum, run) => sum + (Number.isFinite(run.spent) ? run.spent : 0), 0);
const tuningSpend = Number((runSpend - evidenceSpend).toFixed(6));

const chosenRows = ["chair", "shape", "experience", "risk"]
  .map((id) => seats[id].chosen)
  .filter(Boolean);
const councilOneRound = chosenRows.reduce(
  (sum, row) => sum + (row.costPerCall ?? row.costPerTask ?? 0),
  0,
);

const findings = {
  generatedAt: new Date().toISOString().slice(0, 10),
  project: project.split(/[\\/]/).pop(),
  sources: Object.fromEntries(
    [
      ...new Map(
        Object.values(seatConfigs)
          .flatMap((config) => Object.values(config.models).flat())
          .map((file) => [
            file.startsWith(benchmarks)
              ? file.slice(benchmarks.length + 1).replace(/\\/g, "/")
              : file,
            existsSync(file) ? "present" : "missing",
          ]),
      ).entries(),
    ],
  ),
  runs,
  costs: {
    runSpend: Number(runSpend.toFixed(6)),
    evidenceSpend: Number(evidenceSpend.toFixed(6)),
    tuningSpend,
    probeSpend: Number(probeSpend.toFixed(6)),
    totalRecorded: Number((runSpend + probeSpend).toFixed(6)),
    councilOneRound: Number(councilOneRound.toFixed(6)),
    visualReviewUncosted: true,
  },
  risk: {
    rows: seats.risk.rows,
    tasks: seats.risk.tasks,
    models: seats.risk.models,
    chosen: seats.risk.chosen,
    runnerUp: seats.risk.runnerUp,
    diff: seats.risk.diff,
  },
  chair: {
    rows: seats.chair.rows,
    tasks: seats.chair.tasks,
    models: seats.chair.models,
    chosen: seats.chair.chosen,
    runnerUp: seats.chair.runnerUp,
    diff: seats.chair.diff,
  },
  shape: {
    rows: seats.shape.rows,
    tasks: seats.shape.tasks,
    models: seats.shape.models,
    chosen: seats.shape.chosen,
    runnerUp: seats.shape.runnerUp,
    diff: seats.shape.diff,
  },
  experience: {
    rows: seats.experience.rows,
    tasks: seats.experience.tasks,
    models: seats.experience.models,
    chosen: seats.experience.chosen,
    runnerUp: seats.experience.runnerUp,
    diff: seats.experience.diff,
  },
  visual: {
    row: seats.visual.rows,
    rows: seats.visual.rows,
    tasks: seats.visual.tasks,
    models: seats.visual.models,
    chosen: seats.visual.chosen,
    caught: seats.visual.tasks.flatMap((task) =>
      Object.values(task.models).flatMap((cell) => cell.caught ?? []),
    ),
    missed: seats.visual.tasks.flatMap((task) =>
      Object.values(task.models).flatMap((cell) => cell.missed ?? []),
    ),
    fp: seats.visual.rows.reduce((sum, row) => sum + (row.fp ?? 0), 0),
    weighted: seats.visual.rows[0]
      ? `${round(seats.visual.rows[0].catch)}%`
      : null,
    keyCount: packs.visual.tasks.reduce((sum, task) => sum + (task.key.defects?.length ?? 0), 0),
    shotCount: packs.visual.tasks.reduce((sum, task) => sum + (task.shots?.length ?? 0), 0),
  },
};

writeFileSync(outFile, `${JSON.stringify(findings, null, 2)}\n`);
console.log(`wrote ${outFile}`);
console.log(`  runs: ${runs.length}`);
console.log(`  spend: $${findings.costs.totalRecorded}`);
console.log(`  evidence: $${findings.costs.evidenceSpend}; tuning: $${findings.costs.tuningSpend}`);
console.log(`  council round: $${findings.costs.councilOneRound}`);
console.log(`  project: ${findings.project}`);
if (Object.values(findings.sources).includes("missing")) {
  console.warn(
    `  missing sources: ${Object.entries(findings.sources)
      .filter(([, value]) => value === "missing")
      .map(([key]) => key)
      .join(", ")}`,
  );
}