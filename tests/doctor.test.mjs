import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fixtureBase, tempDir } from "./helpers.mjs";

function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

test("doctor scans the vendored tools and the root config for secrets", () => {
  const base = fixtureBase();
  const project = tempDir("wb-doctor-");
  const home = tempDir("wb-home-");
  const tool = join(base, "tools", "base.mjs");

  const init = run(tool, ["init", project, "--from", base, "--project", "demo"]);
  assert.equal(init.status, 0, init.stdout + init.stderr);
  mkdirSync(join(project, ".scratch"), { recursive: true });
  mkdirSync(join(project, "docs", "adr"), { recursive: true });

  // Built at runtime so the fixture file holds no contiguous token literal.
  const token = ["ghp", "A".repeat(36)].join("_");
  writeFileSync(
    join(project, ".opencode", "tools", "leak.mjs"),
    `export const token = "${token}";\n`,
  );
  writeFileSync(
    join(project, "opencode.json"),
    `${JSON.stringify({ apiKey: "not-a-real-secret-example" }, null, 2)}\n`,
  );

  const result = run(tool, ["doctor", project, "--home", home]);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /\.opencode\/tools\/leak\.mjs: looks like a GitHub token/);
  assert.match(result.stdout, /opencode\.json: possible inline credential/);
});

test("doctor resolves the selected rubric and rejects an unknown one", () => {
  const base = fixtureBase();
  const project = tempDir("wb-doctor-rubric-");
  const home = tempDir("wb-home-");
  const tool = join(base, "tools", "base.mjs");

  const init = run(tool, ["init", project, "--from", base, "--project", "demo"]);
  assert.equal(init.status, 0, init.stdout + init.stderr);
  mkdirSync(join(project, ".scratch"), { recursive: true });
  mkdirSync(join(project, "docs", "adr"), { recursive: true });

  // The fixture base ships no hillclimb skill; add the directory and one
  // rubric file so the resolution check has something to find.
  const rubrics = join(
    project,
    ".opencode",
    "skills",
    "hillclimb",
    "references",
    "rubrics",
  );
  mkdirSync(rubrics, { recursive: true });
  writeFileSync(join(rubrics, "perception.md"), "# Perception\n");

  const ok = run(tool, ["doctor", project, "--home", home]);
  assert.match(ok.stdout, /hillclimb: rubric perception/);

  const seamFile = join(project, ".opencode", "workflow.json");
  const seam = JSON.parse(readFileSync(seamFile, "utf8"));
  seam.rubrics = { default: "vibes" };
  writeFileSync(seamFile, `${JSON.stringify(seam, null, 2)}\n`);

  const bad = run(tool, ["doctor", project, "--home", home]);
  assert.equal(bad.status, 1, bad.stdout + bad.stderr);
  assert.match(bad.stdout, /rubrics\.default: "vibes" does not resolve/);

  // A project-owned rubric path is accepted too.
  mkdirSync(join(project, "docs", "rubrics"), { recursive: true });
  writeFileSync(join(project, "docs", "rubrics", "custom.md"), "# Custom\n");
  seam.rubrics = { default: "docs/rubrics/custom.md" };
  writeFileSync(seamFile, `${JSON.stringify(seam, null, 2)}\n`);
  const custom = run(tool, ["doctor", project, "--home", home]);
  assert.equal(custom.status, 0, custom.stdout + custom.stderr);
  assert.match(custom.stdout, /hillclimb: rubric docs\/rubrics\/custom\.md/);
});