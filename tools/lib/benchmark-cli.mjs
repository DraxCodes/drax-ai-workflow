import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MEASURED_MIN_TASKS,
  PROTOCOL,
  aggregateRecords,
  checkPriceBand,
  defaultReferenceModel,
  formatReport,
  loadPack,
  mergeRecords,
  readPrices,
  readRecords,
  runBenchmark,
  writeRecords,
} from "./benchmark.mjs";
import { readManifest } from "./manifest.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const baseRoot = resolve(here, "..", "..");
const benchmarksDir = join(baseRoot, "benchmarks");
const DEFAULT_PACK = join(benchmarksDir, "packs", "security-review");

function parseFlags(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      flags._.push(arg);
      continue;
    }
    const body = arg.slice(2);
    const eq = body.indexOf("=");
    const key = eq === -1 ? body : body.slice(0, eq);
    const camel = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (eq !== -1) {
      flags[camel] = body.slice(eq + 1);
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      flags[camel] = argv[i + 1];
      i += 1;
    } else {
      flags[camel] = true;
    }
  }
  return flags;
}

const list = (value) =>
  typeof value === "string"
    ? value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/** Raw model findings are local. Warn when the output directory is not ignored. */
function ignoreWarning(projectDir, outDir) {
  const rel = relative(projectDir, outDir);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  const top = rel.split(/[\\/]/)[0];
  const file = join(projectDir, ".gitignore");
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  const escaped = top.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`(^|\\n)\\s*/?${escaped}/?\\s*(\\n|$)`).test(text)) return null;
  return `warning: ${rel} is not ignored by ${file}; keep benchmark output out of git`;
}

function harnessLabel(projectDir, root) {
  const manifest = readManifest(projectDir);
  if (manifest?.version) return `drax-ai-workflow@${manifest.version}`;
  const versionFile = join(root, "VERSION");
  if (existsSync(versionFile)) {
    return `drax-ai-workflow@${readFileSync(versionFile, "utf8").trim()}`;
  }
  return "drax-ai-workflow@unknown";
}

function printEstimate(estimate, budgetUsd) {
  console.log(`  estimate: $${estimate.maxCostUsd ?? "n/a"} worst case (budget $${budgetUsd})`);
  for (const entry of estimate.models) {
    const price = entry.price
      ? `$${entry.price.input}/$${entry.price.output} per 1M`
      : "price missing";
    console.log(`    ${entry.model}: $${entry.maxCostUsd ?? "n/a"} — ${price}`);
  }
}

