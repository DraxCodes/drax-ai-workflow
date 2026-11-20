import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fixtureBase, repoRoot, tempDir } from "./helpers.mjs";
import { newRequirements, readRequirements } from "../tools/lib/requirements.mjs";
import { validateSeam } from "../tools/lib/seam.mjs";
import { compareVersions } from "../tools/lib/version.mjs";

function run(script, args) {
  return spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
}

function initProject(project) {
  mkdirSync(join(project, ".scratch"), { recursive: true });
  mkdirSync(join(project, "docs", "adr"), { recursive: true });
}

test("compareVersions orders numeric segments and ignores pre-release suffixes", () => {
  assert.equal(compareVersions("0.6.0", "0.5.4"), 1);
  assert.equal(compareVersions("0.5.4", "0.6.0"), -1);
  assert.equal(compareVersions("0.6.0", "0.6"), 0);
  assert.equal(compareVersions("0.6.0-rc.1", "0.6.0"), 0);
  assert.equal(compareVersions("v1.0.0", "0.9.9"), 1);
});

test("the shipped registry names every slot with a binding and a since version", () => {
  const { slots, error } = readRequirements(join(repoRoot, "tools", "requirements.json"));
  assert.equal(error, null);
  const ids = slots.map((slot) => slot.id);
  assert.ok(ids.includes("hillclimb.blindspot"));
  assert.ok(ids.includes("council.chair"));
  for (const slot of slots) {
    assert.equal(typeof slot.since, "string", `${slot.id} has a since`);
    assert.equal(typeof slot.bind.kind, "string", `${slot.id} has a bind kind`);
  }
});

test("newRequirements announces only slots introduced in the version range", () => {
  const slots = [
    { id: "old", since: "0.5.0" },
    { id: "new", since: "0.6.0" },
    { id: "future", since: "0.7.0" },
  ];
  assert.deepEqual(
    newRequirements("0.5.4", "0.6.0", slots).map((slot) => slot.id),
    ["new"],
  );
  assert.deepEqual(
    newRequirements("0.5.0", "0.7.0", slots).map((slot) => slot.id),
    ["new", "future"],
  );
  assert.deepEqual(newRequirements("0.6.0", "0.6.0", slots), []);
});

test("doctor warns for unbound slots and stays quiet when they are bound", () => {
  const base = fixtureBase();
  const project = tempDir("wb-req-doctor-");
  const home = tempDir("wb-home-");
  const tool = join(base, "tools", "base.mjs");

  const init = run(tool, ["init", project, "--from", base, "--project", "demo"]);
  assert.equal(init.status, 0, init.stdout + init.stderr);
  initProject(project);

  const config = {
    model: "test/base",
    agents: {
      "task-orchestrator": { model: "test/chair" },
      "plan-architect": { model: "test/plan" },
      "quality-gatekeeper": { model: "test/gate" },
      "security-auditor": { model: "test/risk" },
    },
  };
  writeFileSync(join(project, "opencode.json"), `${JSON.stringify(config, null, 2)}\n`);

  const seamFile = join(project, ".opencode", "workflow.json");
  const seam = JSON.parse(readFileSync(seamFile, "utf8"));
  seam.visualReview = { model: "test/visual" };
  writeFileSync(seamFile, `${JSON.stringify(seam, null, 2)}\n`);

  const bound = run(tool, ["doctor", project, "--home", home]);
  assert.doesNotMatch(bound.stdout, /requirements: .* is unbound/);

  delete config.agents["plan-architect"].model;
  delete seam.visualReview;
  writeFileSync(join(project, "opencode.json"), `${JSON.stringify(config, null, 2)}\n`);
  writeFileSync(seamFile, `${JSON.stringify(seam, null, 2)}\n`);

  const unbound = run(tool, ["doctor", project, "--home", home]);
  assert.match(
    unbound.stdout,
    /requirements: council\.shape is unbound; add agents\.plan-architect\.model to opencode\.json/,
  );
  assert.match(
    unbound.stdout,
    /requirements: hillclimb\.blindspot is unbound; add visualReview\.model to \.opencode\/workflow\.json/,
  );
  assert.doesNotMatch(unbound.stdout, /requirements: council\.chair is unbound/);
});

