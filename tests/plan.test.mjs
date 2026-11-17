import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  extractBlock,
  removeBlock,
  upsertBlock,
} from "../tools/lib/manifest.mjs";
import { planCheck } from "../tools/lib/plan.mjs";
import { sha256 } from "../tools/lib/hash.mjs";
import { blockText, tempDir } from "./helpers.mjs";

const block = blockText.replace("{{version}}", "0.1.0");

test("upsertBlock appends to a new or non-empty file", () => {
  const fromEmpty = upsertBlock("", block);
  assert.equal(fromEmpty, `${block}\n`);

  const fromProse = upsertBlock("# Project\n\nOwn text.\n", block);
  assert.match(fromProse, /^# Project\n\nOwn text\.\n\n<!-- workflow-base:begin -->/);
  assert.match(fromProse, /<!-- workflow-base:end -->\n$/);
});

test("upsertBlock replaces an existing block in place", () => {
  const first = upsertBlock("# Project\n", block);
  const second = upsertBlock(first, block.replace("0.1.0", "0.2.0"));
  assert.equal((second.match(/workflow-base:begin/g) ?? []).length, 1);
  assert.match(second, /0\.2\.0/);
  assert.doesNotMatch(second, /0\.1\.0/);
  assert.match(second, /^# Project/);
});

test("upsertBlock preserves CRLF files", () => {
  const crlf = "# Project\r\n\r\nText.\r\n";
  const out = upsertBlock(crlf, block);
  assert.ok(out.includes("\r\n"));
  assert.ok(!/[^\r]\n/.test(out), "every newline is CRLF");
});

test("upsertBlock refuses half a block", () => {
  assert.throws(
    () => upsertBlock("<!-- workflow-base:begin -->\nno end\n", block),
    /one workflow-base marker/,
  );
});

test("extractBlock and removeBlock round-trip", () => {
  const withBlock = upsertBlock("# Project\n", block);
  assert.equal(extractBlock(withBlock), block);
  assert.equal(removeBlock(withBlock).trim(), "# Project");
  assert.equal(removeBlock("# Project\n"), "# Project\n");
});

test("planCheck reports changed, missing and clean files", () => {
  const dir = tempDir();
  mkdirSync(join(dir, ".opencode", "agents"), { recursive: true });
  writeFileSync(join(dir, ".opencode", "agents", "a.md"), "same");
  writeFileSync(join(dir, ".opencode", "agents", "b.md"), "changed");

  const manifest = {
    version: "0.1.0",
    files: {
      ".opencode/agents/a.md": sha256("same"),
      ".opencode/agents/b.md": sha256("original"),
      ".opencode/agents/c.md": sha256("gone"),
    },
  };

  const result = planCheck({
    projectDir: dir,
    oldManifest: manifest,
    seamVersion: "0.1.0",
  });
  assert.deepEqual(result.clean, [".opencode/agents/a.md"]);
  assert.deepEqual(result.changed, [".opencode/agents/b.md"]);
  assert.deepEqual(result.missing, [".opencode/agents/c.md"]);
  assert.deepEqual(result.extra, []);
  assert.deepEqual(result.problems, []);
});

test("planCheck reports unowned extra files", () => {
  const dir = tempDir();
  mkdirSync(join(dir, ".opencode", "agents"), { recursive: true });
  writeFileSync(join(dir, ".opencode", "agents", "a.md"), "same");
  writeFileSync(join(dir, ".opencode", "agents", "bespoke.md"), "project addition");

  const result = planCheck({
    projectDir: dir,
    oldManifest: {
      version: "0.1.0",
      files: { ".opencode/agents/a.md": sha256("same") },
    },
    seamVersion: "0.1.0",
  });
  assert.deepEqual(result.extra, [".opencode/agents/bespoke.md"]);
});

test("planCheck reports a seam/manifest version mismatch", () => {
  const result = planCheck({
    projectDir: tempDir(),
    oldManifest: { version: "0.1.0", files: {} },
    seamVersion: "0.2.0",
  });
  assert.match(result.problems.join("\n"), /seam pins 0\.2\.0/);
});