async function runCommand(flags) {
  const projectDir = resolve(flags.project ?? ".");
  const packDir = resolve(flags.pack ?? DEFAULT_PACK);
  const loaded = loadPack(packDir);
  if (loaded.errors.length > 0) {
    for (const error of loaded.errors) console.error(`  ✗ ${error}`);
    return 1;
  }
  const { pack } = loaded;
  const models = [...new Set(list(flags.models))];
  if (models.length === 0) {
    console.error("benchmark run: pass --models <selector[,selector]> (nothing runs by default)");
    return 2;
  }

  const { prices, error: priceError } = readPrices(
    projectDir,
    flags.prices ? resolve(flags.prices) : null,
  );
  if (priceError) {
    console.error(priceError);
    return 2;
  }

  const dryRun = Boolean(flags.dryRun);
  const budgetUsd = flags.budgetUsd === undefined ? null : Number(flags.budgetUsd);
  if (!dryRun && (!Number.isFinite(budgetUsd) || budgetUsd <= 0)) {
    console.error("benchmark run: pass --budget-usd <usd> (a hard cap; there is no default spend)");
    return 2;
  }

  const band = flags.priceBand === undefined ? 2 : Number(flags.priceBand);
  if (!Number.isFinite(band) || band < 0) {
    console.error("benchmark run: --price-band must be a non-negative number");
    return 2;
  }
  const referenceModel =
    flags.referenceModel ?? defaultReferenceModel(projectDir, pack.slot) ?? null;
  if (band > 0 && referenceModel) {
    const checked = checkPriceBand({ models, prices, referenceModel, band });
    if (checked.errors.length > 0) {
      if (!dryRun) {
        for (const error of checked.errors) console.error(`  ✗ ${error}`);
        return 2;
      }
      console.log(`  price band not checked: ${checked.errors.join("; ")}`);
    }
  } else if (band > 0) {
    if (!dryRun) {
      console.error(
        "benchmark run: pass --reference-model or bind the slot; a price band needs a reference",
      );
      return 2;
    }
    console.log("  price band not checked: no reference model");
  }

  const outDir = resolve(
    flags.out ?? join(projectDir, ".scratch", "benchmarks", timestamp()),
  );
  const ignore = ignoreWarning(projectDir, outDir);
  if (ignore) console.log(`  ${ignore}`);
  const effectiveBudget = dryRun ? Number.MAX_SAFE_INTEGER : budgetUsd;
  console.log(`benchmark: ${pack.id}@${pack.version} (${pack.protocol}) — slot ${pack.slot}`);
  console.log(`  pack: ${packDir}`);
  console.log(`  models: ${models.join(", ")}`);
  if (referenceModel) console.log(`  reference: ${referenceModel} (band ${band}×)`);
  console.log(`  budget: ${dryRun ? "dry run (no calls)" : `$${budgetUsd}`}`);

  let result;
  try {
    result = await runBenchmark({
      projectDir,
      packDir,
      models,
      outDir,
      prices,
      budgetUsd: effectiveBudget,
      samples: Number(flags.samples ?? 1),
      maxTokens: Number(flags.maxTokens ?? 1200),
      timeoutMs: Number(flags.timeout ?? 60000),
      retries: Number(flags.retries ?? 0),
      harness: harnessLabel(projectDir, baseRoot),
      dryRun,
    });
  } catch (error) {
    console.error(`benchmark run failed: ${error.message}`);
    return 1;
  }
  if (!result.ok) {
    if (result.estimate) printEstimate(result.estimate, budgetUsd ?? "none");
    console.error(`refused (${result.code}): ${result.message}`);
    return 1;
  }
  if (result.dryRun) {
    printEstimate(result.estimate, budgetUsd ?? "none");
    console.log("  dry run: no provider call");
    return 0;
  }
  printEstimate(result.estimate, budgetUsd);
  console.log(`  records: ${result.records.length} (${result.summary.failed} failed)`);
  console.log(`  spent: $${result.spentUsd}`);
  console.log(`  wrote: ${result.recordsFile}`);
  if (result.stopped) {
    console.log(`  stopped (${result.stopped.code}): $${result.stopped.spentUsd} spent`);
  }
  const rows = aggregateRecords({ records: result.records, slot: pack.slot });
  for (const row of rows) {
    const precision = row.precision === null ? "n/a" : `${Math.round(row.precision * 100)}%`;
    console.log(
      `  ${row.model}: catch ${Math.round(row.catch * 100)}%, precision ${precision}, FP ${row.falsePositives}, $${(row.costUsd ?? 0).toFixed(4)}`,
    );
  }
  return result.summary.failed > 0 || result.stopped ? 1 : 0;
}

