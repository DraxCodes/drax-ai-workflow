import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
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

function homeEnv(home) {
  return { ...process.env, USERPROFILE: home, HOME: home };
}

test("new writes a preset seam, docs, config and verifies", () => {
  const base = fixtureBase();
  const project = tempDir("wb-new-");
  const home = tempDir("wb-home-");
  const tool = join(base, "tools", "base.mjs");

  const result = run(
    tool,
    [
      "new",
      project,
      "--from",
      base,
      "--project",
      "demo",
      "--preset",
      "web",
      "--config",
    ],
    { env: homeEnv(home) },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);

  const seam = JSON.parse(
    readFileSync(join(project, ".opencode", "workflow.json"), "utf8"),
  );
  assert.equal(seam.checks.build.command, "npm run build");
  assert.equal(seam.checks.test.command, "npm test");
  assert.equal(seam.verify.surface, "web");
  assert.deepEqual(seam.verify.widths, [375, 900]);
  assert.deepEqual(seam.verify.themes, ["light", "dark"]);

  assert.ok(existsSync(join(project, ".scratch")));
  assert.ok(existsSync(join(project, "docs", "adr")));

  const config = JSON.parse(readFileSync(join(project, "opencode.json"), "utf8"));
  assert.equal(config.model, "<provider/model>");
  assert.ok(config.agents["quality-gatekeeper"].permissions);

  assert.match(result.stdout, /check: clean/);
  assert.match(result.stdout, /doctor: no errors/);
  assert.match(result.stdout, /placeholders in opencode\.json/);
});

test("new --dry-run writes nothing", () => {
  const base = fixtureBase();
  const project = tempDir("wb-new-dry-");
  const home = tempDir("wb-home-");
  const tool = join(base, "tools", "base.mjs");

  const result = run(
    tool,
    ["new", project, "--from", base, "--preset", "bare", "--dry-run"],
    { env: homeEnv(home) },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(existsSync(join(project, ".opencode")), false);
  assert.equal(existsSync(join(project, "opencode.json")), false);
});

test("new rejects an unknown preset", () => {
  const base = fixtureBase();
  const project = tempDir("wb-new-bad-");
  const tool = join(base, "tools", "base.mjs");

  const result = run(
    tool,
    ["new", project, "--from", base, "--preset", "party"],
    { env: homeEnv(tempDir("wb-home-")) },
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown preset: party/);
});

test("doctor --fix creates required dirs and moves same-ID global agents", () => {
  const base = fixtureBase();
  const project = tempDir("wb-fix-");
  const home = tempDir("wb-home-");
  const tool = join(base, "tools", "base.mjs");
  const env = homeEnv(home);

  const init = run(tool, ["init", project, "--from", base, "--project", "demo"], {
    env,
  });
  assert.equal(init.status, 0, init.stdout + init.stderr);

  const globalAgents = join(home, ".config", "opencode", "agents");
  mkdirSync(globalAgents, { recursive: true });
  writeFileSync(join(globalAgents, "task-orchestrator.md"), "# stale\n");

  const dry = run(tool, ["doctor", project, "--fix", "--dry-run", "--home", home], {
    env,
  });
  assert.equal(dry.status, 0, dry.stdout + dry.stderr);
  assert.match(dry.stdout, /create \.scratch/);
  assert.match(dry.stdout, /move global agent task-orchestrator/);
  assert.equal(existsSync(join(project, ".scratch")), false);
  assert.ok(existsSync(join(globalAgents, "task-orchestrator.md")));

  const fixed = run(tool, ["doctor", project, "--fix", "--home", home], { env });
  assert.equal(fixed.status, 0, fixed.stdout + fixed.stderr);
  assert.ok(existsSync(join(project, ".scratch")));
  assert.ok(existsSync(join(project, "docs", "adr")));
  assert.equal(existsSync(join(globalAgents, "task-orchestrator.md")), false);

  const backup = readdirSync(join(home, ".config", "opencode")).find((name) =>
    name.startsWith("agents.bak-"),
  );
  assert.ok(backup, "a dated backup directory exists");
  assert.ok(
    existsSync(join(home, ".config", "opencode", backup, "task-orchestrator.md")),
  );
});