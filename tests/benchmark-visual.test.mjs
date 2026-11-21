import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot, tempDir } from "./helpers.mjs";
import {
  loadPack,
  scoreVisualTask,
  runBenchmark,
} from "../tools/lib/benchmark.mjs";

const packPath = join(repoRoot, "benchmarks", "packs", "visual-project-list");
const finding = {
  shot: "375-light",
  region: "header subtitle 'Status, coverage and stack at a glance.'",
  kind: "defect",
  observed: "The subtitle is very light grey on white.",
  expected: "Text meets 4.5:1 contrast.",
  condition: "width=375, light theme, default state",
  severity: "major",
  confidence: "high",
  evidence: "The subtitle is barely distinguishable from the background.",
};

test("the visual pack loads with images and never exposes the key", () => {
  const loaded = loadPack(packPath);
  assert.deepEqual(loaded.errors, []);
  assert.equal(loaded.pack.kind, "visual");
  assert.equal(loaded.pack.protocol, "visual-review-v1");
  assert.equal(loaded.tasks.length, 1);
  const task = loaded.tasks[0];
  assert.equal(task.shots.length, 4);
  assert.equal(task.key.defects.length, 22);
  assert.match(task.prompt, /375-light/);
  assert.match(task.prompt, /separate finding for each shot/);
  assert.ok(!task.prompt.includes("D1-375-light"));
  assert.ok(task.shots.every((shot) => shot.base64.length > 100));
});

test("a verbose but correct region still catches the keyed defect", () => {
  const task = loadPack(packPath).tasks[0];
  const score = scoreVisualTask({ task, findings: [finding], threshold: 0.6 });
  assert.deepEqual(score.caught, ["D1-375-light"]);
  assert.deepEqual(score.missed.length, 21);
  assert.equal(score.falsePositives, 0);
});

test("a visual finding outside the key is a false positive", () => {
  const task = loadPack(packPath).tasks[0];
  const score = scoreVisualTask({
    task,
    findings: [{ ...finding, shot: "900-light", region: "footer" }],
    threshold: 0.6,
  });
  assert.deepEqual(score.caught, []);
  assert.equal(score.falsePositives, 1);
});

test("the visual pack runs through the budgeted runner with image content", async () => {
  const project = tempDir("wb-visual-project-");
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
  let imageParts = 0;
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    imageParts = body.messages[0].content.filter((part) => part.type === "image_url").length;
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ findings: [finding] }) } }],
          usage: { prompt_tokens: 100, completion_tokens: 50 },
        }),
    };
  };
  const result = await runBenchmark({
    projectDir: project,
    packDir: packPath,
    models: ["test/model"],
    outDir,
    prices: { "test/model": { input: 1, output: 2 } },
    budgetUsd: 1,
    env: { BENCH_KEY: "x" },
    fetchImpl,
  });
  assert.equal(result.ok, true);
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].ok, true);
  assert.equal(result.records[0].keyDefects, 22);
  assert.deepEqual(result.records[0].caught, ["D1-375-light"]);
  assert.equal(result.records[0].falsePositives, 0);
  assert.equal(imageParts, 4);
});