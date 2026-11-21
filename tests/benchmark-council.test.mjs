import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot, tempDir } from "./helpers.mjs";
import {
  aggregateRecords,
  loadPack,
  scoreCouncilTask,
  validateCouncilOutput,
  runBenchmark,
} from "../tools/lib/benchmark.mjs";

const packDir = (name) => join(repoRoot, "benchmarks", "packs", name);

const chairOutput = {
  options: [
    { id: "A", shape: "topbar picker", cost: "small", risk: "moves the title", reversible: "yes", buys: "one click" },
    { id: "B", shape: "in-pane list", cost: "small", risk: "page-local state", reversible: "yes", buys: "switching" },
    { id: "C", shape: "palette command", cost: "small", risk: "hides the list", reversible: "yes", buys: "reach" },
  ],
  recommendation: { option: "B", why: "The list is the body state; A moves the title and C hides the list." },
  dissent: [
    { seat: "risk", point: "the held run is voided with a sentence" },
    { seat: "experience", point: "focus lands on the first row" },
  ],
  rejected: [
    { option: "A", why: "it moves the title" },
    { option: "C", why: "it hides the list behind a command" },
  ],
};

const shapeOutput = {
  shape: "reuse the existing renderer and read route",
  newFiles: ["status-page.js"],
  newDependencies: [],
  seams: ["route", "renderer"],
  deferred: ["live updates", "analytics"],
  reversible: { how: "remove the route and page file", cost: "one commit" },
  why: "one data path keeps the page server-rendered",
  whatWouldChangeMyMind: "a requirement for live updates",
};

const experienceOutput = {
  thesis: {
    threeSecondRead: "No threads yet; the list heading and count frame the empty area.",
    firstRunPath: "Create or attach a thread is the only primary action.",
    copyVoice: "Sentence case, quiet, no exclamation.",
    goodMoment: "The first row appears without a layout jump.",
    frictionAvoided: "No modal, spinner or tour.",
  },
  evidence: ["the heading and count stay visible", "the primary action sits under the heading"],
  nonGoals: ["onboarding tour"],
};

test("council packs load with a prompt that never contains the key", () => {
  for (const [name, seat] of [
    ["council-chair", "chair"],
    ["council-shape", "shape"],
    ["council-experience", "experience"],
  ]) {
    const loaded = loadPack(packDir(name));
    assert.deepEqual(loaded.errors, []);
    assert.equal(loaded.pack.kind, "council");
    assert.equal(loaded.pack.seat, seat);
    assert.equal(loaded.tasks.length, 10);
    assert.match(loaded.tasks[0].prompt, /Return exactly one JSON object/);
    assert.ok(!loaded.tasks[0].prompt.includes("C1"));
  }
});

test("a perfect council output scores every criterion", () => {
  const chair = loadPack(packDir("council-chair")).tasks[0];
  const shape = loadPack(packDir("council-shape")).tasks[0];
  const experience = loadPack(packDir("council-experience")).tasks[0];
  for (const [task, output, seat] of [
    [chair, chairOutput, "chair"],
    [shape, shapeOutput, "shape"],
    [experience, experienceOutput, "experience"],
  ]) {
    assert.deepEqual(validateCouncilOutput({ seat, value: output }).errors, []);
    const score = scoreCouncilTask({ task, output });
    assert.equal(score.missed.length, 0);
    assert.equal(score.falsePositives, 0);
    assert.equal(score.weightedCaught, score.weightedTotal);
  }
});

test("a council output with a missing or unexpected field fails validation", () => {
  assert.ok(validateCouncilOutput({ seat: "chair", value: { ...chairOutput, options: undefined } }).errors.length > 0);
  assert.ok(validateCouncilOutput({ seat: "chair", value: { ...chairOutput, notes: "extra" } }).errors.length > 0);
  const { newDependencies, ...withoutDependencies } = shapeOutput;
  assert.ok(validateCouncilOutput({ seat: "shape", value: withoutDependencies }).errors.length > 0);
});

