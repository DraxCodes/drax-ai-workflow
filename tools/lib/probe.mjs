import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { costOf, priceFor, readPrices } from "./benchmark.mjs";
import { readManifest } from "./manifest.mjs";
import { loadSeam } from "./seam.mjs";
import { bindingFor, loadProjectRequirements } from "./requirements.mjs";
import { callProvider, resolveReviewer } from "./visual-review.mjs";
import { recordRun } from "./runs.mjs";

const DEFAULT_BUDGET_USD = 0.05;
const DEFAULT_MAX_TOKENS = 200;
const DEFAULT_TIMEOUT_MS = 60000;

// 1x1 red PNG. The probe asks for the dominant color, not a description.
const RED_PIXEL =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function readJson(file) {
  try {
    return { value: JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, "")), error: null };
  } catch (error) {
    return { value: null, error };
  }
}

function selectorFrom(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || /^<.*>$/.test(trimmed)) return null;
    return trimmed;
  }
  if (value && typeof value === "object" && typeof value.model === "string") {
    return `${value.providerID ?? "unknown"}/${value.model}`;
  }
  return null;
}

function parseResponse(text) {
  const raw = String(text ?? "").replace(/^\uFEFF/, "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    /* fall through */
  }
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      /* fall through */
    }
  }
  return null;
}

function usageTokens(usage) {
  if (!usage || typeof usage !== "object") return null;
  const input = usage.prompt_tokens ?? usage.input_tokens;
  const output = usage.completion_tokens ?? usage.output_tokens;
  if (!Number.isFinite(input) || !Number.isFinite(output)) return null;
  return { input, output };
}

function textBody(model, prompt, maxTokens) {
  return {
    model,
    max_tokens: maxTokens,
    temperature: 0,
    messages: [{ role: "user", content: prompt }],
  };
}

function toolBody(model, maxTokens) {
  return {
    model,
    max_tokens: maxTokens,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: "Call the echo tool with value 7. Do not answer in prose.",
      },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "echo",
          description: "Echo a value.",
          parameters: {
            type: "object",
            properties: { value: { type: "number" } },
            required: ["value"],
          },
        },
      },
    ],
    tool_choice: "auto",
  };
}

function imageBody(model, maxTokens) {
  return {
    model,
    max_tokens: maxTokens,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "The image is a single solid color. Answer with one word: red, green or blue.",
          },
          { type: "image_url", image_url: { url: `data:image/png;base64,${RED_PIXEL}` } },
        ],
      },
    ],
  };
}

function longBody(model, maxTokens) {
  const filler = Array.from(
    { length: 250 },
    (_, index) => `Line ${index + 1}: the quick brown fox jumps over the lazy dog.`,
  ).join("\n");
  return textBody(
    model,
    `${filler}\n\nThe passphrase is ORCHID-42. Reply with the passphrase only.`,
    maxTokens,
  );
}

const CASES = {
  text: {
    name: "text",
    prompt: "Reply with the single word OK.",
    body: (model, maxTokens) => textBody(model, "Reply with the single word OK.", maxTokens),
    check: (result) => /\bOK\b/i.test(result.content ?? ""),
    detail: "expected OK",
  },
  json: {
    name: "json",
    body: (model, maxTokens) =>
      textBody(
        model,
        'Return exactly this JSON object and nothing else: {"ok":true,"count":3}',
        maxTokens,
      ),
    check: (result) => {
      const value = parseResponse(result.content);
      return value?.ok === true && value?.count === 3;
    },
    detail: "expected {\"ok\":true,\"count\":3}",
  },
  tool: {
    name: "tool",
    body: (model, maxTokens) => toolBody(model, maxTokens),
    check: (result) => {
      const value = parseResponse(result.raw);
      const calls = value?.choices?.[0]?.message?.tool_calls;
      return Array.isArray(calls) && calls.length > 0;
    },
    detail: "expected a tool call",
    unsupported: (status) => status === 400 || status === 422,
  },
  image: {
    name: "image",
    body: (model, maxTokens) => imageBody(model, maxTokens),
    check: (result) => /\bred\b/i.test(result.content ?? ""),
    detail: "expected red",
    unsupported: (status) => status === 400 || status === 422,
  },
  long: {
    name: "long-context",
    body: (model, maxTokens) => longBody(model, maxTokens),
    check: (result) => /ORCHID-42/i.test(result.content ?? ""),
    detail: "expected ORCHID-42",
  },
};

function suiteFor(slot, flags) {
  const suite = ["text", "json", "tool"];
  const modality = slot?.needs?.modality ?? [];
  if (modality.includes("image")) suite.push("image");
  if (flags.long || flags.full) suite.push("long");
  if (flags.suite) {
    return String(flags.suite)
      .split(",")
      .map((name) => name.trim())
      .filter((name) => CASES[name]);
  }
  return suite;
}

