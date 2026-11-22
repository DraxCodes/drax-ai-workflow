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

function summaryRow(row) {
  return {
    model: row.model,
    tier: row.tier,
    confidence: row.confidence,
    scored: row.scored,
    failed: row.failed,
    catch: Math.round(row.catch * 100),
    precision: row.precision === null ? null : Math.round(row.precision * 100),
    fp: row.falsePositives,
    cost: row.costUsd,
    costPerTask:
      row.costUsd === null ? null : Number((row.costUsd / Math.max(1, row.scored)).toFixed(6)),
    unique: row.uniqueCatch,
    maxTokens: row.maxTokens,
  };
}

function aggregate(file, slot, referenceModel = null) {
  const { records, error } = readRecords(file);
  if (error) return { error, rows: [], records: [] };
  return {
    rows: aggregateRecords({ records, slot, referenceModel }).map(summaryRow),
    records,
  };
}

const sources = {
  risk: join(benchmarks, "2026-11-21-risk-16k-head-to-head.json"),
  risk4k: join(benchmarks, "2026-11-21-risk-4k", "records.json"),
  chair: join(benchmarks, "2026-11-21-chair-10-16k", "records.json"),
  chair10: join(benchmarks, "2026-11-21-chair-10", "records.json"),
  shape: join(benchmarks, "2026-11-21-shape-10-16k", "records.json"),
  shape10: join(benchmarks, "2026-11-21-shape-10", "records.json"),
  experience: join(benchmarks, "2026-11-21-experience-10", "records.json"),
  visual: join(benchmarks, "2026-11-21-visual-pack-final", "records.json"),
};

const risk = aggregate(sources.risk, "council.risk", "surplus/glm-5.3");
const risk4k = aggregate(sources.risk4k, "council.risk", "surplus/glm-5.3");
const chair = aggregate(sources.chair, "council.chair", "surplus/deepseek-v4.1-flash-1017");
const chair10 = aggregate(sources.chair10, "council.chair", "surplus/deepseek-v4.1-flash-1017");
const shape = aggregate(sources.shape, "council.shape", "surplus/deepseek-v4.1-flash-1017");
const shape10 = aggregate(sources.shape10, "council.shape", "surplus/deepseek-v4.1-flash-1017");
const experience = aggregate(sources.experience, "council.experience", "surplus/deepseek-v4.1-flash-1017");
const visual = aggregate(sources.visual, "hillclimb.blindspot", "surplus/glm-5.3-flash");

function rowRank(row) {
  return [
    row.tier === "measured" ? 0 : row.tier === "pilot" ? 1 : 2,
    -(row.scored ?? 0),
    -(row.maxTokens ?? 0),
  ];
}

function betterRow(candidate, current) {
  const a = rowRank(candidate);
  const b = rowRank(current);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index];
  }
  return (candidate.catch ?? 0) > (current.catch ?? 0);
}

function mergeRows(primary, secondary) {
  const byModel = new Map(primary.map((row) => [row.model, row]));
  for (const row of secondary) {
    const current = byModel.get(row.model);
    if (!current || betterRow(row, current)) byModel.set(row.model, row);
  }
  return [...byModel.values()];
}

const candidateRows = {
  risk: mergeRows(risk.rows, risk4k.rows),
  chair: mergeRows(chair.rows, chair10.rows),
  shape: mergeRows(shape.rows, shape10.rows),
  experience: mergeRows(experience.rows, experience.rows),
  blindspot: visual.rows,
};

function recordsByModel(records, model) {
  return new Map(records.filter((r) => r.model === model).map((r) => [r.task, r]));
}

const riskByG = recordsByModel(risk.records, "surplus/glm-5.3");
const riskByQ = recordsByModel(risk.records, "surplus/qwen3.8-flash");
const riskTasks = packs.security.tasks.map((task) => {
  const g = riskByG.get(task.id);
  const q = riskByQ.get(task.id);
  const key = new Map(task.key.defects.map((d) => [d.id, d]));
  return {
    task: task.id,
    key: task.key.defects.length,
    glmCaught: g?.caught.length ?? 0,
    glmFp: g?.falsePositives ?? null,
    qwenCaught: q?.caught.length ?? 0,
    qwenFp: q?.falsePositives ?? null,
    qwenMissed: (q?.missed ?? []).map((id) => {
      const d = key.get(id);
      return d ? `${id} ${d.severity}: ${d.summary}` : id;
    }),
    glmMissed: (g?.missed ?? []).map((id) => {
      const d = key.get(id);
      return d ? `${id} ${d.severity}: ${d.summary}` : id;
    }),
  };
});