test("forbidden claims and invented options count as false positives", () => {
  const chair = loadPack(packDir("council-chair")).tasks[0];
  const score = scoreCouncilTask({
    task: chair,
    output: {
      ...chairOutput,
      options: [...chairOutput.options, { id: "D", shape: "new store", cost: "small", risk: "second store", reversible: "no", buys: "nothing" }],
      recommendation: { option: "B", why: "All seats agree; the council agreed unanimously." },
    },
  });
  assert.equal(score.falsePositives, 2);
  assert.deepEqual(score.inventedClaims, ["D"]);
  assert.deepEqual(score.forbiddenHits, ["F1"]);
});

test("the no-dissent task rewards an empty dissent and rejected list", () => {
  const task = loadPack(packDir("council-chair")).tasks.find((entry) => entry.id === "09-no-dissent");
  const score = scoreCouncilTask({
    task,
    output: {
      ...chairOutput,
      recommendation: { option: "A", why: "All seats proposed the same cache." },
      dissent: [],
      rejected: [],
    },
  });
  assert.deepEqual(score.missed, []);
  assert.equal(score.falsePositives, 0);
});

test("a forbidden adjective counts against the experience seat", () => {
  const experience = loadPack(packDir("council-experience")).tasks[0];
  const score = scoreCouncilTask({
    task: experience,
    output: {
      ...experienceOutput,
      thesis: { ...experienceOutput.thesis, copyVoice: "Delightful and seamless." },
    },
  });
  assert.deepEqual(score.forbiddenHits, ["F1"]);
  assert.equal(score.falsePositives, 1);
});

function councilRecord(overrides = {}) {
  return {
    schemaVersion: 1,
    protocol: "council-seat-v1",
    pack: "council-chair",
    packVersion: 1,
    packHash: "sha256:test",
    slot: "council.chair",
    model: "test/model",
    task: "01",
    sample: 1,
    samples: 1,
    minTasks: 3,
    exhaustive: true,
    date: "2026-11-21",
    harness: "drax-ai-workflow@0.7.1",
    ok: true,
    keyDefects: 1,
    findings: 1,
    caught: ["C1"],
    missed: [],
    falsePositives: 0,
    severityMismatches: 0,
    kindMismatches: 0,
    weightedCaught: 1,
    weightedTotal: 1,
    tokensIn: 10,
    tokensOut: 5,
    costUsd: 0.001,
    latencyMs: 10,
    temperature: 0,
    maxTokens: 1200,
    retries: 0,
    attempts: 1,
    ...overrides,
  };
}

test("three council tasks are a pilot; ten are measured", () => {
  const pilot = aggregateRecords({
    records: [1, 2, 3].map((n) => councilRecord({ task: `0${n}` })),
    slot: "council.chair",
  });
  assert.equal(pilot[0].tier, "pilot");
  assert.equal(pilot[0].confidence, "low");

  const measured = aggregateRecords({
    records: Array.from({ length: 10 }, (_, index) =>
      councilRecord({ task: `t${index + 1}`, minTasks: 10 }),
    ),
    slot: "council.chair",
  });
  assert.equal(measured[0].tier, "measured");
  assert.equal(measured[0].confidence, "medium");
});

test("a council pack runs through the same budgeted runner", async () => {
  const project = tempDir("wb-council-project-");
  writeFileSync(
    join(project, "opencode.json"),
    `${JSON.stringify(
      {
        provider: {
          test: {
            settings: { baseURL: "https://bench.test/v1", apiKey: "{env:BENCH_KEY}" },
            models: { model: { cost: { input: 1, output: 2 } } },
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  const outDir = join(project, "out");
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(chairOutput) } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      }),
  });
  const result = await runBenchmark({
    projectDir: project,
    packDir: packDir("council-chair"),
    models: ["test/model"],
    outDir,
    prices: { "test/model": { input: 1, output: 2 } },
    budgetUsd: 1,
    env: { BENCH_KEY: "x" },
    fetchImpl,
  });
  assert.equal(result.ok, true);
  assert.equal(result.records.length, 10);
  assert.ok(result.records.every((record) => record.ok === true));
  assert.ok(result.records.every((record) => record.keyDefects > 0));
  assert.ok(existsSync(join(outDir, "records.json")));
  assert.ok(existsSync(join(outDir, "outputs", "test_model", "01-switching-threads.1.json")));
});