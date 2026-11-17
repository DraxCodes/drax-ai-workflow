import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
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