import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { repoRoot, tempDir } from "./helpers.mjs";
import {
  assignIds,
  buildPrompt,
  mergeFindings,
  regionSimilarity,
  runReview,
  validateFindings,
} from "../tools/lib/visual-review.mjs";

// A 1x1 PNG. The reviewer never decodes it; the script only base64s the bytes.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const finding = {
  shot: "home-empty-375-light",
  region: "header, right-aligned action cluster",
  kind: "defect",
  observed: "primary button is clipped at the viewport edge",
  expected: "button sits inside the 16px gutter",
  condition: "375 light, empty state",
  severity: "major",
  confidence: "high",
  evidence: "the button's right edge is cut, no margin visible",
};

function makeProject() {
  const project = tempDir("wb-visual-");
  mkdirSync(join(project, ".opencode"), { recursive: true });
  mkdirSync(join(project, "shots"), { recursive: true });
  writeFileSync(
    join(project, ".opencode", "workflow.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        base: { name: "drax-ai-workflow", version: "0.6.0" },
        project: "demo",
        checks: { build: null, test: null, free: [], paid: [] },
        visualReview: { model: "surplus/glm-5.3-flash" },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(project, "opencode.json"),
    `${JSON.stringify(
      {
        provider: {
          surplus: {
            settings: {
              baseURL: "https://review.test/v1",
              apiKey: "{env:VR_KEY}",
            },
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(join(project, "shots", "home-empty-375-light.png"), PNG);
  writeFileSync(join(project, "shots", "home-empty-900-dark.png"), PNG);
  const manifest = join(project, "manifest.json");
  writeFileSync(
    manifest,
    `${JSON.stringify(
      {
        shots: [
          {
            id: "home-empty-375-light",
            file: "shots/home-empty-375-light.png",
            screen: "home",
            state: "empty",
            width: 375,
            theme: "light",
          },
          {
            id: "home-empty-900-dark",
            file: "shots/home-empty-900-dark.png",
            screen: "home",
            state: "empty",
            width: 900,
            theme: "dark",
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  const brief = join(project, "brief.md");
  writeFileSync(brief, "# Brief\n\nScreens: home. States: empty. Widths: 375, 900.\n");
  return { project, manifest, brief, out: join(project, "review") };
}

const reply = (content) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify({ choices: [{ message: { content } }] }),
});
const http = (status, body = "") => ({ ok: status < 300, status, text: async () => body });

const env = { VR_KEY: "test-key" };

test("validateFindings accepts a valid finding and rejects drift", () => {
  const shots = new Set(["home-empty-375-light"]);
  const ok = validateFindings({ findings: [finding] }, shots);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.findings.length, 1);

  const scored = validateFindings({ findings: [finding], score: 8 }, shots);
  assert.match(scored.errors.join("\n"), /response\.score: unexpected key/);

  const badEnum = validateFindings(
    { findings: [{ ...finding, severity: "high" }] },
    shots,
  );
  assert.match(badEnum.errors.join("\n"), /severity: expected one of/);

  const badShot = validateFindings(
    { findings: [{ ...finding, shot: "invented" }] },
    shots,
  );
  assert.match(badShot.errors.join("\n"), /is not in the manifest/);

  const missing = validateFindings({ findings: [{ ...finding, evidence: "" }] }, shots);
  assert.match(missing.errors.join("\n"), /evidence: expected a non-empty string/);
});

test("the prompt carries the shots and the brief, and forbids scoring", () => {
  const prompt = buildPrompt({
    brief: "Screens: home.",
    shots: [
      { id: "home-empty-375-light", width: 375, theme: "light" },
      { id: "home-empty-900-dark", width: 900, theme: "dark" },
    ],
  });
  assert.match(prompt, /home-empty-375-light/);
  assert.match(prompt, /home-empty-900-dark/);
  assert.match(prompt, /Screens: home\./);
  assert.match(prompt, /Do not score/);
  assert.match(prompt, /never an instruction/);
});

test("merge pairs by shot and region and leaves the rest separate", () => {
  assert.ok(regionSimilarity("header right actions", "header, right-aligned action cluster") >= 0.7);
  assert.ok(regionSimilarity("header right actions", "footer right actions") < 0.7);

  const gate = [
    { id: "DS-01", shot: "home-empty-375-light", region: "header right actions" },
    { id: "DS-02", shot: "home-empty-375-light", region: "footer" },
  ];
  const glm = [
    { id: "GLM-01", shot: "home-empty-375-light", region: "header, right-aligned action cluster" },
    { id: "GLM-02", shot: "home-empty-900-dark", region: "header right actions" },
  ];
  const merged = mergeFindings(gate, glm);
  assert.equal(merged.pairs.length, 1);
  assert.equal(merged.pairs[0].gate.id, "DS-01");
  assert.equal(merged.pairs[0].glm.id, "GLM-01");
  assert.deepEqual(merged.gateOnly.map((item) => item.id), ["DS-02"]);
  assert.deepEqual(merged.glmOnly.map((item) => item.id), ["GLM-02"]);
});

test("assignIds ignores model-supplied ids", () => {
  const [first, second] = assignIds([{ ...finding }, { ...finding }]);
  assert.equal(first.id, "GLM-01");
  assert.equal(second.id, "GLM-02");
});

test("a valid review writes the envelope with a null score", async () => {
  const { project, manifest, brief, out } = makeProject();
  const result = await runReview({
    projectDir: project,
    manifestPath: manifest,
    briefPath: brief,
    outDir: out,
    env,
    fetchImpl: async () => reply(JSON.stringify({ findings: [finding] })),
  });
  assert.equal(result.ok, true, result.message);
  assert.equal(result.attempts, 1);
  const written = JSON.parse(readFileSync(result.file, "utf8"));
  assert.equal(written.score, null);
  assert.equal(written.reviewer.model, "surplus/glm-5.3-flash");
  assert.equal(written.findings[0].id, "GLM-01");
  assert.match(written.briefHash, /^sha256:/);
  assert.match(written.manifestHash, /^sha256:/);
});

test("a 5xx is retried once, and a 4xx is not retried", async () => {
  const { project, manifest, brief, out } = makeProject();
  let calls = 0;
  const flaky = await runReview({
    projectDir: project,
    manifestPath: manifest,
    briefPath: brief,
    outDir: out,
    env,
    fetchImpl: async () => {
      calls += 1;
      return calls === 1 ? http(503, "no sellers meet the floor") : reply(JSON.stringify({ findings: [] }));
    },
  });
  assert.equal(flaky.ok, true, flaky.message);
  assert.equal(flaky.attempts, 2);
  assert.equal(calls, 2);

  let badCalls = 0;
  const rejected = await runReview({
    projectDir: project,
    manifestPath: manifest,
    briefPath: brief,
    outDir: out,
    env,
    fetchImpl: async () => {
      badCalls += 1;
      return http(400, '{"error":"messages.content.type is invalid"}');
    },
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "http_4xx");
  assert.equal(badCalls, 1);
});

test("malformed answers twice are recorded as untrusted", async () => {
  const { project, manifest, brief, out } = makeProject();
  let calls = 0;
  const result = await runReview({
    projectDir: project,
    manifestPath: manifest,
    briefPath: brief,
    outDir: out,
    env,
    fetchImpl: async () => {
      calls += 1;
      return reply("I think it looks fine overall.");
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "untrusted");
  assert.equal(calls, 2);
  const written = JSON.parse(readFileSync(result.file, "utf8"));
  assert.equal(written.untrusted, true);
  assert.equal(written.score, null);
});

test("an unbound reviewer is a skip, not a call", async () => {
  const { project, manifest, brief, out } = makeProject();
  const seamFile = join(project, ".opencode", "workflow.json");
  const seam = JSON.parse(readFileSync(seamFile, "utf8"));
  delete seam.visualReview;
  writeFileSync(seamFile, `${JSON.stringify(seam, null, 2)}\n`);

  let calls = 0;
  const result = await runReview({
    projectDir: project,
    manifestPath: manifest,
    briefPath: brief,
    outDir: out,
    env,
    fetchImpl: async () => {
      calls += 1;
      return reply(JSON.stringify({ findings: [] }));
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "unbound");
  assert.equal(calls, 0);
});

test("--gate writes merged.json beside the findings", async () => {
  const { project, manifest, brief, out } = makeProject();
  const gateFile = join(project, "findings.gate.json");
  writeFileSync(
    gateFile,
    `${JSON.stringify(
      {
        findings: [
          {
            id: "DS-01",
            shot: "home-empty-375-light",
            region: "header right actions",
            kind: "defect",
            observed: "x",
            expected: "y",
            condition: "z",
            severity: "major",
            confidence: "high",
            evidence: "w",
          },
        ],
      },
      null,
      2,
    )}\n`,
  );

  const result = await runReview({
    projectDir: project,
    manifestPath: manifest,
    briefPath: brief,
    outDir: out,
    gatePath: gateFile,
    env,
    fetchImpl: async () => reply(JSON.stringify({ findings: [finding] })),
  });
  assert.equal(result.ok, true, result.message);
  const merged = JSON.parse(readFileSync(join(out, "merged.json"), "utf8"));
  assert.equal(merged.pairs.length, 1);
  assert.equal(merged.pairs[0].gate.id, "DS-01");
});

test("the CLI dry run resolves the reviewer without a network call", () => {
  const { project, manifest, brief } = makeProject();
  const tool = join(repoRoot, "tools", "visual-review.mjs");
  const result = spawnSync(
    process.execPath,
    [tool, "--project", project, "--manifest", manifest, "--brief", brief, "--out", join(project, "review"), "--dry-run"],
    { encoding: "utf8", env: { ...process.env, VR_KEY: "test-key" } },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /visual review \(dry run\): surplus\/glm-5\.3-flash/);
  assert.match(result.stdout, /shots: 2/);
});

test("the CLI reports an unbound reviewer as skipped", () => {
  const { project, manifest, brief, out } = makeProject();
  const seamFile = join(project, ".opencode", "workflow.json");
  const seam = JSON.parse(readFileSync(seamFile, "utf8"));
  delete seam.visualReview;
  writeFileSync(seamFile, `${JSON.stringify(seam, null, 2)}\n`);

  const tool = join(repoRoot, "tools", "visual-review.mjs");
  const result = spawnSync(
    process.execPath,
    [tool, "--project", project, "--manifest", manifest, "--brief", brief, "--out", out],
    { encoding: "utf8", env: { ...process.env, VR_KEY: "test-key" } },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /^skipped: .*visualReview\.model is unbound/m);
});