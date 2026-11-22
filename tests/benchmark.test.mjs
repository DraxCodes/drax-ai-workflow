import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { repoRoot, tempDir } from "./helpers.mjs";
import {
  aggregateRecords,
  buildPrompt,
  checkPriceBand,
  costOf,
  defaultReferenceModel,
  estimateRun,
  formatReport,
  loadPack,
  mergeRecords,
  readPrices,
  readRecords,
  runBenchmark,
  scoreTask,
  validateFindings,
  writeRecords,
} from "../tools/lib/benchmark.mjs";

function makePack({ minTasks = 2, tasks = 2 } = {}) {
  const dir = tempDir("wb-bench-pack-");
  const entries = [];
  for (let index = 1; index <= tasks; index += 1) {
    const id = `t${index}`;
    const file = `${id}.js`;
    mkdirSync(join(dir, "tasks", id, "files"), { recursive: true });
    writeFileSync(join(dir, "tasks", id, "brief.md"), `# Task ${index}\n\nA small service.\n`);
    writeFileSync(
      join(dir, "tasks", id, "files", file),
      "function handler(input) {\n  eval(input);\n}\n",
    );
    writeFileSync(
      join(dir, "tasks", id, "key.json"),
      `${JSON.stringify(
        {
          defects: [
            {
              id: "K1",
              file,
              line: 2,
              lineEnd: 2,
              kind: "injection",
              severity: "blocker",
              summary: "the handler evaluates input",
            },
          ],
        },
        null,
        2,
      )}\n`,
    );
    entries.push({
      id,
      brief: `tasks/${id}/brief.md`,
      files: [`tasks/${id}/files/${file}`],
      keyFile: `tasks/${id}/key.json`,
    });
  }
  writeFileSync(
    join(dir, "pack.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        id: "test-pack",
        version: 1,
        protocol: "security-review-v1",
        slot: "council.risk",
        minTasks,
        lineWindow: 2,
        exhaustive: true,
        tasks: entries,
      },
      null,
      2,
    )}\n`,
  );
  return dir;
}

function makeProject() {
  const dir = tempDir("wb-bench-project-");
  writeFileSync(
    join(dir, "opencode.json"),
    `${JSON.stringify(
      {
        provider: {
          test: {
            settings: { baseURL: "https://bench.test/v1", apiKey: "{env:BENCH_KEY}" },
            models: {
              "model-a": { cost: { input: 1, output: 2 } },
              "model-b": { cost: { input: 1, output: 2 } },
              expensive: { cost: { input: 100, output: 100 } },
            },
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  return dir;
}

const reply = (content, usage = { prompt_tokens: 100, completion_tokens: 20 }) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ choices: [{ message: { content } }], usage }),
});

const finding = (file, line, overrides = {}) => ({
  file,
  line,
  kind: "injection",
  severity: "blocker",
  confidence: "high",
  evidence: "eval(input)",
  ...overrides,
});

const env = { BENCH_KEY: "test-key" };

const validRecord = (overrides = {}) => ({
  schemaVersion: 1,
  protocol: "security-review-v1",
  pack: "test-pack",
  packVersion: 1,
  packHash: "sha256:test",
  slot: "council.risk",
  model: "test/model-a",
  task: "t1",
  sample: 1,
  samples: 1,
  minTasks: 10,
  exhaustive: true,
  date: "2026-11-21",
  harness: "drax-ai-workflow@test",
  ok: true,
  keyDefects: 1,
  findings: 1,
  caught: ["K1"],
  missed: [],
  falsePositives: 0,
  severityMismatches: 0,
  kindMismatches: 0,
  weightedCaught: 8,
  weightedTotal: 8,
  tokensIn: 100,
  tokensOut: 20,
  costUsd: 0.001,
  latencyMs: 100,
  temperature: 0,
  maxTokens: 1200,
  retries: 0,
  attempts: 1,
  ...overrides,
});

test("the shipped security pack loads, has ten tasks and a complete key", () => {
  const loaded = loadPack(join(repoRoot, "benchmarks", "packs", "security-review"));
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.pack.id, "security-review");
  assert.equal(loaded.pack.minTasks, 10);
  assert.equal(loaded.tasks.length, 10);
  const defects = loaded.tasks.reduce((sum, task) => sum + task.key.defects.length, 0);
  assert.equal(defects, 23);
  for (const task of loaded.tasks) {
    assert.ok(task.files.length > 0, `${task.id} has files`);
    assert.ok(task.key.defects.length > 0, `${task.id} has a key`);
    for (const defect of task.key.defects) {
      const file = task.files.find((candidate) => candidate.name === defect.file);
      assert.ok(file, `${task.id}/${defect.id} names a file`);
      assert.ok(defect.line <= file.lines, `${task.id}/${defect.id} line is in range`);
    }
  }
});

