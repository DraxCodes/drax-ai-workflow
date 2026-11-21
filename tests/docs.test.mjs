import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { checkAdrStatus, checkDocLinks, checkDocs } from "../tools/lib/docs.mjs";
import { tempDir } from "./helpers.mjs";

function project() {
  const dir = tempDir("wb-docs-");
  mkdirSync(join(dir, "docs", "notes"), { recursive: true });
  mkdirSync(join(dir, "docs", "adr"), { recursive: true });
  writeFileSync(join(dir, "AGENTS.md"), "# Project\n\nRead [the notes](docs/notes/README.md).\n");
  writeFileSync(join(dir, "docs", "notes", "README.md"), "# Notes\n\nSee [the ADR](../adr/0001-one.md).\n");
  writeFileSync(
    join(dir, "docs", "adr", "0001-one.md"),
    "# 0001 — One\n\n**Status:** accepted (2026-11-21)\n\n## Decision\n\nOne.\n",
  );
  return dir;
}

test("doc links resolve relative paths and ignore URLs, anchors and code", () => {
  const dir = project();
  writeFileSync(
    join(dir, "AGENTS.md"),
    [
      "# Project",
      "[notes](docs/notes/README.md)",
      "[missing](docs/notes/missing.md)",
      "[external](https://example.com/nope)",
      "[anchor](#section)",
      "`[code](docs/nope.md)`",
      "```md",
      "[fenced](docs/nope.md)",
      "```",
    ].join("\n"),
  );

  const result = checkDocLinks(dir);
  assert.equal(result.broken.length, 1);
  assert.match(result.broken[0].target, /missing\.md/);
  assert.ok(result.checked >= 2);
});

test("doc links accept directories and fragment-only suffixes", () => {
  const dir = project();
  writeFileSync(
    join(dir, "AGENTS.md"),
    "[adr](docs/adr) [one](docs/adr/0001-one.md#decision)\n",
  );
  assert.deepEqual(checkDocLinks(dir).broken, []);
});

test("ADR status and filename are checked", () => {
  const dir = project();
  writeFileSync(
    join(dir, "docs", "adr", "0002-bad.md"),
    "# 0002 — Bad\n\n**Status:** maybe\n",
  );
  writeFileSync(join(dir, "docs", "adr", "not-numbered.md"), "# No number\n\n**Status:** accepted\n");
  writeFileSync(join(dir, "docs", "adr", "README.md"), "# Index\n");
  const result = checkAdrStatus(dir);
  assert.equal(result.checked, 3);
  assert.ok(result.issues.some((issue) => issue.reason.includes("unknown status")));
  assert.ok(result.issues.some((issue) => issue.reason.includes("NNNN-slug.md")));
});

test("checkDocs combines links and ADR status without failing on a clean project", () => {
  const dir = project();
  const result = checkDocs(dir);
  assert.deepEqual(result.links.broken, []);
  assert.deepEqual(result.adr.issues, []);
  assert.ok(existsSync(join(dir, "docs", "notes", "README.md")));
});