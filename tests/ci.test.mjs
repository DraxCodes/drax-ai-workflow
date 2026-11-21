import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fixtureBase, tempDir } from "./helpers.mjs";

function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

test("ci passes on a clean fixture and fails on drift", () => {
  const base = fixtureBase();
  const project = tempDir("wb-ci-");
  const tool = join(base, "tools", "base.mjs");
  const init = run(tool, ["init", project, "--from", base, "--project", "demo"]);
  assert.equal(init.status, 0, init.stdout + init.stderr);
  mkdirSync(join(project, ".scratch"), { recursive: true });
  mkdirSync(join(project, "docs", "adr"), { recursive: true });

  const clean = run(tool, ["ci", project, "--json", "--no-benchmark"]);
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);
  const report = JSON.parse(clean.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.steps.length, 2);
  assert.equal(report.steps[0].name, "check");
  assert.equal(report.steps[1].name, "doctor");

  const agent = join(project, ".opencode", "agents", "task-orchestrator.md");
  writeFileSync(agent, `${readFileSync(agent, "utf8")}\ndrift\n`);

  const drifted = run(tool, ["ci", project, "--json", "--no-benchmark"]);
  assert.equal(drifted.status, 1, drifted.stdout + drifted.stderr);
  const after = JSON.parse(drifted.stdout);
  assert.equal(after.ok, false);
  assert.equal(after.steps[0].status, 1);
});

test("ci --with-project-checks runs the seam build and test commands", () => {
  const base = fixtureBase();
  const project = tempDir("wb-ci-checks-");
  const tool = join(base, "tools", "base.mjs");
  const init = run(tool, ["init", project, "--from", base, "--project", "demo"]);
  assert.equal(init.status, 0, init.stdout + init.stderr);
  mkdirSync(join(project, ".scratch"), { recursive: true });
  mkdirSync(join(project, "docs", "adr"), { recursive: true });

  const seamFile = join(project, ".opencode", "workflow.json");
  const seam = JSON.parse(readFileSync(seamFile, "utf8"));
  seam.checks.build = { command: 'node -e "process.exit(0)"', cwd: "." };
  seam.checks.test = { command: 'node -e "process.exit(0)"', cwd: "." };
  writeFileSync(seamFile, `${JSON.stringify(seam, null, 2)}\n`);

  const result = run(tool, ["ci", project, "--json", "--no-benchmark", "--with-project-checks"]);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  assert.ok(report.steps.some((step) => step.name === "project build"));
  assert.ok(report.steps.some((step) => step.name === "project test"));
});