test("update announces a slot introduced in the incoming version", () => {
  const base = fixtureBase({ version: "0.1.0" });
  const project = tempDir("wb-req-update-");
  const tool = join(base, "tools", "base.mjs");

  const init = run(tool, ["init", project, "--from", base, "--project", "demo"]);
  assert.equal(init.status, 0, init.stdout + init.stderr);
  initProject(project);

  writeFileSync(
    join(base, "tools", "requirements.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        slots: [
          {
            id: "hillclimb.blindspot",
            since: "0.2.0",
            needs: { modality: ["text", "image"] },
            bind: { kind: "seam", path: "visualReview.model" },
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(join(base, "VERSION"), "0.2.0\n");
  writeFileSync(join(base, "agents", "task-orchestrator.md"), "# Orchestrator v2\n");

  const check = run(tool, ["update", project, "--from", base, "--check"]);
  assert.equal(check.status, 1, check.stdout + check.stderr);
  assert.match(check.stdout, /new model requirements \(0\.2\.0\)/);
  assert.match(check.stdout, /hillclimb\.blindspot \(text \+ image input\)/);

  const applied = run(tool, ["update", project, "--from", base]);
  assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  assert.match(applied.stdout, /new model requirements \(1\)/);
});

test("base requirements reports each slot's state, key and needs", () => {
  const base = fixtureBase();
  const project = tempDir("wb-req-cmd-");
  const tool = join(base, "tools", "base.mjs");

  const init = run(tool, ["init", project, "--from", base, "--project", "demo"]);
  assert.equal(init.status, 0, init.stdout + init.stderr);
  initProject(project);

  writeFileSync(
    join(project, "opencode.json"),
    `${JSON.stringify(
      {
        model: "test/base",
        agents: {
          "task-orchestrator": { model: "test/chair" },
          "plan-architect": { model: "<provider/model>" },
          "security-auditor": { model: "test/risk" },
        },
      },
      null,
      2,
    )}\n`,
  );
  const seamFile = join(project, ".opencode", "workflow.json");
  const seam = JSON.parse(readFileSync(seamFile, "utf8"));
  seam.visualReview = { model: "test/visual" };
  writeFileSync(seamFile, `${JSON.stringify(seam, null, 2)}\n`);

  const json = run(tool, ["requirements", project, "--json"]);
  assert.equal(json.status, 0, json.stdout + json.stderr);
  const report = JSON.parse(json.stdout);
  const byId = Object.fromEntries(report.slots.map((slot) => [slot.id, slot]));

  assert.equal(byId["council.chair"].state, "bound");
  assert.equal(byId["council.shape"].state, "placeholder");
  assert.equal(byId["council.experience"].state, "unbound");
  assert.equal(byId["council.risk"].state, "bound");
  assert.equal(byId["hillclimb.blindspot"].state, "bound");
  assert.equal(byId["hillclimb.blindspot"].key, "visualReview.model");
  assert.equal(byId["hillclimb.blindspot"].file, ".opencode/workflow.json");
  assert.ok(byId["hillclimb.blindspot"].needs.modality.includes("image"));
  assert.equal(byId["council.shape"].key, "agents.plan-architect.model");

  const text = run(tool, ["requirements", project]);
  assert.equal(text.status, 0, text.stdout + text.stderr);
  assert.match(text.stdout, /Model slots:/);
  assert.match(text.stdout, /council\.experience\s+unbound/);
  assert.match(text.stdout, /needs text \+ image input/);
});

test("the seam accepts visualReview and rejects an empty model", () => {
  const seam = {
    schemaVersion: 1,
    base: { name: "drax-ai-workflow", version: "0.1.0" },
    project: "demo",
    checks: { build: null, test: null, free: [], paid: [] },
  };
  assert.deepEqual(
    validateSeam({ ...seam, visualReview: { model: "surplus/glm-5.3-flash" } }).errors,
    [],
  );
  assert.match(
    validateSeam({ ...seam, visualReview: { notes: "x" } }).errors.join("\n"),
    /visualReview\.model/,
  );
  assert.match(
    validateSeam({ ...seam, visualReview: { model: "x", extra: true } }).errors.join("\n"),
    /visualReview\.extra: unknown key/,
  );
});