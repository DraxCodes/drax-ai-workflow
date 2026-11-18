import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultSeam, validateSeam, DOC_KEYS } from "../tools/lib/seam.mjs";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./helpers.mjs";

const valid = () => ({
  schemaVersion: 1,
  base: { name: "drax-ai-workflow", version: "0.1.0" },
  project: "demo",
  workflows: ["council", "hillclimb"],
  checks: {
    build: { command: "npm run build", cwd: "." },
    test: { command: "npm test" },
    free: [],
    paid: [],
  },
  verify: {
    surface: "web",
    seed: "SEED",
    capture: "node shots.mjs",
    widths: [375, 900],
    themes: ["light", "dark"],
    notes: "",
  },
  docs: { issues: ".scratch", glossary: "GLOSSARY.md", adr: "docs/adr" },
  neverCommit: [".env"],
  packs: ["engineering"],
});

test("the shipped example validates", () => {
  const example = JSON.parse(
    readFileSync(join(repoRoot, "templates", "workflow.example.json"), "utf8"),
  );
  const { errors } = validateSeam(example);
  assert.deepEqual(errors, []);
});

test("defaultSeam validates", () => {
  const { errors } = validateSeam(defaultSeam({ project: "demo", baseVersion: "0.1.0" }));
  assert.deepEqual(errors, []);
});

test("every schema docs key is a known doc key", () => {
  const schema = JSON.parse(
    readFileSync(join(repoRoot, "schema", "workflow.schema.json"), "utf8"),
  );
  assert.deepEqual(
    Object.keys(schema.properties.docs.properties).sort(),
    [...DOC_KEYS].sort(),
  );
});

test("valid seam has no errors", () => {
  assert.deepEqual(validateSeam(valid()).errors, []);
});

test("unknown top-level key is rejected", () => {
  const seam = valid();
  seam.extra = true;
  assert.match(validateSeam(seam).errors.join("\n"), /seam\.extra: unknown key/);
});

test("unknown nested key is rejected", () => {
  const seam = valid();
  seam.checks.nightly = null;
  assert.match(validateSeam(seam).errors.join("\n"), /checks\.nightly: unknown key/);
});

test("web surface requires widths and themes", () => {
  const seam = valid();
  seam.verify.widths = [];
  seam.verify.themes = [];
  const { errors } = validateSeam(seam);
  assert.match(errors.join("\n"), /verify\.widths: required/);
  assert.match(errors.join("\n"), /verify\.themes: required/);
});

test("unknown workflow is rejected", () => {
  const seam = valid();
  seam.workflows = ["council", "party"];
  assert.match(validateSeam(seam).errors.join("\n"), /unknown workflow "party"/);
});

test("an empty command is rejected", () => {
  const seam = valid();
  seam.checks.test = { command: "" };
  assert.match(validateSeam(seam).errors.join("\n"), /checks\.test\.command/);
});

test("a rubric default validates, and unknown rubrics keys are rejected", () => {
  const seam = valid();
  seam.rubrics = { default: "performance" };
  assert.deepEqual(validateSeam(seam).errors, []);

  const bad = valid();
  bad.rubrics = { default: "perception", extra: true };
  assert.match(validateSeam(bad).errors.join("\n"), /rubrics\.extra: unknown key/);

  const empty = valid();
  empty.rubrics = { default: "" };
  assert.match(validateSeam(empty).errors.join("\n"), /rubrics\.default/);
});

test("the shipped rubric files exist and every one is named in the seam constant", () => {
  const dir = join(repoRoot, "skills", "hillclimb", "references", "rubrics");
  const names = readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.slice(0, -3))
    .sort();
  assert.deepEqual(names, ["completeness", "perception", "performance", "usability"]);
  for (const name of names) {
    const text = readFileSync(join(dir, `${name}.md`), "utf8");
    assert.ok(text.includes(`(\`${name}\`)`), `${name}.md names itself`);
    assert.match(text, /### 8 —/, `${name}.md defines the level-8 anchor`);
    assert.match(text, /Anti-inflation rules/, `${name}.md has anti-inflation rules`);
  }
});

test("build and test may both be null with a warning", () => {
  const seam = valid();
  seam.checks.build = null;
  seam.checks.test = null;
  const { errors, warnings } = validateSeam(seam);
  assert.deepEqual(errors, []);
  assert.match(warnings.join("\n"), /both build and test are null/);
});