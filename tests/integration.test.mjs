import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fixtureBase, tempDir } from "./helpers.mjs";

function run(script, args, options = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    ...options,
  });
}

test("init, check, doctor, update, pack and eject", () => {
  const base = fixtureBase();
  const project = tempDir("wb-project-");
  const tool = join(base, "tools", "base.mjs");

  const init = run(tool, [
    "init",
    project,
    "--from",
    base,
    "--project",
    "demo",
    "--test",
    "npm test",
    "--surface",
    "cli",
    "--pack",
    "engineering",
  ]);
  assert.equal(init.status, 0, init.stdout + init.stderr);

  assert.ok(existsSync(join(project, ".opencode", "agents", "task-orchestrator.md")));
  assert.ok(existsSync(join(project, ".opencode", "commands", "council.md")));
  assert.ok(existsSync(join(project, ".opencode", "skills", "council", "SKILL.md")));
  assert.ok(existsSync(join(project, ".opencode", "tools", "base.mjs")));
  assert.ok(
    existsSync(join(project, ".opencode", "commands", "setup-engineering-pack.md")),
    "pack commands are flattened into .opencode/commands",
  );
  assert.ok(existsSync(join(project, ".opencode", "packs", "engineering", "pack.json")));

  const seam = JSON.parse(
    readFileSync(join(project, ".opencode", "workflow.json"), "utf8"),
  );
  assert.equal(seam.project, "demo");
  assert.equal(seam.base.version, "0.1.0");
  assert.equal(seam.checks.test.command, "npm test");
  assert.equal(seam.verify.surface, "cli");
  assert.deepEqual(seam.packs, ["engineering"]);

  const agents = readFileSync(join(project, "AGENTS.md"), "utf8");
  assert.match(agents, /workflow-base:begin/);
  assert.match(agents, /version 0\.1\.0/);

  const vendored = join(project, ".opencode", "tools", "base.mjs");
  const check = run(vendored, ["check", project]);
  assert.equal(check.status, 0, check.stdout + check.stderr);
  assert.match(check.stdout, /Clean/);

  // A local edit is drift.
  const agentFile = join(project, ".opencode", "agents", "task-orchestrator.md");
  writeFileSync(agentFile, "edited\n");
  const drifted = run(vendored, ["check", project]);
  assert.equal(drifted.status, 1);
  assert.match(drifted.stdout, /changed: \.opencode\/agents\/task-orchestrator\.md/);

  const restored = run(vendored, ["update", project, "--from", base, "--force"]);
  assert.equal(restored.status, 0, restored.stdout + restored.stderr);
  assert.equal(run(vendored, ["check", project]).status, 0);

  // A vendored CLI falls back to the manifest version outside a base checkout.
  const version = run(vendored, ["version", project], { cwd: tempDir("wb-cwd-") });
  assert.equal(version.status, 0, version.stdout + version.stderr);
  assert.equal(version.stdout.trim(), "0.1.0");

  // A project addition is reported as extra but is not drift.
  const bespoke = join(project, ".opencode", "skills", "bespoke");
  mkdirSync(bespoke, { recursive: true });
  writeFileSync(join(bespoke, "SKILL.md"), "# Bespoke\n");
  const extra = run(vendored, ["check", project]);
  assert.equal(extra.status, 0, extra.stdout + extra.stderr);
  assert.match(extra.stdout, /extra: \.opencode\/skills\/bespoke\/SKILL\.md/);
  rmSync(bespoke, { recursive: true, force: true });

  // The required doc paths must exist before the clean doctor run.
  mkdirSync(join(project, ".scratch"), { recursive: true });
  mkdirSync(join(project, "docs", "adr"), { recursive: true });

  // A same-ID global agent is an error until it is moved aside.
  const home = tempDir("wb-home-");
  const globalAgents = join(home, ".config", "opencode", "agents");
  mkdirSync(globalAgents, { recursive: true });
  writeFileSync(join(globalAgents, "task-orchestrator.md"), "# stale\n");
  const shadowed = run(vendored, ["doctor", project, "--home", home]);
  assert.equal(shadowed.status, 1);
  assert.match(shadowed.stdout, /shadows the vendored agent/);

  writeFileSync(join(globalAgents, "task-orchestrator.md"), " ");
  const cleanHome = run(vendored, ["doctor", project, "--home", tempDir("wb-home-")]);
  assert.equal(cleanHome.status, 0, cleanHome.stdout + cleanHome.stderr);

  // Pack install runs the vendored installer with the project as cwd.
  const pack = run(vendored, ["pack", "install", "engineering", project]);
  assert.equal(pack.status, 0, pack.stdout + pack.stderr);
  assert.ok(existsSync(join(project, "pack-installed.txt")));

  // A version bump updates files, the seam, the block and the manifest.
  writeFileSync(join(base, "VERSION"), "0.2.0\n");
  writeFileSync(join(base, "agents", "task-orchestrator.md"), "# Agent A v2\n");
  const update = run(vendored, ["update", project, "--from", base]);
  assert.equal(update.status, 0, update.stdout + update.stderr);
  assert.match(update.stdout, /0\.1\.0 -> 0\.2\.0/);
  assert.equal(readFileSync(agentFile, "utf8"), "# Agent A v2\n");
  const updatedSeam = JSON.parse(
    readFileSync(join(project, ".opencode", "workflow.json"), "utf8"),
  );
  assert.equal(updatedSeam.base.version, "0.2.0");
  assert.match(readFileSync(join(project, "AGENTS.md"), "utf8"), /version 0\.2\.0/);
  assert.equal(run(vendored, ["check", project]).status, 0);

  const eject = run(vendored, ["eject", project]);
  assert.equal(eject.status, 0, eject.stdout + eject.stderr);
  assert.equal(existsSync(agentFile), false);
  assert.equal(
    existsSync(join(project, ".opencode", ".workflow-manifest.json")),
    false,
  );
  assert.doesNotMatch(readFileSync(join(project, "AGENTS.md"), "utf8"), /workflow-base:begin/);
  assert.ok(
    existsSync(join(project, ".opencode", "workflow.json")),
    "the seam is left for the project",
  );
});

test("doctor flags a missing required doc and a stale AGENTS block", () => {
  const base = fixtureBase();
  const project = tempDir("wb-doctor-");
  const tool = join(base, "tools", "base.mjs");
  const init = run(tool, ["init", project, "--from", base, "--project", "demo"]);
  assert.equal(init.status, 0, init.stdout + init.stderr);

  const missing = run(tool, ["doctor", project, "--home", tempDir("wb-home-")]);
  assert.equal(missing.status, 1);
  assert.match(missing.stdout, /docs\.issues: .*does not exist \(required/);

  mkdirSync(join(project, ".scratch"), { recursive: true });
  mkdirSync(join(project, "docs", "adr"), { recursive: true });
  const clean = run(tool, ["doctor", project, "--home", tempDir("wb-home-")]);
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);

  const agents = join(project, "AGENTS.md");
  writeFileSync(
    agents,
    readFileSync(agents, "utf8").replace("Workflow base", "Workflow base (edited)"),
  );
  const stale = run(tool, ["doctor", project, "--home", tempDir("wb-home-")]);
  assert.equal(stale.status, 1);
  assert.match(stale.stdout, /block was edited or is stale/);
});