function reportCommand(flags) {
  const projectDir = resolve(flags.project ?? ".");
  const recordsFile = resolve(flags.records ?? join(benchmarksDir, "records.json"));
  const { records, error, missing } = readRecords(recordsFile);
  if (error) {
    console.error(error);
    return 1;
  }
  if (missing) {
    console.log(`no records at ${recordsFile}`);
    return 0;
  }
  const protocol = flags.protocol ?? PROTOCOL;
  const slot = flags.slot ?? null;
  const filtered = records.filter(
    (record) => record.protocol === protocol && (!slot || record.slot === slot),
  );
  const referenceModel =
    flags.referenceModel ?? (slot ? defaultReferenceModel(projectDir, slot) : null) ?? null;
  const staleDays = Number(flags.staleDays ?? 180);
  if (!Number.isFinite(staleDays) || staleDays < 0) {
    console.error("benchmark report: --stale-days must be a non-negative number");
    return 2;
  }
  const groups = new Map();
  for (const record of filtered) {
    const key = [
      record.protocol,
      record.pack,
      record.packVersion,
      record.packHash ?? "",
      record.maxTokens ?? "",
      record.retries ?? "",
      record.temperature ?? 0,
      record.slot,
    ].join("\u0000");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  const groupRows = [...groups.values()].map((groupRecords) =>
    aggregateRecords({
      records: groupRecords,
      slot,
      referenceModel,
      now: new Date(),
      staleDays,
    }),
  );
  const rows = groupRows.flat();
  if (flags.json) {
    console.log(JSON.stringify({ protocol, slot, referenceModel, rows }, null, 2));
    return 0;
  }
  if (rows.length === 0) {
    console.log(
      `No ${protocol} records${slot ? ` for ${slot}` : ""} yet; the recommendation falls back to asserted and derived evidence.`,
    );
    return 0;
  }
  let printed = 0;
  for (const table of groupRows) {
    if (table.length === 0) continue;
    if (printed > 0) console.log("");
    console.log(formatReport(table, { slot, protocol }));
    printed += 1;
  }
  if (referenceModel) {
    console.log(`  unique/agreement measured against ${referenceModel}`);
  }
  return 0;
}

function validateCommand(flags) {
  const packDir = resolve(flags.pack ?? DEFAULT_PACK);
  const loaded = loadPack(packDir);
  if (loaded.errors.length > 0) {
    for (const error of loaded.errors) console.error(`  ✗ ${error}`);
    return 1;
  }
  const { pack, tasks, packHash } = loaded;
  const defects = tasks.reduce((sum, task) => sum + task.key.defects.length, 0);
  console.log(`pack ${pack.id}@${pack.version} (${pack.protocol}) — slot ${pack.slot}`);
  console.log(`  hash: ${packHash}`);
  console.log(`  tasks: ${tasks.length} (minTasks ${pack.minTasks}), defects: ${defects}`);
  for (const task of tasks) {
    console.log(
      `    ${task.id}: ${task.files.length} file(s), ${task.key.defects.length} defect(s)`,
    );
  }
  if (tasks.length < pack.minTasks) {
    console.error(
      `  error: ${tasks.length} tasks is below the declared minTasks ${pack.minTasks}; this pack cannot produce the evidence it promises`,
    );
    return 1;
  }
  if (tasks.length < MEASURED_MIN_TASKS) {
    console.log(
      `  pilot only: ${tasks.length} tasks is below the ${MEASURED_MIN_TASKS}-task measured floor`,
    );
  }
  return 0;
}

function basePackDirs(baseDir) {
  const root = join(baseDir, "benchmarks", "packs");
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(root, entry.name));
}

/** A promoted record must name a pack and hash the target base actually ships. */
function verifyPromotedRecords(records, baseDir) {
  const packs = basePackDirs(baseDir)
    .map((dir) => loadPack(dir))
    .filter((loaded) => loaded.errors.length === 0);
  const version = readFileSync(join(baseDir, "VERSION"), "utf8").trim();
  const expectedHarness = `drax-ai-workflow@${version}`;
  const seen = new Set();
  for (const record of records) {
    const key = [
      record.pack,
      record.packVersion,
      record.packHash,
      record.protocol,
      record.slot,
    ].join("\u0000");
    if (seen.has(key)) continue;
    seen.add(key);
    const candidates = packs.filter(
      (loaded) => loaded.pack.id === record.pack && loaded.pack.version === record.packVersion,
    );
    if (candidates.length === 0) {
      return `no base pack ${record.pack}@${record.packVersion}`;
    }
    const match = candidates.find((loaded) => loaded.packHash === record.packHash);
    if (!match) {
      return `pack hash mismatch for ${record.pack}@${record.packVersion}: ${record.packHash} is not a shipped pack`;
    }
    if (match.pack.slot !== record.slot) {
      return `slot mismatch for ${record.pack}@${record.packVersion}: ${record.slot} is not ${match.pack.slot}`;
    }
    if (match.pack.protocol !== record.protocol) {
      return `protocol mismatch for ${record.pack}@${record.packVersion}: ${record.protocol} is not ${match.pack.protocol}`;
    }
    if (record.harness !== expectedHarness) {
      return `harness mismatch: ${record.harness} is not ${expectedHarness}`;
    }
  }
  return null;
}

