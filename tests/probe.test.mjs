import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { defaultSeam } from "../tools/lib/seam.mjs";
import { probeSlot } from "../tools/lib/probe.mjs";
import { listRuns } from "../tools/lib/runs.mjs";
import { tempDir } from "./helpers.mjs";

function fixture({ model = "test/model-a", cost = { input: 0.1, output: 0.2 } } = {}) {
  const project = tempDir("wb-probe-");
  mkdirSync(join(project, ".opencode"), { recursive: true });
  writeFileSync(
    join(project, ".opencode", "workflow.json"),
    `${JSON.stringify(defaultSeam({ project: "demo", baseVersion: "0.7.0" }), null, 2)}\n`,
  );
  writeFileSync(
    join(project, "opencode.json"),
    `${JSON.stringify(
      {
        provider: {
          test: {
            settings: { baseURL: "http://provider.test", apiKey: "test" },
            models: { "model-a": { cost } },
          },
        },
        agents: {
          "task-orchestrator": { model },
          "plan-architect": { model },
          "quality-gatekeeper": { model },
          "security-auditor": { model },
        },
      },
      null,
      2,
    )}\n`,
  );
  return project;
}

function fakeFetch() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const prompt = JSON.stringify(body.messages);
    let payload;
    if (Array.isArray(body.tools)) {
      payload = {
        choices: [
          {
            message: {
              tool_calls: [{ id: "t1", type: "function", function: { name: "echo", arguments: "{\"value\":7}" } }],
            },
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 4 },
      };
    } else if (prompt.includes("JSON")) {
      payload = {
        choices: [{ message: { content: '{"ok":true,"count":3}' } }],
        usage: { prompt_tokens: 20, completion_tokens: 8 },
      };
    } else if (prompt.includes("solid color")) {
      payload = {
        choices: [{ message: { content: "red" } }],
        usage: { prompt_tokens: 30, completion_tokens: 1 },
      };
    } else {
      payload = {
        choices: [{ message: { content: "OK" } }],
        usage: { prompt_tokens: 10, completion_tokens: 1 },
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(payload),
    };
  };
  return { fetchImpl, calls };
}

test("probe runs text, JSON and tool cases and records the run", async () => {
  const project = fixture();
  const { fetchImpl, calls } = fakeFetch();
  const result = await probeSlot({
    projectDir: project,
    slotId: "council.shape",
    flags: { suite: "text,json,tool", budgetUsd: 0.05 },
    fetchImpl,
  });

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.results.length, 3);
  assert.deepEqual(result.results.map((entry) => entry.status), ["passed", "passed", "passed"]);
  assert.equal(calls.length, 3);
  assert.ok(result.spentUsd > 0);
  assert.equal(listRuns(project).runs.length, 1);
  assert.equal(listRuns(project).runs[0].kind, "probe");
});

test("probe adds an image case when the slot needs image input", async () => {
  const project = fixture({ model: "test/model-a" });
  const { fetchImpl } = fakeFetch();
  const result = await probeSlot({
    projectDir: project,
    slotId: "council.experience",
    flags: { budgetUsd: 0.05 },
    fetchImpl,
  });

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(result.suite.includes("image"));
  assert.equal(result.results.find((entry) => entry.name === "image").status, "passed");
});

test("probe dry run resolves the suite without a call or a price", async () => {
  const project = fixture();
  const result = await probeSlot({
    projectDir: project,
    slotId: "council.shape",
    flags: { dryRun: true },
    fetchImpl: async () => {
      throw new Error("must not call");
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.ok(result.suite.includes("text"));
});

test("probe refuses a real run without a price or a budget", async () => {
  const project = fixture({ cost: null });
  const noPrice = await probeSlot({
    projectDir: project,
    slotId: "council.shape",
    flags: { budgetUsd: 0.05 },
    fetchImpl: async () => {
      throw new Error("must not call");
    },
  });
  assert.equal(noPrice.ok, false);
  assert.match(noPrice.error, /no declared price/);

  const priced = fixture();
  const noBudget = await probeSlot({
    projectDir: priced,
    slotId: "council.shape",
    flags: { budgetUsd: 0 },
    fetchImpl: async () => {
      throw new Error("must not call");
    },
  });
  assert.equal(noBudget.ok, false);
  assert.match(noBudget.error, /budget-usd/);
});