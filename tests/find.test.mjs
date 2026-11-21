import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findInProject } from "../tools/lib/find.mjs";
import { tempDir } from "./helpers.mjs";

function git(dir, args) {
  return spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
}

test("find returns matching docs and commit messages without an embedding index", () => {
  const project = tempDir("wb-find-");
  mkdirSync(join(project, "docs", "notes"), { recursive: true });
  mkdirSync(join(project, "docs", "adr"), { recursive: true });
  writeFileSync(
    join(project, "docs", "notes", "cache.md"),
    "# Cache key\n\nThe cache key uses the workspace path, not the directory name.\n",
  );
  writeFileSync(
    join(project, "docs", "adr", "0001-cache.md"),
    "# 0001 — Cache key\n\n**Status:** accepted\n\nThe cache key uses the workspace path.\n",
  );

  assert.equal(git(project, ["init"]).status, 0);
  assert.equal(git(project, ["config", "user.email", "test@example.com"]).status, 0);
  assert.equal(git(project, ["config", "user.name", "Test"]).status, 0);
  assert.equal(git(project, ["add", "."]).status, 0);
  const commit = git(project, ["commit", "-m", "Decide cache key from the workspace path"]);
  assert.equal(commit.status, 0, commit.stdout + commit.stderr);

  const result = findInProject(project, "why does the cache key use the workspace path");
  assert.ok(result.docs.length >= 1, JSON.stringify(result));
  assert.ok(result.docs.some((hit) => hit.file.endsWith("cache.md")));
  assert.ok(result.commits.length >= 1, JSON.stringify(result.commits));
  assert.match(result.commits[0].text, /cache key/i);
});

test("find stops at stopwords and reports no match cleanly", () => {
  const project = tempDir("wb-find-empty-");
  mkdirSync(join(project, "docs"), { recursive: true });
  writeFileSync(join(project, "docs", "one.md"), "# One\n\nNothing relevant.\n");
  const result = findInProject(project, "why is this", { commits: false });
  assert.equal(result.total, 0);
});