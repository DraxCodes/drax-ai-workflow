import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fixtureBase, tempDir } from "./helpers.mjs";

function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

test("fleet reports version, files and drift across projects", () => {
  const base = fixtureBase();
  const root = tempDir("wb-fleet-");
  const tool = join(base, "tools", "base.mjs");
  const first = join(root, "alpha");
  const second = join(root, "beta");

  for (const project of [first, second]) {
    const init = run(tool, ["init", project, "--from", base, "--project", project.slice(-5)]);
    assert.equal(init.status, 0, init.stdout + init.stderr);
  }

  const clean = run(tool, ["fleet", root, "--json"]);
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);
  const report = JSON.parse(clean.stdout);
  assert.equal(report.summary.total, 2);
  assert.equal(report.summary.drifted, 0);
  assert.equal(report.projects.length, 2);

  const agent = join(first, ".opencode", "agents", "task-orchestrator.md");
  writeFileSync(agent, `${readFileSync(agent, "utf8")}\nlocal edit\n`);

  const drifted = run(tool, ["fleet", root, "--json", "--check"]);
  assert.equal(drifted.status, 1, drifted.stdout + drifted.stderr);
  const after = JSON.parse(drifted.stdout);
  assert.equal(after.summary.drifted, 1);
  assert.equal(after.projects.find((project) => project.project === "alpha").changed, 1);
});