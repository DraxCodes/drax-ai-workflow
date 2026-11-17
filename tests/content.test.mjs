import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { repoRoot } from "./helpers.mjs";

const TREES = ["agents", "commands", "skills", "packs", "schema", "templates", "tools"];
const FILES = ["README.md", "AGENTS.base.md"];

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