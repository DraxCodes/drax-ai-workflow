import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, relative } from "node:path";
import { toPosix } from "./manifest.mjs";

const DOC_EXTENSIONS = /\.(md|mdx|txt|json|jsonc)$/i;
const CODE_EXTENSIONS = /\.(js|mjs|cjs|ts|tsx|jsx|py|rs|go|java|kt|rb|php|cs|c|cpp|h|hpp|sh|ps1)$/i;
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
const MAX_BYTES = 1024 * 1024;

const STOPWORDS = new Set([
  "why", "did", "do", "does", "we", "the", "a", "an", "is", "are", "was", "were",
  "how", "what", "when", "where", "who", "to", "of", "in", "on", "for", "and", "or",
  "with", "i", "my", "our", "it", "this", "that", "be", "can", "should", "would",
  "could", "was", "were", "been", "being", "have", "has", "had", "about", "from",
]);

function tokensOf(query) {
  return [
    ...new Set(
      String(query)
        .toLowerCase()
        .split(/[^a-z0-9_.-]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2 && !STOPWORDS.has(token)),
    ),
  ];
}

function collectFiles(root, code) {
  const out = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) visit(join(dir, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      const abs = join(dir, entry.name);
      const wanted = code ? CODE_EXTENSIONS.test(abs) || DOC_EXTENSIONS.test(abs) : DOC_EXTENSIONS.test(abs);
      if (!wanted) continue;
      try {
        if (statSync(abs).size <= MAX_BYTES) out.push(abs);
      } catch {
        // A file that disappeared mid-scan is not a result.
      }
    }
  };
  if (existsSync(root)) visit(root);
  return out;
}

function docMatches(projectDir, query, { code = false, limit = 20 }) {
  const tokens = tokensOf(query);
  if (tokens.length === 0) return [];
  const roots = [
    "AGENTS.md",
    "README.md",
    "GLOSSARY.md",
    "GLOSSARY-MAP.md",
    "docs",
    "templates",
    ".scratch",
  ];
  const files = [];
  for (const rel of roots) {
    const abs = join(projectDir, rel);
    if (!existsSync(abs)) continue;
    if (statSync(abs).isDirectory()) files.push(...collectFiles(abs, code));
    else if ((code ? CODE_EXTENSIONS : DOC_EXTENSIONS).test(abs) || DOC_EXTENSIONS.test(abs)) {
      files.push(abs);
    }
  }
  if (code) files.push(...collectFiles(projectDir, true));

  const seen = new Set();
  const results = [];
  for (const abs of files) {
    if (seen.has(abs)) continue;
    seen.add(abs);
    const rel = toPosix(relative(projectDir, abs));
    const lines = readFileSync(abs, "utf8").split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      const lower = line.toLowerCase();
      const matched = tokens.filter((token) => lower.includes(token)).length;
      const need = tokens.length <= 2 ? tokens.length : Math.ceil(tokens.length * 0.6);
      if (matched < need) continue;
      let score = 0;
      for (const token of tokens) {
        const count = lower.split(token).length - 1;
        score += count;
      }
      if (/^#{1,6}\s/.test(line)) score += 1;
      results.push({ kind: "doc", file: rel, line: index + 1, text: line.trim(), score });
    }
  }
  return results.sort((a, b) => b.score - a.score || a.file.localeCompare(b.file) || a.line - b.line).slice(0, limit);
}

function git(projectDir, args) {
  const result = spawnSync("git", ["-C", projectDir, ...args], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

function commitMatches(projectDir, query, { code = false, limit = 10 }) {
  if (!existsSync(join(projectDir, ".git"))) return [];
  const tokens = tokensOf(query);
  if (tokens.length === 0) return [];
  const format = "--pretty=format:%h%x09%ad%x09%s";
  const byCommit = new Map();

  for (const token of tokens.slice(0, 4)) {
    const lines = git(projectDir, [
      "log",
      "--all",
      "--regexp-ignore-case",
      "--fixed-strings",
      `--grep=${token}`,
      format,
      "--date=short",
      `-n${limit}`,
    ])
      .split(/\r?\n/)
      .filter(Boolean);
    for (const line of lines) {
      const [commit, date, ...subject] = line.split("\t");
      const text = subject.join("\t");
      const lower = text.toLowerCase();
      const score = tokens.filter((entry) => lower.includes(entry)).length;
      const current = byCommit.get(commit);
      if (!current || score > current.score) {
        byCommit.set(commit, { kind: "commit", commit, date, text, score });
      }
    }
  }

  if (code) {
    const token = tokens[0];
    const pickaxe = git(projectDir, [
      "log",
      "--all",
      `-S${token}`,
      "--pretty=format:%h%x09%ad%x09%s",
      "--date=short",
      `-n${limit}`,
    ]);
    for (const line of pickaxe.split(/\r?\n/).filter(Boolean)) {
      const [commit, date, ...subject] = line.split("\t");
      if (byCommit.has(commit)) continue;
      byCommit.set(commit, { kind: "commit", commit, date, text: subject.join("\t"), score: 0 });
    }
  }

  return [...byCommit.values()]
    .sort((a, b) => b.score - a.score || String(b.date).localeCompare(String(a.date)))
    .slice(0, limit);
}

export function findInProject(projectDir, query, { code = false, commits = true, limit = 20 } = {}) {
  const docs = docMatches(projectDir, query, { code, limit });
  const history = commits ? commitMatches(projectDir, query, { code, limit: Math.min(limit, 10) }) : [];
  return { query, tokens: tokensOf(query), docs, commits: history, total: docs.length + history.length };
}