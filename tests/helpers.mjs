import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

export function tempDir(prefix = "wb-") {
  return mkdtempSync(join(tmpdir(), prefix));
}

export const blockText = [
  "<!-- workflow-base:begin -->",
  "## Workflow base",
  "version {{version}}",
  "<!-- workflow-base:end -->",
].join("\n");

export function fixtureBase({ version = "0.1.0", agentBody = "# Agent A\n" } = {}) {
  const root = tempDir("wb-base-");
  writeFileSync(join(root, "VERSION"), `${version}\n`);
  writeFileSync(join(root, "AGENTS.base.md"), `${blockText}\n`);
  mkdirSync(join(root, "agents"), { recursive: true });
  writeFileSync(join(root, "agents", "task-orchestrator.md"), agentBody);
  writeFileSync(join(root, "agents", "plan-architect.md"), "# Plan Architect\n");
  writeFileSync(join(root, "agents", "quality-gatekeeper.md"), "# Gatekeeper\n");
  writeFileSync(join(root, "agents", "security-auditor.md"), "# Security\n");
  mkdirSync(join(root, "commands"), { recursive: true });
  writeFileSync(join(root, "commands", "council.md"), "# Council\n");
  mkdirSync(join(root, "skills", "council"), { recursive: true });
  writeFileSync(
    join(root, "skills", "council", "SKILL.md"),
    "---\nname: Council\n---\n# Council\n",
  );
  mkdirSync(join(root, "packs", "engineering", "commands"), { recursive: true });
  writeFileSync(join(root, "packs", "engineering", "pack.json"), '{"name":"engineering"}\n');
  writeFileSync(
    join(root, "packs", "engineering", "install.mjs"),
    'import { writeFileSync } from "node:fs";\nwriteFileSync("pack-installed.txt", "yes");\n',
  );
  writeFileSync(
    join(root, "packs", "engineering", "commands", "setup-engineering-pack.md"),
    "# Setup pack\n",
  );
  cpSync(join(repoRoot, "tools"), join(root, "tools"), { recursive: true });
  return root;
}