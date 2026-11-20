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