function promoteCommand(flags) {
  const projectDir = resolve(flags.project ?? ".");
  if (
    !existsSync(join(projectDir, "VERSION")) ||
    !existsSync(join(projectDir, "AGENTS.base.md"))
  ) {
    console.error(
      "benchmark promote runs only in a base checkout (VERSION + AGENTS.base.md); projects do not write base evidence",
    );
    return 1;
  }
  const runDir = flags._[0] ? resolve(flags._[0]) : null;
  if (!runDir) {
    console.error("usage: benchmark promote <run-dir> [--records <file>]");
    return 2;
  }
  const fragment = readRecords(join(runDir, "records.json"));
  if (fragment.error) {
    console.error(fragment.error);
    return 1;
  }
  if (fragment.records.length === 0) {
    console.error(`no records in ${join(runDir, "records.json")}`);
    return 1;
  }
  const provenance = verifyPromotedRecords(fragment.records, projectDir);
  if (provenance) {
    console.error(provenance);
    return 1;
  }
  const target = resolve(flags.records ?? join(projectDir, "benchmarks", "records.json"));
  const existing = readRecords(target);
  if (existing.error) {
    console.error(existing.error);
    return 1;
  }
  const merged = mergeRecords(existing.records, fragment.records);
  writeRecords(target, merged, fragment.records[0].protocol ?? PROTOCOL);
  console.log(
    `promoted ${fragment.records.length} record(s) into ${target}; ${merged.length} total`,
  );
  return 0;
}

const USAGE = `usage: benchmark <command> [options]

  run       run a pack against explicit models (paid; needs --budget-usd)
      --pack <dir>              pack directory (default benchmarks/packs/security-review)
      --models <a,b>            required; provider/model selectors
      --budget-usd <n>          required for a real run; hard cap
      --reference-model <s>     price-band reference (default: the slot's binding)
      --price-band <n>          maximum input/output price ratio (default 2; 0 disables)
      --prices <file>           { "provider/model": { "input", "output" } } per 1M
      --samples <n>             v1 supports 1; repeat the run instead
      --max-tokens <n>          output budget (default 1200)
      --retries <n>             extra attempts per task (default 0)
      --timeout <ms>            per-call timeout (default 60000)
      --out <dir>               record fragment directory (default .scratch/benchmarks/<date>)
      --dry-run                 resolve, price and estimate; no provider call

  report    read records and rank models for a slot (free)
      --records <file>          default benchmarks/records.json
      --slot <id>               for example council.risk
      --protocol <name>         default ${PROTOCOL}
      --reference-model <s>     unique/agreement baseline (default: the slot's binding)
      --stale-days <n>          default 180
      --json

  validate  check a pack, its files and its keys (free)
      --pack <dir>              default benchmarks/packs/security-review

  promote   merge a run fragment into the base records (base checkout only)
      <run-dir>                 directory containing records.json
      --records <file>          default benchmarks/records.json`;

export function runBenchmarkCommand(argv = []) {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);
  if (flags.help || command === "help" || command === "--help" || command === undefined) {
    console.log(USAGE);
    return command === undefined && !flags.help ? 2 : 0;
  }
  switch (command) {
    case "run":
      return runCommand(flags);
    case "report":
      return reportCommand(flags);
    case "validate":
      return validateCommand(flags);
    case "promote":
      return promoteCommand(flags);
    default:
      console.error(`unknown benchmark command: ${command}\n`);
      console.log(USAGE);
      return 2;
  }
}