function councilTasks(pack, records, models) {
  const by = Object.fromEntries(models.map((m) => [m, recordsByModel(records, m)]));
  return pack.tasks.map((task) => {
    const criteria = new Map(task.key.criteria.map((c) => [c.id, c]));
    const row = { task: task.id, total: task.key.criteria.length, models: {} };
    for (const model of models) {
      const record = by[model].get(task.id);
      row.models[model] = {
        ok: record?.ok ?? false,
        caught: record?.caught.length ?? 0,
        fp: record?.falsePositives ?? null,
        missed: (record?.missed ?? []).map((id) => {
          const criterion = criteria.get(id);
          return criterion ? `${id}: ${criterion.description}` : id;
        }),
      };
    }
    return row;
  });
}

const chairModels = ["surplus/deepseek-v4.1-flash-1017", "surplus/qwen3.8-flash"];
const shapeModels = ["surplus/deepseek-v4.1-flash-1017", "surplus/qwen3.8-flash"];
const experienceModels = ["surplus/deepseek-v4.1-flash-1017", "surplus/glm-5.3-flash"];

const visualRecord = visual.records[0] ?? null;
const visualDefects = new Map(
  packs.visual.tasks[0].key.defects.map((defect) => [defect.id, defect]),
);

const runDirs = existsSync(benchmarks)
  ? readdirSync(benchmarks, { withFileTypes: true })
  : [];
const runs = [];
for (const entry of runDirs) {
  if (!entry.isDirectory()) continue;
  const dir = join(benchmarks, entry.name);
  const meta = readJson(join(dir, "run.json"));
  if (!meta) continue;
  runs.push({
    dir: entry.name,
    pack: meta.plan?.pack ?? "unknown",
    maxTokens: meta.plan?.maxTokens ?? null,
    records: meta.records ?? 0,
    failed: meta.failed ?? 0,
    spent: meta.spentUsd ?? 0,
    startedAt: meta.startedAt ?? null,
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
const findings = {
  generatedAt: new Date().toISOString().slice(0, 10),
  project: project.split(/[\\/]/).pop(),
  sources: Object.fromEntries(
    Object.entries(sources).map(([key, file]) => [key, existsSync(file) ? "present" : "missing"]),
  ),
  runs,
  costs: {
    runSpend: Number(runSpend.toFixed(6)),
    probeSpend: Number(probeSpend.toFixed(6)),
    totalRecorded: Number((runSpend + probeSpend).toFixed(6)),
    visualReviewUncosted: true,
  },
  risk: {
    rows: candidateRows.risk,
    risk4k: risk4k.rows,
    tasks: riskTasks,
  },
  chair: {
    rows: candidateRows.chair,
    tasks: councilTasks(packs.chair, chair.records, chairModels),
    models: chairModels,
  },
  shape: {
    rows: candidateRows.shape,
    tasks: councilTasks(packs.shape, shape.records, shapeModels),
    models: shapeModels,
  },
  experience: {
    rows: candidateRows.experience,
    tasks: councilTasks(packs.experience, experience.records, experienceModels),
    models: experienceModels,
  },
  visual: {
    row: candidateRows.blindspot,
    caught: visualRecord?.caught ?? [],
    missed: (visualRecord?.missed ?? []).map((id) => visualDefects.get(id)).filter(Boolean),
    fp: visualRecord?.falsePositives ?? null,
    weighted: visualRecord
      ? `${visualRecord.weightedCaught}/${visualRecord.weightedTotal}`
      : null,
    keyCount: packs.visual.tasks[0].key.defects.length,
    shotCount: packs.visual.tasks[0].shots.length,
  },
};

writeFileSync(outFile, `${JSON.stringify(findings, null, 2)}\n`);
console.log(`wrote ${outFile}`);
console.log(`  runs: ${runs.length}`);
console.log(`  spend: $${findings.costs.totalRecorded}`);
console.log(`  project: ${findings.project}`);
if (Object.values(findings.sources).includes("missing")) {
  console.warn(`  missing sources: ${Object.entries(findings.sources).filter(([, v]) => v === "missing").map(([k]) => k).join(", ")}`);
}