export function resolveProbeSlot(projectDir, slotId, env = process.env) {
  const { seam, errors } = loadSeam(projectDir);
  if (!seam) return { error: errors.join("; ") };
  const { slots, error } = loadProjectRequirements(projectDir);
  if (error) return { error };
  const slot = slots.find((entry) => entry.id === slotId);
  if (!slot) {
    return {
      error: `unknown slot "${slotId}" (known: ${slots.map((entry) => entry.id).join(", ")})`,
    };
  }
  const configFile = join(projectDir, "opencode.json");
  const config = existsSync(configFile) ? readJson(configFile).value : null;
  const selector = selectorFrom(bindingFor(slot, seam, config).value);
  if (!selector) {
    return { error: `${slot.id} is unbound; bind it before probing` };
  }
  const reviewer = resolveReviewer(projectDir, env, selector);
  if (reviewer.error) return { error: reviewer.error };
  return { slot, selector, reviewer, config, project: seam.project };
}

async function runCase({
  name,
  reviewer,
  maxTokens,
  timeoutMs,
  fetchImpl,
  price,
  spent,
  budgetUsd,
}) {
  const entry = CASES[name];
  if (spent >= budgetUsd) {
    return {
      name: entry.name,
      status: "skipped",
      detail: `budget $${budgetUsd} exhausted before the call`,
      costUsd: 0,
    };
  }
  let response;
  try {
    response = await callProvider({
      fetchImpl,
      baseURL: reviewer.baseURL,
      apiKey: reviewer.apiKey,
      body: entry.body(reviewer.model, maxTokens),
      timeoutMs,
    });
  } catch (error) {
    return {
      name: entry.name,
      status: "failed",
      detail: `network: ${error.message}`,
      costUsd: 0,
    };
  }

  const cost = costOf(response.usage, price);
  const base = {
    name: entry.name,
    latencyMs: response.latencyMs,
    costUsd: cost,
    tokens: usageTokens(response.usage),
  };
  if (!response.ok) {
    const unsupported = entry.unsupported?.(response.status);
    return {
      ...base,
      status: unsupported ? "unsupported" : "failed",
      detail: `HTTP ${response.status}`,
    };
  }
  const result = { content: response.content, raw: response.text };
  return entry.check(result)
    ? { ...base, status: "passed", detail: entry.detail }
    : { ...base, status: "failed", detail: entry.detail };
}

export async function probeSlot({
  projectDir,
  slotId,
  flags = {},
  env = process.env,
  fetchImpl = globalThis.fetch,
}) {
  const resolved = resolveProbeSlot(projectDir, slotId, env);
  if (resolved.error) return { ok: false, error: resolved.error };

  const { slot, selector, reviewer, project } = resolved;
  const suite = suiteFor(slot, flags);
  const maxTokens = Number(flags.maxTokens ?? DEFAULT_MAX_TOKENS);
  const timeoutMs = Number(flags.timeout ?? DEFAULT_TIMEOUT_MS);
  const budgetUsd = Number(flags.budgetUsd ?? DEFAULT_BUDGET_USD);
  const dryRun = Boolean(flags.dryRun);

  const { prices, error: priceError } = readPrices(
    projectDir,
    flags.prices ? String(flags.prices) : null,
  );
  if (priceError) return { ok: false, error: priceError };
  const price = priceFor(prices, selector);
  if (!dryRun) {
    if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) {
      return { ok: false, error: "pass --budget-usd <usd> (a hard cap; there is no default spend)" };
    }
    if (!price) {
      return {
        ok: false,
        error: `${selector}: no declared price; add cost to opencode.json or pass --prices`,
      };
    }
  }

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      slot: slot.id,
      selector,
      suite,
      budgetUsd,
      maxTokens,
      price,
    };
  }

  const results = [];
  let spent = 0;
  for (const name of suite) {
    const result = await runCase({
      name,
      reviewer,
      maxTokens,
      timeoutMs,
      fetchImpl,
      price,
      spent,
      budgetUsd,
    });
    results.push(result);
    spent += result.costUsd ?? 0;
  }

  const failed = results.filter((result) => result.status === "failed");
  const passed = results.filter((result) => result.status === "passed");
  const status = failed.length > 0 ? "failed" : passed.length > 0 ? "passed" : "skipped";
  const usage = {
    costUsd: Number(spent.toFixed(6)),
    inputTokens: results.reduce((sum, result) => sum + (result.tokens?.input ?? 0), 0),
    outputTokens: results.reduce((sum, result) => sum + (result.tokens?.output ?? 0), 0),
  };

  try {
    const manifest = readManifest(projectDir);
    recordRun(projectDir, {
      kind: "probe",
      status,
      base: {
        name: "drax-ai-workflow",
        version: manifest?.version ?? "unknown",
        commit: manifest?.commit ?? null,
      },
      project: project ?? slot.id,
      task: slot.id,
      models: [selector],
      verdict: status.toUpperCase(),
      scores: {
        passed: passed.length,
        failed: failed.length,
        skipped: results.filter((result) => result.status === "skipped").length,
      },
      usage,
      notes: results.map((result) => `${result.name}: ${result.status}`).join(", "),
    });
  } catch {
    // The probe result matters more than its ledger entry.
  }

  return {
    ok: failed.length === 0,
    slot: slot.id,
    selector,
    suite,
    budgetUsd,
    spentUsd: usage.costUsd,
    results,
    usage,
  };
}

export { DEFAULT_BUDGET_USD };