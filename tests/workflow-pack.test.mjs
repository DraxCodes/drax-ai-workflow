import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot, tempDir } from "./helpers.mjs";
import { loadWorkflowPack, workflowPackFiles } from "../tools/lib/workflow-pack.mjs";

test("the shipped workflow pilot pack has three complete tasks", () => {
  const dir = join(repoRoot, "benchmarks", "workflow", "packs", "pilot");
  const { pack, errors } = loadWorkflowPack(dir);
  assert.deepEqual(errors, []);
  assert.equal(pack.id, "pilot");
  assert.equal(pack.tasks.length, 3);
  assert.deepEqual(workflowPackFiles(pack), pack.tasks.slice().sort());
  for (const entry of pack.entries) {
    assert.ok(entry.taskFile.endsWith("task.md"));
    assert.ok(entry.keyFile.endsWith("key.md"));
    assert.ok(entry.inputDir.endsWith("input"));
  }
});

test("a workflow pack without a key or an Objective is rejected", () => {
  const dir = tempDir("wb-workflow-pack-");
  writeFileSync(
    join(dir, "pack.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      id: "bad",
      version: "0.0.1",
      protocol: "bad-v1",
      minTasks: 10,
      tasks: ["01-missing"],
    })}\n`,
  );
  mkdirSync(join(dir, "tasks", "01-missing", "input"), { recursive: true });
  writeFileSync(join(dir, "tasks", "01-missing", "task.md"), "# No sections\n");

  const { errors } = loadWorkflowPack(dir);
  assert.ok(errors.some((error) => error.includes("key.md is missing")));
  assert.ok(errors.some((error) => error.includes("no Objective")));
  assert.ok(errors.some((error) => error.includes("no Evidence")));
});

test("base benchmark workflow validate reaches the shipped pack", () => {
  const result = spawnSync(process.execPath, [join(repoRoot, "tools", "benchmark.mjs"), "workflow", "validate"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /workflow pack pilot@0\.1\.0/);
  assert.match(result.stdout, /3 tasks/);
});