test("the prompt carries the brief and the code, never the key", () => {
  const loaded = loadPack(join(repoRoot, "benchmarks", "packs", "security-review"));
  const task = loaded.tasks[0];
  const prompt = buildPrompt({ brief: task.brief, files: task.files });
  assert.match(prompt, /### server\.js/);
  assert.match(prompt, /Inventory search/);
  assert.match(prompt, /1: import express/);
  assert.match(prompt, /Do not speculate about code outside the slice/);
  assert.doesNotMatch(prompt, /K1/);
  assert.doesNotMatch(prompt, /the search term is interpolated/);
});

test("strict findings validation rejects invented files, lines and fields", () => {
  const loaded = loadPack(join(repoRoot, "benchmarks", "packs", "security-review"));
  const task = loaded.tasks[0];
  const ok = validateFindings({ findings: [finding("server.js", 14)] }, task);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.findings.length, 1);

  const badFile = validateFindings({ findings: [finding("invented.js", 14)] }, task);
  assert.match(badFile.errors.join("\n"), /is not one of the task files/);

  const badLine = validateFindings({ findings: [finding("server.js", 999)] }, task);
  assert.match(badLine.errors.join("\n"), /past the end/);

  const extra = validateFindings(
    { findings: [{ ...finding("server.js", 14), id: "K1" }] },
    task,
  );
  assert.match(extra.errors.join("\n"), /unexpected key/);

  const badSeverity = validateFindings(
    { findings: [finding("server.js", 14, { severity: "high" })] },
    task,
  );
  assert.match(badSeverity.errors.join("\n"), /severity: expected one of/);

  const scored = validateFindings({ findings: [finding("server.js", 14)], score: 9 }, task);
  assert.match(scored.errors.join("\n"), /response\.score: unexpected key/);
});

test("scoring pairs one-to-one and counts misses, false positives and severity gaps", () => {
  const loaded = loadPack(join(repoRoot, "benchmarks", "packs", "security-review"));
  const task = loaded.tasks[0];
  const findings = [
    finding("server.js", 15),
    finding("server.js", 21, { severity: "nit" }),
    finding("server.js", 40, { kind: "xss" }),
  ];
  const score = scoreTask({ task, findings, lineWindow: 5 });
  assert.deepEqual(score.caught.sort(), ["K1", "K2"]);
  assert.deepEqual(score.missed, []);
  assert.equal(score.falsePositives, 1);
  assert.equal(score.severityMismatches, 1);
  assert.equal(score.weightedCaught, 12);
  assert.equal(score.weightedTotal, 12);

  const miss = scoreTask({
    task,
    findings: [finding("server.js", 14)],
    lineWindow: 5,
  });
  assert.deepEqual(miss.caught, ["K1"]);
  assert.deepEqual(miss.missed, ["K2"]);

  const otherKind = scoreTask({
    task,
    findings: [finding("server.js", 14, { kind: "other" })],
    lineWindow: 5,
  });
  assert.deepEqual(otherKind.caught, ["K1"]);
  assert.equal(otherKind.kindMismatches, 1);
});

test("global pairing gives an exact later match the finding, not the earlier loose one", () => {
  const loaded = loadPack(join(repoRoot, "benchmarks", "packs", "security-review"));
  const byId = Object.fromEntries(loaded.tasks.map((task) => [task.id, task]));

  const sql = scoreTask({
    task: byId["01-sql-injection"],
    findings: [finding("server.js", 20)],
    lineWindow: 5,
  });
  assert.deepEqual(sql.caught, ["K2"]);
  assert.deepEqual(sql.missed, ["K1"]);
  assert.equal(sql.weightedCaught, 4);

  const deserialization = scoreTask({
    task: byId["07-deserialization"],
    findings: [finding("app.py", 14, { kind: "deserialization" })],
    lineWindow: 5,
  });
  assert.deepEqual(deserialization.caught, ["K2"]);

  const config = scoreTask({
    task: byId["10-config-exposure"],
    findings: [finding("server.js", 18, { kind: "secrets" })],
    lineWindow: 5,
  });
  assert.deepEqual(config.caught, ["K3"]);

  const inspect = scoreTask({
    task: byId["06-command-injection"],
    findings: [finding("app.py", 23, { kind: "path" })],
    lineWindow: 5,
  });
  assert.deepEqual(inspect.caught, ["K3"]);
});

