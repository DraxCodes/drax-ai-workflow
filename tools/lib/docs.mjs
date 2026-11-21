import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { toPosix } from "./manifest.mjs";

const LINK_RE = /\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
const STATUS_RE = /^\s*(?:\*\*)?Status(?:\*\*)?\s*:\s*(?:\*\*)?\s*([A-Za-z-]+)/im;
const ADR_STATUSES = ["proposed", "accepted", "superseded", "deprecated", "rejected"];

const SKIP_DIRS = new Set([
  ".git",
  ".opencode",
  ".scratch",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "target",
]);

function walkMarkdown(root) {
  const out = [];
  if (!existsSync(root)) return out;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const abs = join(root, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      out.push(...walkMarkdown(abs));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(abs);
    }
  }
  return out.sort();
}

/**
 * Remove fenced blocks and inline code before scanning for links: a path in a
 * code sample is not a link, and a false positive makes the check untrustworthy.
 */
function stripCode(text) {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/~~~[\s\S]*?~~~/g, "")
    .replace(/`[^`\n]*`/g, "");
}

function cleanTarget(raw) {
  let target = raw.trim();
  if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1);
  if (/^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(target)) return null;
  if (target.startsWith("#")) return null;
  target = target.split("#")[0].split("?")[0];
  if (!target) return null;
  try {
    target = decodeURIComponent(target);
  } catch {
    // A malformed escape still names a path; check the literal text.
  }
  return target.replace(/\\/g, "/");
}

function collectMarkdown(projectDir, roots) {
  const files = [];
  for (const rel of roots) {
    const abs = rel === "." ? projectDir : join(projectDir, rel);
    if (!existsSync(abs)) continue;
    const stat = statSync(abs);
    if (stat.isDirectory()) files.push(...walkMarkdown(abs));
    else if (rel.endsWith(".md")) files.push(abs);
  }
  return [...new Set(files)];
}

/**
 * Check relative links in project markdown. Absolute URLs, anchors and links
 * inside code fences are ignored. A link to a directory is valid when the
 * directory exists.
 */
export function checkDocLinks(
  projectDir,
  { roots = [".", "AGENTS.md", "README.md"] } = {},
) {
  const files = collectMarkdown(projectDir, roots);
  const broken = [];
  let checked = 0;

  for (const abs of files) {
    const rel = toPosix(relative(projectDir, abs));
    const text = stripCode(readFileSync(abs, "utf8"));
    for (const match of text.matchAll(LINK_RE)) {
      const target = cleanTarget(match[1]);
      if (!target) continue;
      const dest = target.startsWith("/")
        ? resolve(projectDir, target.slice(1))
        : resolve(dirname(abs), target);
      checked += 1;
      if (!existsSync(dest)) broken.push({ file: rel, target: match[1] });
    }
  }

  return { files: files.length, checked, broken };
}

/**
 * Validate the ADR status line and the numbered filename. The status is the
 * only lifecycle field a reader can rely on, so a missing or unknown value is
 * a warning rather than silently accepted prose.
 */
export function checkAdrStatus(projectDir, adrDir = "docs/adr") {
  const dir = join(projectDir, adrDir);
  if (!existsSync(dir)) return { checked: 0, issues: [] };
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .filter((name) => name !== "0000-template.md" && name !== "README.md")
    .sort();
  const issues = [];

  for (const name of files) {
    const rel = `${adrDir}/${name}`;
    if (!/^\d{4}-.+\.md$/.test(name)) {
      issues.push({ file: rel, reason: "filename should be NNNN-slug.md" });
    }
    const text = readFileSync(join(dir, name), "utf8");
    const match = STATUS_RE.exec(text);
    if (!match) {
      issues.push({ file: rel, reason: "missing a Status: line" });
      continue;
    }
    const status = match[1].toLowerCase();
    if (!ADR_STATUSES.includes(status)) {
      issues.push({
        file: rel,
        reason: `unknown status "${match[1]}" (expected ${ADR_STATUSES.join(", ")})`,
      });
    }
  }

  return { checked: files.length, issues };
}

export function checkDocs(projectDir, { seam } = {}) {
  const roots = ["docs", "AGENTS.md", "README.md"];
  if (seam?.docs?.notes && !roots.includes(seam.docs.notes)) roots.push(seam.docs.notes);
  if (seam?.docs?.adr && !roots.includes(seam.docs.adr)) roots.push(seam.docs.adr);
  const links = checkDocLinks(projectDir, { roots });
  const adr = checkAdrStatus(projectDir, seam?.docs?.adr ?? "docs/adr");
  return { links, adr };
}