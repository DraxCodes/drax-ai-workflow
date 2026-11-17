import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyPlan } from "../tools/lib/apply.mjs";
import { tempDir } from "./helpers.mjs";

test("applyPlan writes, deletes and backs up", () => {
  const dir = tempDir();
  const agents = join(dir, ".opencode", "agents");
  mkdirSync(agents, { recursive: true });
  writeFileSync(join(agents, "a.md"), "old");
  writeFileSync(join(agents, "c.md"), "gone");

  const result = applyPlan(dir, {
    writes: [
      { path: ".opencode/agents/a.md", content: "new" },
      { path: ".opencode/agents/b.md", content: "b" },
    ],
    deletes: [".opencode/agents/c.md"],
    conflicts: [],
  });

  assert.equal(readFileSync(join(agents, "a.md"), "utf8"), "new");
  assert.equal(readFileSync(join(agents, "b.md"), "utf8"), "b");
  assert.equal(existsSync(join(agents, "c.md")), false);
  assert.ok(result.backupDir);
  assert.equal(
    readFileSync(join(result.backupDir, ".opencode", "agents", "a.md"), "utf8"),
    "old",
  );
});

test("applyPlan refuses a plan with conflicts", () => {
  assert.throws(
    () => applyPlan(tempDir(), { writes: [], deletes: [], conflicts: ["nope"] }),
    /unresolved conflicts/,
  );
});

test("applyPlan rolls back when a write fails", () => {
  const dir = tempDir();
  const agents = join(dir, ".opencode", "agents");
  mkdirSync(join(agents, "x.md"), { recursive: true });

  assert.throws(() =>
    applyPlan(dir, {
      writes: [
        { path: ".opencode/agents/a.md", content: "a" },
        { path: ".opencode/agents/x.md", content: "x" },
      ],
      deletes: [],
      conflicts: [],
    }),
  );

  assert.equal(existsSync(join(agents, "a.md")), false);
});

test("applyPlan dry-run writes nothing", () => {
  const dir = tempDir();
  const logs = [];
  const result = applyPlan(
    dir,
    { writes: [{ path: ".opencode/agents/a.md", content: "a" }], deletes: [], conflicts: [] },
    { dryRun: true, log: (line) => logs.push(line) },
  );
  assert.equal(result.dryRun, true);
  assert.equal(existsSync(join(dir, ".opencode", "agents", "a.md")), false);
  assert.match(logs.join("\n"), /would write \.opencode\/agents\/a\.md/);
});