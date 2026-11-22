import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { repoRoot } from "./helpers.mjs";

const TREES = [
  "agents",
  "commands",
  "skills",
  "packs",
  "schema",
  "templates",
  "tools",
  "benchmarks/packs",
];
const FILES = ["README.md", "AGENTS.base.md", "benchmarks/protocol.md"];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs));
    else if (entry.isFile()) out.push(abs);
  }
  return out;
}

test("the shipped base carries no project-specific terms", () => {
  const forbidden = /dotnet|scripts[\\/]ui|CLIMBER_SEED|\/status\b|Razor|surplus\//i;
  const files = [];
  for (const tree of TREES) files.push(...walk(join(repoRoot, tree)));
  files.push(...FILES.map((name) => join(repoRoot, name)));

  for (const abs of files) {
    const rel = relative(repoRoot, abs);
    assert.doesNotMatch(readFileSync(abs, "utf8"), forbidden, rel);
  }
});

test("start-project and council require the options brief", () => {
  const start = readFileSync(join(repoRoot, "commands", "start-project.md"), "utf8");
  const council = readFileSync(join(repoRoot, "skills", "council", "SKILL.md"), "utf8");
  const options = readFileSync(
    join(repoRoot, "skills", "workflow-base", "references", "options.md"),
    "utf8",
  );
  assert.match(start, /references\/options\.md/);
  assert.match(council, /options brief/i);
  assert.match(council, /wildcard/i);
  assert.match(options, /boring default/i);
  assert.match(options, /portfolio/i);
  assert.match(options, /Rust/i);
});

test("nothing points at the moved rubric path; the pointer is the only exception", () => {
  const pointer = join(
    repoRoot,
    "skills",
    "hillclimb",
    "references",
    "hillclimb-rubric.md",
  );
  assert.ok(existsSync(pointer), "the compatibility pointer still exists");

  const files = [];
  for (const tree of ["agents", "commands", "skills"]) {
    files.push(...walk(join(repoRoot, tree)));
  }
  files.push(join(repoRoot, "AGENTS.base.md"));

  for (const abs of files) {
    if (abs === pointer) continue;
    const rel = relative(repoRoot, abs);
    assert.doesNotMatch(
      readFileSync(abs, "utf8"),
      /references\/hillclimb-rubric\.md/,
      `${rel} should point at references/rubrics/<name>.md`,
    );
  }
});