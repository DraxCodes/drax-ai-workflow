import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compareVersions } from "./version.mjs";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The base publishes which model slots a project must bind, but never which
 * model fills them. A slot with no binding is drift: the agent silently falls
 * back to the root model, or the capability is skipped.
 */
export function readRequirements(file) {
  if (!existsSync(file)) {
    return { slots: [], error: `requirements: ${file} is missing` };
  }
  let value;
  try {
    value = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    return { slots: [], error: `requirements: ${error.message}` };
  }
  if (!value || !Array.isArray(value.slots)) {
    return { slots: [], error: "requirements: expected a slots array" };
  }
  const slots = value.slots.filter(
    (slot) => slot && typeof slot.id === "string" && slot.bind && typeof slot.bind.kind === "string",
  );
  return { slots, error: null };
}

/**
 * A project's vendored copy is authoritative for that project: it names only
 * the slots that version knows about. The module-relative file is the fallback
 * for the base checkout and for fixtures that vendor the tools.
 */
export function loadProjectRequirements(projectDir) {
  const vendored = join(projectDir, ".opencode", "tools", "requirements.json");
  const fallback = join(here, "..", "requirements.json");
  return readRequirements(existsSync(vendored) ? vendored : fallback);
}

/** The registry of the base being installed, not of the project being updated. */
export function loadBaseRequirements(baseRoot) {
  return readRequirements(join(baseRoot, "tools", "requirements.json"));
}

export function getPath(value, path) {
  return String(path)
    .split(".")
    .reduce((current, key) => (current && typeof current === "object" ? current[key] : undefined), value);
}

function isBound(value) {
  if (typeof value === "string") return value.trim().length > 0;
  if (value && typeof value === "object") {
    return typeof value.providerID === "string" && typeof value.model === "string";
  }
  return false;
}

export function bindingFor(slot, seam, config) {
  if (slot.bind.kind === "agent") {
    const agent = slot.bind.agent;
    return {
      file: "opencode.json",
      label: `agents.${agent}.model`,
      value: config?.agents?.[agent]?.model,
    };
  }
  if (slot.bind.kind === "seam") {
    return {
      file: ".opencode/workflow.json",
      label: slot.bind.path,
      value: getPath(seam, slot.bind.path),
    };
  }
  return { file: "(unknown)", label: slot.id, value: undefined };
}

const MODEL_FAMILIES = [
  [/^(?:claude|sonnet|opus|haiku)/, "claude"],
  [/^(?:gpt|chatgpt|codex|o[134])/, "gpt"],
  [/^(?:gemini|gemma)/, "gemini"],
  [/^glm/, "glm"],
  [/^deepseek/, "deepseek"],
  [/^qwen/, "qwen"],
  [/^(?:kimi|moonshot)/, "kimi"],
  [/^llama/, "llama"],
  [/^(?:mistral|mixtral|codestral)/, "mistral"],
  [/^grok/, "grok"],
  [/^command/, "cohere"],
  [/^phi/, "phi"],
];

/**
 * The model family, not the provider, is the lineage: two providers serving
 * the same family share the family's blind spots. An unknown model falls back
 * to its first identifier segment, so two genuinely different ids still count
 * as different lineages.
 */
export function lineageOf(value) {
  let modelID = null;
  if (typeof value === "string") {
    const match = /^[^/#]+\/([^#]+)/.exec(value.trim());
    if (match) modelID = match[1];
  } else if (value && typeof value === "object") {
    if (typeof value.model === "string") modelID = value.model;
  }
  if (!modelID) return null;
  const id = modelID.toLowerCase().replace(/^[^/]+\//, "");
  for (const [re, family] of MODEL_FAMILIES) {
    if (re.test(id)) return family;
  }
  return id.split(/[-_./:]/)[0] || id;
}

function boundSelector(slot, seam, config) {
  const value = bindingFor(slot, seam, config).value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed && !/^<.*>$/.test(trimmed) ? trimmed : null;
  }
  if (value && typeof value === "object" && typeof value.model === "string") {
    return `${value.providerID ?? "unknown"}/${value.model}`;
  }
  return null;
}

/**
 * Council seats and the visual blindspot are independent opinions only when
 * they span more than one model family. Warn, never error: a project may have
 * a deliberate reason, but the drift should be visible.
 */
export function checkLineageDiversity({ seam, config, slots, warnings, notes }) {
  if (!config) return;
  const bound = new Map();
  for (const slot of slots) {
    const selector = boundSelector(slot, seam, config);
    if (!selector) continue;
    const lineage = lineageOf(selector);
    if (lineage) bound.set(slot.id, { selector, lineage });
  }

  const council = [...bound.entries()].filter(([id]) => id.startsWith("council."));
  if (council.length >= 2) {
    const lineages = new Set(council.map(([, info]) => info.lineage));
    if (lineages.size < 2) {
      const names = council.map(([id, info]) => `${id}=${info.selector}`).join(", ");
      warnings.push(
        `lineage: council seats all use the ${[...lineages][0]} family (${names}); aim for at least two lineages`,
      );
    } else {
      notes.push(`lineage: council spans ${lineages.size} model lineages`);
    }
  }

  const blindspot = bound.get("hillclimb.blindspot");
  const experience = bound.get("council.experience");
  if (blindspot && experience && blindspot.lineage === experience.lineage) {
    warnings.push(
      `lineage: hillclimb.blindspot and council.experience both use the ${blindspot.lineage} family; two opinions from one lineage are one opinion`,
    );
  }
}

export function modalityLabel(slot) {
  const modality = slot.needs?.modality;
  return Array.isArray(modality) && modality.length > 0
    ? `${modality.join(" + ")} input`
    : "a model";
}

export function describeRequirement(slot) {
  const target =
    slot.bind.kind === "agent" ? `agents.${slot.bind.agent}.model` : slot.bind.path;
  return `${slot.id} (${modalityLabel(slot)}) -> ${target}`;
}

export function requirementWarning(slot, binding) {
  const skip =
    slot.bind.kind === "seam" ? " The capability is skipped until it is bound." : "";
  return `requirements: ${slot.id} is unbound; add ${binding.label} to ${binding.file} (needs ${modalityLabel(slot)}).${skip}`;
}

/**
 * Report unbound slots as warnings, never errors: an existing project must not
 * turn red on update just because a new slot arrived. `configFound` is false
 * when opencode.json is absent; the config check already says so once, and per
 * slot repetition would bury it.
 */
export function checkRequirements({ seam, config, slots, warnings, configFound = true }) {
  for (const slot of slots) {
    if (slot.bind.kind === "agent" && !configFound) continue;
    const binding = bindingFor(slot, seam, config);
    if (!isBound(binding.value)) {
      warnings.push(requirementWarning(slot, binding));
    }
  }
}

/** Slots introduced after `from` and available by `to`. */
export function newRequirements(from, to, slots) {
  if (!to) return [];
  const baseline = from ?? "0.0.0";
  return slots.filter((slot) => {
    if (typeof slot.since !== "string") return false;
    if (compareVersions(slot.since, baseline) <= 0) return false;
    return compareVersions(slot.since, to) <= 0;
  });
}