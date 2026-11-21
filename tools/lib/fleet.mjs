import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { MANIFEST_REL, readManifest } from "./manifest.mjs";
import { sha256 } from "./hash.mjs";
import { loadSeam } from "./seam.mjs";
import { bindingFor, loadProjectRequirements } from "./requirements.mjs";

const SKIP = new Set([
  ".git",
  ".opencode",
  ".scratch",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "target",
]);

export function findProjects(root, { maxDepth = 3 } = {}) {
  const start = resolve(root);
  const found = [];
  const visit = (dir, depth) => {
    if (depth > maxDepth) return;
    if (existsSync(join(dir, MANIFEST_REL))) found.push(dir);
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || SKIP.has(entry.name)) continue;
      visit(join(dir, entry.name), depth + 1);
    }
  };
  if (existsSync(start) && statSync(start).isDirectory()) visit(start, 0);
  return found;
}

function readConfig(projectDir) {
  const file = join(projectDir, "opencode.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

export function inspectProject(projectDir) {
  const manifest = readManifest(projectDir);
  if (!manifest) return null;
  const { seam } = loadSeam(projectDir);
  const files = Object.entries(manifest.files ?? {});
  let clean = 0;
  let changed = 0;
  let missing = 0;
  for (const [dest, hash] of files) {
    const file = join(projectDir, ...dest.split("/"));
    if (!existsSync(file)) missing += 1;
    else if (sha256(readFileSync(file, "utf8")) !== hash) changed += 1;
    else clean += 1;
  }

  const config = readConfig(projectDir);
  const { slots } = loadProjectRequirements(projectDir);
  let unbound = 0;
  let placeholder = 0;
  for (const slot of slots) {
    const value = bindingFor(slot, seam, config).value;
    const text = typeof value === "string" ? value.trim() : "";
    if (text.length === 0) unbound += 1;
    else if (/^<.*>$/.test(text)) placeholder += 1;
  }

  return {
    dir: projectDir,
    project: seam?.project ?? basename(projectDir),
    version: manifest.version,
    commit: manifest.commit ?? null,
    installedAt: manifest.installedAt ?? null,
    packs: manifest.packs ?? [],
    files: files.length,
    clean,
    changed,
    missing,
    drift: changed + missing > 0,
    slots: slots.length,
    unbound,
    placeholder,
  };
}

export function fleet(root, { maxDepth = 3 } = {}) {
  const projects = findProjects(root, { maxDepth })
    .map((dir) => inspectProject(dir))
    .filter(Boolean)
    .sort((a, b) => a.project.localeCompare(b.project));
  return {
    root: resolve(root),
    projects,
    summary: {
      total: projects.length,
      drifted: projects.filter((project) => project.drift).length,
      unbound: projects.reduce((sum, project) => sum + project.unbound, 0),
      placeholders: projects.reduce((sum, project) => sum + project.placeholder, 0),
    },
  };
}