test("every keyed defect is reachable by a golden finding on its own line", () => {
  const loaded = loadPack(join(repoRoot, "benchmarks", "packs", "security-review"));
  for (const task of loaded.tasks) {
    const findings = task.key.defects.map((defect) => ({
      file: defect.file,
      line: defect.line,
      kind: defect.kind,
      severity: defect.severity,
      confidence: "high",
      evidence: "golden",
    }));
    const score = scoreTask({ task, findings, lineWindow: loaded.pack.lineWindow });
    assert.deepEqual(
      [...score.caught].sort(),
      task.key.defects.map((defect) => defect.id).sort(),
      task.id,
    );
    assert.deepEqual(score.missed, [], task.id);
    assert.equal(score.falsePositives, 0, task.id);
  }
});

test("a clean safe slice scores precision 1 and a false positive lowers it", () => {
  const safe = (task, falsePositives) => ({
    ...validRecord({ task }),
    keyDefects: 0,
    findings: falsePositives,
    caught: [],
    missed: [],
    falsePositives,
    weightedCaught: 0,
    weightedTotal: 0,
  });
  const clean = aggregateRecords({
    records: Array.from({ length: 10 }, (_, index) => safe(`s${index}`, 0)),
    now: new Date("2026-11-21T00:00:00Z"),
  });
  assert.equal(clean[0].precision, 1);

  const dirty = aggregateRecords({
    records: Array.from({ length: 10 }, (_, index) => safe(`s${index}`, index === 0 ? 1 : 0)),
    now: new Date("2026-11-21T00:00:00Z"),
  });
  assert.equal(dirty[0].precision, 0.9);
});

test("loadPack refuses paths outside the pack and non-string file entries", () => {
  const pack = makePack();
  const packFile = join(pack, "pack.json");
  const manifest = JSON.parse(readFileSync(packFile, "utf8"));
  const outside = join(dirname(pack), `outside-${Date.now()}.js`);
  writeFileSync(outside, "outside\n");
  manifest.tasks[0].files = [`../${basename(outside)}`];
  writeFileSync(packFile, `${JSON.stringify(manifest, null, 2)}\n`);
  const traversal = loadPack(pack);
  assert.match(traversal.errors.join("\n"), /outside the pack/);

  manifest.tasks[0].files = [123];
  writeFileSync(packFile, `${JSON.stringify(manifest, null, 2)}\n`);
  const badType = loadPack(pack);
  assert.match(badType.errors.join("\n"), /non-empty string/);
});

test("readRecords rejects a record without provenance and merge respects the pack hash", () => {
  const file = join(tempDir("wb-bench-records-"), "records.json");
  writeFileSync(
    file,
    `${JSON.stringify({ records: [validRecord({ date: undefined })] }, null, 2)}\n`,
  );
  assert.match(readRecords(file).error, /date/);

  writeFileSync(
    file,
    `${JSON.stringify({ records: [validRecord({ date: "9999-12-31" })] }, null, 2)}\n`,
  );
  assert.match(readRecords(file).error, /future/);

  const older = validRecord({ date: "2026-01-01", caught: ["K1"] });
  const newer = validRecord({ date: "2026-11-21", caught: ["K2"], packHash: "sha256:other" });
  assert.equal(mergeRecords([older], [newer]).length, 2);
  const merged = mergeRecords([older], [{ ...newer, packHash: older.packHash }]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].caught, ["K2"]);

  writeRecords(file, merged);
  const reread = readRecords(file);
  assert.equal(reread.error, null);
  assert.equal(reread.records.length, 1);
});

