import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readJson(file) {
  try {
    return { value: JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, "")), error: null };
  } catch (error) {
    return { value: null, error };
  }
}

/**
 * A workflow pack is a pilot fixture set, not a model task pack. Each task is a
 * brief (`task.md`), a scoring anchor (`key.md`) and an `input/` tree. The key is
 * never shown to the agent.
 */
export function loadWorkflowPack(packDir) {
  const file = join(packDir, "pack.json");
  if (!existsSync(file)) return { pack: null, errors: [`${file}: missing`] };
  const { value, error } = readJson(file);
  if (error) return { pack: null, errors: [`${file}: ${error.message}`] };

  const errors = [];
  if (!isObject(value)) return { pack: null, errors: [`${file}: expected an object`] };
  if (value.schemaVersion !== 1) errors.push("pack.json: schemaVersion must be 1");
  if (typeof value.id !== "string" || value.id.trim() === "") {
    errors.push("pack.json: id is required");
  }
  if (typeof value.version !== "string" || value.version.trim() === "") {
    errors.push("pack.json: version is required");
  }
  if (typeof value.protocol !== "string" || value.protocol.trim() === "") {
    errors.push("pack.json: protocol is required");
  }
  if (!Number.isInteger(value.minTasks) || value.minTasks < 1) {
    errors.push("pack.json: minTasks must be a positive integer");
  }
  if (!Array.isArray(value.tasks) || value.tasks.length === 0) {
    errors.push("pack.json: tasks must be a non-empty array");
  }

  const tasks = [];
  for (const id of Array.isArray(value.tasks) ? value.tasks : []) {
    if (typeof id !== "string" || !/^[A-Za-z0-9_.-]+$/.test(id)) {
      errors.push(`pack.json: task id ${JSON.stringify(id)} is not a safe directory name`);
      continue;
    }
    const dir = join(packDir, "tasks", id);
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      errors.push(`task ${id}: directory is missing`);
      continue;
    }
    const taskFile = join(dir, "task.md");
    const keyFile = join(dir, "key.md");
    const inputDir = join(dir, "input");
    if (!existsSync(taskFile)) errors.push(`task ${id}: task.md is missing`);
    if (!existsSync(keyFile)) errors.push(`task ${id}: key.md is missing`);
    if (!existsSync(inputDir) || !statSync(inputDir).isDirectory()) {
      errors.push(`task ${id}: input/ is missing`);
    }
    if (existsSync(taskFile)) {
      const task = readFileSync(taskFile, "utf8");
      if (!/## Objective/.test(task)) errors.push(`task ${id}: task.md has no Objective section`);
      if (!/## Evidence/.test(task)) errors.push(`task ${id}: task.md has no Evidence section`);
    }
    tasks.push({ id, dir, taskFile, keyFile, inputDir });
  }

  return {
    pack: {
      ...value,
      dir: packDir,
      tasks: [...new Set(value.tasks ?? [])],
      entries: tasks,
    },
    errors,
  };
}

export function workflowPackFiles(pack) {
  if (!pack?.dir) return [];
  const root = join(pack.dir, "tasks");
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}