test("the default reference accepts an object binding and drops its variant", () => {
  const project = tempDir("wb-bench-ref-");
  mkdirSync(join(project, ".opencode", "tools"), { recursive: true });
  writeFileSync(
    join(project, ".opencode", "tools", "requirements.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        slots: [
          {
            id: "council.risk",
            bind: { kind: "agent", agent: "security-auditor" },
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(project, "opencode.json"),
    `${JSON.stringify(
      {
        agents: {
          "security-auditor": {
            model: { providerID: "test", model: "model-a", variant: "medium" },
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  assert.equal(defaultReferenceModel(project, "council.risk"), "test/model-a");
});

test("prices come from opencode.json and the band refuses expensive candidates", () => {
  const project = makeProject();
  const { prices, error } = readPrices(project);
  assert.equal(error, null);
  assert.deepEqual(prices["test/model-a"], { input: 1, output: 2 });

  const priced = checkPriceBand({
    models: ["test/model-a", "test/model-b"],
    prices,
    referenceModel: "test/model-a",
    band: 2,
  });
  assert.deepEqual(priced.errors, []);

  const refused = checkPriceBand({
    models: ["test/expensive"],
    prices,
    referenceModel: "test/model-a",
    band: 2,
  });
  assert.match(refused.errors.join("\n"), /exceeds the 2× band/);

  const missing = checkPriceBand({
    models: ["test/unknown"],
    prices,
    referenceModel: "test/model-a",
    band: 2,
  });
  assert.match(missing.errors.join("\n"), /no declared price/);

  assert.equal(costOf({ prompt_tokens: 100, completion_tokens: 20 }, { input: 1, output: 2 }), 0.00014);
  assert.equal(costOf(null, { input: 1, output: 2 }), null);
  assert.equal(costOf({}, { input: 1, output: 2 }), null);
  assert.equal(costOf({ prompt_tokens: "x" }, { input: 1, output: 2 }), null);
});

test("a paid run refuses without a price or a budget before calling the provider", async () => {
  const pack = makePack();
  const project = makeProject();
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return reply(JSON.stringify({ findings: [] }));
  };

  const noPrice = await runBenchmark({
    projectDir: project,
    packDir: pack,
    models: ["test/unknown"],
    outDir: join(project, "out"),
    prices: {},
    budgetUsd: 1,
    env,
    fetchImpl,
  });
  assert.equal(noPrice.ok, false);
  assert.equal(noPrice.code, "price");
  assert.equal(calls, 0);

  const noBudget = await runBenchmark({
    projectDir: project,
    packDir: pack,
    models: ["test/model-a"],
    outDir: join(project, "out"),
    prices: { "test/model-a": { input: 1, output: 2 } },
    budgetUsd: 0,
    env,
    fetchImpl,
  });
  assert.equal(noBudget.ok, false);
  assert.equal(noBudget.code, "budget");
  assert.equal(calls, 0);

  const tooSmall = await runBenchmark({
    projectDir: project,
    packDir: pack,
    models: ["test/model-a"],
    outDir: join(project, "out"),
    prices: { "test/model-a": { input: 1, output: 2 } },
    budgetUsd: 0.0000001,
    env,
    fetchImpl,
  });
  assert.equal(tooSmall.ok, false);
  assert.equal(tooSmall.code, "budget");
  assert.ok(tooSmall.estimate.maxCostUsd > 0.0000001);
  assert.equal(calls, 0);
});

test("a dry run resolves and estimates without a provider call", async () => {
  const pack = makePack();
  const project = makeProject();
  let calls = 0;
  const result = await runBenchmark({
    projectDir: project,
    packDir: pack,
    models: ["test/model-a"],
    outDir: join(project, "out"),
    prices: { "test/model-a": { input: 1, output: 2 } },
    budgetUsd: 1,
    env,
    fetchImpl: async () => {
      calls += 1;
      return reply(JSON.stringify({ findings: [] }));
    },
    dryRun: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(calls, 0);
  assert.ok(result.estimate.maxCostUsd > 0);
});

test("a valid run writes records with tokens, cost, latency and raw findings", async () => {
  const pack = makePack();
  const project = makeProject();
  const out = join(project, "out");
  const seen = [];
  const result = await runBenchmark({
    projectDir: project,
    packDir: pack,
    models: ["test/model-a"],
    outDir: out,
    prices: { "test/model-a": { input: 1, output: 2 } },
    budgetUsd: 1,
    env,
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      const prompt = body.messages[0].content;
      seen.push(prompt);
      const file = /### (t\d+\.js)/.exec(prompt)[1];
      return reply(JSON.stringify({ findings: [finding(file, 2)] }));
    },
    harness: "drax-ai-workflow@test",
  });
  assert.equal(result.ok, true, result.message);
  assert.equal(result.records.length, 2);
  assert.equal(result.summary.failed, 0);
  for (const record of result.records) {
    assert.equal(record.ok, true);
    assert.equal(record.model, "test/model-a");
    assert.equal(record.slot, "council.risk");
    assert.equal(record.harness, "drax-ai-workflow@test");
    assert.equal(record.tokensIn, 100);
    assert.equal(record.tokensOut, 20);
    assert.equal(record.costUsd, 0.00014);
    assert.ok(record.latencyMs >= 0);
    assert.deepEqual(record.caught, ["K1"]);
    assert.equal(record.falsePositives, 0);
  }
  assert.equal(result.spentUsd, 0.00028);
  assert.ok(seen.every((prompt) => !prompt.includes("K1")));
  assert.ok(existsSync(result.recordsFile));
  assert.ok(existsSync(join(out, "run.json")));
  assert.ok(existsSync(join(out, "findings", "test_model-a", "t1.1.json")));

  const reread = readRecords(result.recordsFile);
  assert.equal(reread.error, null);
  assert.equal(reread.records.length, 2);
});

test("a malformed answer is a failed task; default retries are zero", async () => {
  const pack = makePack();
  const project = makeProject();
  let calls = 0;
  const result = await runBenchmark({
    projectDir: project,
    packDir: pack,
    models: ["test/model-a"],
    outDir: join(project, "out"),
    prices: { "test/model-a": { input: 1, output: 2 } },
    budgetUsd: 1,
    env,
    fetchImpl: async () => {
      calls += 1;
      return reply("I think it looks fine overall.");
    },
  });
  assert.equal(result.ok, true);
  assert.equal(calls, 2);
  assert.equal(result.records.length, 2);
  assert.equal(result.summary.failed, 2);
  assert.equal(result.records[0].ok, false);
  assert.equal(result.records[0].error, "invalid");
  assert.equal(result.records[0].tokensIn, 100);
  assert.equal(result.records[0].costUsd, 0.00014);
});

test("a fenced or prose answer is a failed task, not repaired", async () => {
  const pack = makePack();
  const project = makeProject();
  const result = await runBenchmark({
    projectDir: project,
    packDir: pack,
    models: ["test/model-a"],
    outDir: join(project, "out"),
    prices: { "test/model-a": { input: 1, output: 2 } },
    budgetUsd: 1,
    env,
    fetchImpl: async () =>
      reply("```json\n{\"findings\":[]}\n```"),
  });
  assert.equal(result.ok, true);
  assert.equal(result.summary.failed, 2);
  assert.equal(result.records[0].error, "invalid");
  assert.match(result.records[0].message, /single JSON object/);
});

test("the run stops before a task whose reservation would exceed the budget", async () => {
  const pack = makePack();
  const project = makeProject();
  const loaded = loadPack(pack);
  const prices = { "test/model-a": { input: 1, output: 0 } };
  const estimate = estimateRun({
    tasks: loaded.tasks,
    models: ["test/model-a"],
    prices,
    samples: 1,
    maxTokens: 1200,
    retries: 0,
  });
  const budget = estimate.maxCostUsd;
  let calls = 0;
  const result = await runBenchmark({
    projectDir: project,
    packDir: pack,
    models: ["test/model-a"],
    outDir: join(project, "out"),
    prices,
    budgetUsd: budget,
    env,
    fetchImpl: async (url, options) => {
      calls += 1;
      const body = JSON.parse(options.body);
      const file = /### (t\d+\.js)/.exec(body.messages[0].content)[1];
      return reply(JSON.stringify({ findings: [finding(file, 2)] }), {
        prompt_tokens: Math.ceil(budget * 0.6 * 1e6),
        completion_tokens: 0,
      });
    },
  });
  assert.equal(result.ok, true);
  assert.equal(calls, 1);
  assert.equal(result.records.length, 1);
  assert.equal(result.stopped.code, "budget");
  assert.ok(result.spentUsd <= budget + 1e-9, `${result.spentUsd} > ${budget}`);
  assert.equal(result.summary.unrun, 1);
});

test("a provider error body is not persisted in the record", async () => {
  const pack = makePack();
  const project = makeProject();
  const result = await runBenchmark({
    projectDir: project,
    packDir: pack,
    models: ["test/model-a"],
    outDir: join(project, "out"),
    prices: { "test/model-a": { input: 1, output: 2 } },
    budgetUsd: 1,
    env,
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      text: async () => "Incorrect API key provided: secret-body-marker",
    }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.summary.failed, 2);
  assert.equal(result.records[0].message, "HTTP 401");
  assert.doesNotMatch(JSON.stringify(result.records), /secret-body-marker/);
});

test("duplicate selectors are deduped and variants are refused", async () => {
  const pack = makePack();
  const project = makeProject();
  const variant = await runBenchmark({
    projectDir: project,
    packDir: pack,
    models: ["test/model-a#high"],
    outDir: join(project, "out"),
    prices: { "test/model-a": { input: 1, output: 2 } },
    budgetUsd: 1,
    env,
  });
  assert.equal(variant.ok, false);
  assert.match(variant.message, /variant selector/);

  let calls = 0;
  const deduped = await runBenchmark({
    projectDir: project,
    packDir: pack,
    models: ["test/model-a", "test/model-a"],
    outDir: join(project, "out"),
    prices: { "test/model-a": { input: 1, output: 2 } },
    budgetUsd: 1,
    env,
    fetchImpl: async (url, options) => {
      calls += 1;
      const file = /### (t\d+\.js)/.exec(JSON.parse(options.body).messages[0].content)[1];
      return reply(JSON.stringify({ findings: [finding(file, 2)] }));
    },
  });
  assert.equal(deduped.ok, true);
  assert.equal(calls, 2);
  assert.equal(deduped.records.length, 2);
});

test("repeated samples stay one task and raise confidence", () => {
  const records = Array.from({ length: 10 }, (_, index) => [
    validRecord({ task: `t${index + 1}`, samples: 2, sample: 1 }),
    validRecord({ task: `t${index + 1}`, samples: 2, sample: 2 }),
  ]).flat();
  const rows = aggregateRecords({
    records,
    now: new Date("2026-11-21T00:00:00Z"),
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].scored, 10);
  assert.equal(rows[0].samples, 2);
  assert.equal(rows[0].confidence, "high");
  assert.equal(rows[0].tier, "measured");
});

test("failed calls stay in the cost total", () => {
  const rows = aggregateRecords({
    records: [
      validRecord({ task: "t1", costUsd: 0.001 }),
      validRecord({ task: "t2", costUsd: 0.001 }),
      {
        ...validRecord({ task: "t3" }),
        ok: false,
        error: "http_5xx",
        caught: [],
        missed: ["K1"],
        costUsd: 0.25,
      },
    ],
    now: new Date("2026-11-21T00:00:00Z"),
  });
  assert.equal(rows[0].scored, 2);
  assert.equal(rows[0].failed, 1);
  assert.equal(rows[0].costUsd, 0.252);
});

test("a short pack is a pilot and maxTokens separates evidence groups", () => {
  const short = aggregateRecords({
    records: [validRecord({ task: "t1" }), validRecord({ task: "t2" })],
    now: new Date("2026-11-21T00:00:00Z"),
  });
  assert.equal(short[0].tier, "pilot");

  const split = aggregateRecords({
    records: [
      validRecord({ maxTokens: 1200 }),
      validRecord({ maxTokens: 50, task: "t2" }),
    ],
    now: new Date("2026-11-21T00:00:00Z"),
  });
  assert.equal(split.length, 2);
});

test("a group is stale when its oldest task is old, not just its newest", () => {
  const records = Array.from({ length: 10 }, (_, index) =>
    validRecord({
      task: `t${index + 1}`,
      date: index === 9 ? "2026-11-21" : "2025-01-01",
    }),
  );
  const rows = aggregateRecords({ records, now: new Date("2026-11-21T00:00:00Z") });
  assert.equal(rows[0].stale, true);
  assert.equal(rows[0].lastDate, "2026-11-21");
});

test("empty or invalid usage holds the reservation and stops the run", async () => {
  for (const usage of [{}, { prompt_tokens: "x" }, { prompt_tokens: -1 }]) {
    const pack = makePack();
    const project = makeProject();
    const result = await runBenchmark({
      projectDir: project,
      packDir: pack,
      models: ["test/model-a"],
      outDir: join(project, "out"),
      prices: { "test/model-a": { input: 1, output: 2 } },
      budgetUsd: 1,
      env,
      fetchImpl: async (url, options) => {
        const body = JSON.parse(options.body);
        const file = /### (t\d+\.js)/.exec(body.messages[0].content)[1];
        return reply(JSON.stringify({ findings: [finding(file, 2)] }), usage);
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].tokensIn, null);
    assert.equal(result.records[0].costUsd, null);
    assert.equal(result.stopped.code, "usage");
    assert.ok(result.spentUsd > 0, "the reservation is held");
  }
});

test("a provider without a usage block stops the run rather than overspending blindly", async () => {
  const pack = makePack();
  const project = makeProject();
  const result = await runBenchmark({
    projectDir: project,
    packDir: pack,
    models: ["test/model-a"],
    outDir: join(project, "out"),
    prices: { "test/model-a": { input: 1, output: 2 } },
    budgetUsd: 1,
    env,
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      const file = /### (t\d+\.js)/.exec(body.messages[0].content)[1];
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({ choices: [{ message: { content: JSON.stringify({ findings: [finding(file, 2)] }) } }] }),
      };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].tokensIn, null);
  assert.equal(result.stopped.code, "usage");
});

test("records rank measured above stale and pilot, and unique catch uses the reference", () => {
  const base = {
    schemaVersion: 1,
    protocol: "security-review-v1",
    pack: "test-pack",
    packVersion: 1,
    slot: "council.risk",
    minTasks: 2,
    samples: 1,
    harness: "drax-ai-workflow@test",
    exhaustive: true,
    tokensIn: 100,
    tokensOut: 20,
    latencyMs: 100,
    severityMismatches: 0,
    date: "2026-11-21",
  };
  const record = (model, task, caught, extra = {}) => ({
    ...base,
    model,
    task,
    ok: true,
    keyDefects: 1,
    findings: caught.length,
    caught,
    missed: [],
    falsePositives: 0,
    weightedCaught: caught.length * 8,
    weightedTotal: 8,
    costUsd: 0.001,
    ...extra,
  });
  const taskIds = Array.from({ length: 10 }, (_, index) => `t${index + 1}`);
  const records = [
    ...taskIds.map((task) => record("fresh", task, ["K1"])),
    ...taskIds.map((task) =>
      record("stale", task, ["K1"], { date: "2025-01-01" }),
    ),
    ...taskIds.slice(0, 9).map((task) => record("pilot", task, ["K1"])),
    { ...record("pilot", taskIds[9], []), ok: false, error: "http_5xx", missed: ["K1"] },
  ];
  const rows = aggregateRecords({
    records,
    slot: "council.risk",
    referenceModel: "fresh",
    now: new Date("2026-11-21T00:00:00Z"),
  });
  assert.deepEqual(rows.map((row) => row.model), ["fresh", "stale", "pilot"]);
  assert.equal(rows[0].tier, "measured");
  assert.equal(rows[0].stale, false);
  assert.equal(rows[1].stale, true);
  assert.equal(rows[2].tier, "pilot");
  assert.equal(rows[2].failed, 1);
  assert.equal(rows[2].uniqueCatch, 0);
  // Agreement only compares tasks both models actually scored.
  assert.equal(rows[2].agreement, 1);

  const compared = aggregateRecords({
    records: [
      record("fresh", "t1", ["K1"]),
      record("fresh", "t2", ["K1"]),
      record("other", "t1", ["K1"]),
      record("other", "t2", ["K2"]),
    ],
    slot: "council.risk",
    referenceModel: "fresh",
    now: new Date("2026-11-21T00:00:00Z"),
  });
  const other = compared.find((row) => row.model === "other");
  assert.equal(other.uniqueCatch, 1);
  assert.equal(other.agreement, 1 / 3);
  assert.match(formatReport(rows, { slot: "council.risk" }), /measured/);
  assert.match(formatReport(rows, { slot: "council.risk" }), /stale/);
});

test("promote merges records only in a base checkout", () => {
  const base = tempDir("wb-promote-base-");
  writeFileSync(join(base, "VERSION"), "9.9.9\n");
  writeFileSync(join(base, "AGENTS.base.md"), "base\n");
  cpSync(
    join(repoRoot, "benchmarks", "packs", "security-review"),
    join(base, "benchmarks", "packs", "security-review"),
    { recursive: true },
  );
  const copiedPackFile = join(base, "benchmarks", "packs", "security-review", "pack.json");
  const copied = JSON.parse(readFileSync(copiedPackFile, "utf8"));
  copied.note = "copied-for-promote-test";
  writeFileSync(copiedPackFile, `${JSON.stringify(copied, null, 2)}\n`);
  const loaded = loadPack(join(base, "benchmarks", "packs", "security-review"));
  const record = validRecord({
    pack: loaded.pack.id,
    packVersion: loaded.pack.version,
    packHash: loaded.packHash,
    protocol: loaded.pack.protocol,
    slot: loaded.pack.slot,
    harness: "drax-ai-workflow@9.9.9",
  });
  const runDir = tempDir("wb-promote-run-");
  writeFileSync(
    join(runDir, "records.json"),
    `${JSON.stringify({ records: [record] }, null, 2)}\n`,
  );
  const target = join(base, "benchmarks", "records.json");
  const tool = join(repoRoot, "tools", "benchmark.mjs");

  const promoted = spawnSync(
    process.execPath,
    [tool, "promote", runDir, "--project", base, "--records", target],
    { encoding: "utf8" },
  );
  assert.equal(promoted.status, 0, promoted.stdout + promoted.stderr);
  assert.equal(readRecords(target).records.length, 1);

  const badRun = tempDir("wb-promote-bad-");
  writeFileSync(
    join(badRun, "records.json"),
    `${JSON.stringify(
      { records: [{ ...record, packHash: "sha256:not-the-shipped-pack" }] },
      null,
      2,
    )}\n`,
  );
  const mismatch = spawnSync(
    process.execPath,
    [tool, "promote", badRun, "--project", base, "--records", target],
    { encoding: "utf8" },
  );
  assert.equal(mismatch.status, 1, mismatch.stdout + mismatch.stderr);
  assert.match(mismatch.stderr, /hash mismatch/);

  const repoPack = loadPack(join(repoRoot, "benchmarks", "packs", "security-review"));
  const repoRun = tempDir("wb-promote-repo-");
  writeFileSync(
    join(repoRun, "records.json"),
    `${JSON.stringify(
      { records: [{ ...record, packHash: repoPack.packHash }] },
      null,
      2,
    )}\n`,
  );
  const wrongBase = spawnSync(
    process.execPath,
    [tool, "promote", repoRun, "--project", base, "--records", target],
    { encoding: "utf8" },
  );
  assert.equal(wrongBase.status, 1, wrongBase.stdout + wrongBase.stderr);
  assert.match(wrongBase.stderr, /hash mismatch/);

  const protocolRun = tempDir("wb-promote-protocol-");
  writeFileSync(
    join(protocolRun, "records.json"),
    `${JSON.stringify(
      { records: [{ ...record, protocol: "not-this-protocol" }] },
      null,
      2,
    )}\n`,
  );
  const badProtocol = spawnSync(
    process.execPath,
    [tool, "promote", protocolRun, "--project", base, "--records", target],
    { encoding: "utf8" },
  );
  assert.equal(badProtocol.status, 1, badProtocol.stdout + badProtocol.stderr);
  assert.match(badProtocol.stderr, /protocol mismatch/);

  const harnessRun = tempDir("wb-promote-harness-");
  writeFileSync(
    join(harnessRun, "records.json"),
    `${JSON.stringify(
      { records: [{ ...record, harness: "drax-ai-workflow@0.0.0" }] },
      null,
      2,
    )}\n`,
  );
  const badHarness = spawnSync(
    process.execPath,
    [tool, "promote", harnessRun, "--project", base, "--records", target],
    { encoding: "utf8" },
  );
  assert.equal(badHarness.status, 1, badHarness.stdout + badHarness.stderr);
  assert.match(badHarness.stderr, /harness mismatch/);

  const project = tempDir("wb-promote-project-");
  const refused = spawnSync(
    process.execPath,
    [tool, "promote", runDir, "--project", project, "--records", join(project, "records.json")],
    { encoding: "utf8" },
  );
  assert.equal(refused.status, 1, refused.stdout + refused.stderr);
  assert.match(refused.stderr, /base checkout/);
});

test("report --json returns rows for the selected slot", () => {
  const file = join(tempDir("wb-bench-report-"), "records.json");
  writeRecords(file, [
    validRecord({ model: "test/model-a" }),
    validRecord({ model: "test/model-b", task: "t2", caught: [] }),
  ]);
  const result = spawnSync(
    process.execPath,
    [join(repoRoot, "tools", "benchmark.mjs"), "report", "--records", file, "--slot", "council.risk", "--json"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.rows.length, 2);
  assert.equal(report.rows[0].slot, "council.risk");
  assert.equal(report.rows[0].packHash, "sha256:test");
});

test("the CLI validates the shipped pack and reports an empty store without failing", () => {
  const tool = join(repoRoot, "tools", "benchmark.mjs");
  const validate = spawnSync(process.execPath, [tool, "validate"], { encoding: "utf8" });
  assert.equal(validate.status, 0, validate.stdout + validate.stderr);
  assert.match(validate.stdout, /tasks: 10 \(minTasks 10\), defects: 23/);

  const empty = spawnSync(
    process.execPath,
    [tool, "report", "--records", join(tempDir("wb-bench-empty-"), "none.json")],
    { encoding: "utf8" },
  );
  assert.equal(empty.status, 0, empty.stdout + empty.stderr);
  assert.match(empty.stdout, /no records at/);
});

test("base benchmark reaches the same CLI", () => {
  const result = spawnSync(
    process.execPath,
    [join(repoRoot, "tools", "base.mjs"), "benchmark", "validate"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /pack security-review@1/);
});