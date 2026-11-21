import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { checkDocs as auditDocs } from "./docs.mjs";
import { sha256 } from "./hash.mjs";
import {
  MANIFEST_REL,
  extractBlock,
  projectFile,
  readManifest,
  toPosix,
} from "./manifest.mjs";
import {
  checkLineageDiversity,
  checkRequirements,
  loadProjectRequirements,
} from "./requirements.mjs";
import { loadSeam } from "./seam.mjs";

const READ_ONLY_AGENTS = ["plan-architect", "quality-gatekeeper", "security-auditor"];
const ALL_AGENTS = ["task-orchestrator", ...READ_ONLY_AGENTS];

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(abs));
    else if (entry.isFile()) out.push(abs);
  }
  return out;
}

function readJson(file) {
  try {
    return { value: JSON.parse(readFileSync(file, "utf8")), error: null };
  } catch (error) {
    return { value: null, error };
  }
}

function agentIdsFromManifest(manifest) {
  return Object.keys(manifest.files)
    .filter((dest) => dest.startsWith(".opencode/agents/"))
    .map((dest) => dest.slice(".opencode/agents/".length))
    .filter((id) => !id.includes("/") && id.endsWith(".md"))
    .map((id) => id.slice(0, -3));
}

function checkDocs(seam, projectDir, errors, warnings, notes) {
  if (!seam.docs) return;
  const required = ["issues", "adr"];
  const optional = ["glossary", "notes", "rubricAddendum", "contract", "artDirection"];
  for (const [key, rel] of Object.entries(seam.docs)) {
    const abs = join(projectDir, rel);
    if (existsSync(abs)) {
      notes.push(`docs.${key}: ${rel}`);
    } else if (required.includes(key)) {
      errors.push(`docs.${key}: ${rel} does not exist (required by the seam)`);
    } else if (optional.includes(key)) {
      warnings.push(`docs.${key}: ${rel} does not exist (optional)`);
    } else {
      warnings.push(`docs.${key}: ${rel} does not exist yet`);
    }
  }
}

function isPlaceholderModel(model) {
  return typeof model === "string" && /^<.*>$/.test(model.trim());
}

/**
 * Read a model selector in either the string form (`provider/model#variant`)
 * or the expanded object form OpenCode also accepts.
 */
function parseModelSelector(model) {
  if (typeof model === "string") {
    const raw = model.trim();
    const match = /^([^/#]+)\/([^#]+)(?:#([^#]+))?$/.exec(raw);
    if (!match) return null;
    return { raw, providerID: match[1], modelID: match[2], variant: match[3] ?? null };
  }
  if (
    model &&
    typeof model === "object" &&
    typeof model.providerID === "string" &&
    typeof model.model === "string"
  ) {
    const variant = typeof model.variant === "string" ? model.variant : null;
    return {
      raw: `${model.providerID}/${model.model}${variant ? `#${variant}` : ""}`,
      providerID: model.providerID,
      modelID: model.model,
      variant,
    };
  }
  return null;
}

/**
 * A model may declare its variants as an array (newer config) or an object map
 * (legacy config). Only a declared set can be checked; an absent list is
 * catalog-owned and left alone.
 */
function declaredVariants(modelConfig) {
  const variants = modelConfig?.variants;
  if (Array.isArray(variants)) {
    const entries = variants
      .filter((variant) => variant && typeof variant.id === "string")
      .map((variant) => [variant.id, variant.disabled === true]);
    return entries.length > 0 ? new Map(entries) : null;
  }
  if (variants && typeof variants === "object") {
    const entries = Object.entries(variants).map(([id, variant]) => [
      id,
      variant?.disabled === true,
    ]);
    return entries.length > 0 ? new Map(entries) : null;
  }
  return null;
}

/**
 * Every selector in the project must name a model the config declares and,
 * when the model publishes a variant list, a variant that list allows. The
 * base's agents carry no model, so a seat that silently falls back to a
 * missing catalogue entry is exactly the drift this check catches.
 */
function checkModelSelectors(value, agentIds, errors, warnings, notes, extra = []) {
  const agents = value.agents && typeof value.agents === "object" ? value.agents : {};
  const providers = {
    ...(value.providers && typeof value.providers === "object" ? value.providers : {}),
    ...(value.provider && typeof value.provider === "object" ? value.provider : {}),
  };

  const selectors = [];
  if (value.model) selectors.push({ label: "model", model: value.model });
  const ids = new Set([...agentIds, ...Object.keys(agents)]);
  for (const id of ids) {
    const model = agents[id]?.model;
    if (model) selectors.push({ label: `agents.${id}.model`, model });
  }
  selectors.push(...extra);

  let resolved = 0;
  for (const { label, model } of selectors) {
    if (isPlaceholderModel(model)) continue;
    const selector = parseModelSelector(model);
    if (!selector) {
      warnings.push(
        `opencode.json: ${label} is not a provider/model selector (got ${JSON.stringify(model)})`,
      );
      continue;
    }

    const provider = providers[selector.providerID];
    const models =
      provider && typeof provider === "object" && provider.models && typeof provider.models === "object"
        ? provider.models
        : null;
    // A provider with no declared catalogue is built-in or discovered, so the
    // base cannot know its model IDs and must not guess.
    if (!models) continue;

    resolved += 1;
    if (!Object.prototype.hasOwnProperty.call(models, selector.modelID)) {
      warnings.push(
        `opencode.json: ${label} "${selector.raw}" names a model not declared under provider.${selector.providerID}.models`,
      );
      continue;
    }
    if (!selector.variant) continue;

    const variants = declaredVariants(models[selector.modelID]);
    if (!variants) continue;
    if (!variants.has(selector.variant)) {
      warnings.push(
        `opencode.json: ${label} "${selector.raw}" uses variant "${selector.variant}", which is not declared for that model (declared: ${[...variants.keys()].join(", ") || "none"})`,
      );
    } else if (variants.get(selector.variant)) {
      errors.push(
        `opencode.json: ${label} "${selector.raw}" uses variant "${selector.variant}", which is disabled for that model`,
      );
    }
  }

  if (resolved > 0) {
    notes.push(`opencode.json: ${resolved} model selector(s) checked against declared models`);
  }
}

function permissionRules(agents, id) {
  const rules = agents[id]?.permissions;
  return Array.isArray(rules) ? rules : [];
}

function hasPermission(rules, action, effect) {
  return rules.some(
    (rule) =>
      rule &&
      rule.action === action &&
      rule.effect === effect &&
      (rule.resource === "*" || rule.resource === "**"),
  );
}

/**
 * The role matrix is advisory: a project may have a reason to widen or narrow a
 * seat, but the read-only guarantee and the always-on lens depend on the shape
 * being visible. Report the drift; never fail the project for it.
 */
function checkPermissionMatrix(agents, warnings, notes) {
  let checked = 0;
  for (const id of ALL_AGENTS) {
    const rules = permissionRules(agents, id);
    if (rules.length === 0) continue;
    checked += 1;

    if (id === "task-orchestrator") {
      if (hasPermission(rules, "edit", "deny")) {
        warnings.push(
          "opencode.json: task-orchestrator has an edit-deny; it owns the change and cannot make it",
        );
      }
      if (hasPermission(rules, "task", "deny")) {
        warnings.push(
          "opencode.json: task-orchestrator cannot delegate; the read-only seats are unreachable",
        );
      }
    }

    if (id === "plan-architect") {
      if (hasPermission(rules, "bash", "allow")) {
        warnings.push(
          "opencode.json: plan-architect can run bash; a plan should be read-only",
        );
      }
      if (hasPermission(rules, "webfetch", "allow")) {
        warnings.push(
          "opencode.json: plan-architect can fetch the web; keep the plan inside the brief",
        );
      }
    }

    if (id === "quality-gatekeeper" && hasPermission(rules, "edit", "allow")) {
      warnings.push(
        "opencode.json: quality-gatekeeper can edit; the read-only guarantee is weakened",
      );
    }

    if (id === "security-auditor") {
      if (hasPermission(rules, "edit", "allow")) {
        warnings.push(
          "opencode.json: security-auditor can edit; the read-only guarantee is weakened",
        );
      }
      if (hasPermission(rules, "webfetch", "deny")) {
        warnings.push(
          "opencode.json: security-auditor cannot fetch the web; its best-practice check is blocked",
        );
      }
      if (hasPermission(rules, "bash", "deny")) {
        warnings.push(
          "opencode.json: security-auditor cannot run the checks; tests are unverified",
        );
      }
    }
  }
  if (checked > 0) {
    notes.push(`permissions: role matrix checked for ${checked} agent(s) with explicit rules`);
  }
}

function checkConfig(projectDir, agentIds, errors, warnings, notes, seam) {
  const file = join(projectDir, "opencode.json");
  if (!existsSync(file)) {
    warnings.push("opencode.json: not found; the project model and permissions are unset");
    return null;
  }
  const { value, error } = readJson(file);
  if (error) {
    warnings.push(`opencode.json: could not parse (${error.message}); skipped config checks`);
    return null;
  }
  const rootModel = value.model;
  const agents = value.agents ?? {};
  const placeholders = [];
  let anyModel = Boolean(rootModel) && !isPlaceholderModel(rootModel);
  if (isPlaceholderModel(rootModel)) placeholders.push("model");
  for (const id of agentIds) {
    const model = agents[id]?.model;
    if (model && !isPlaceholderModel(model)) anyModel = true;
    if (isPlaceholderModel(model)) placeholders.push(`agents.${id}.model`);
  }
  if (!anyModel && placeholders.length === 0) {
    warnings.push(
      "opencode.json: no real model; set a root `model` or per-agent `agents.<id>.model` (base agents inherit)",
    );
  }
  if (placeholders.length > 0) {
    warnings.push(
      `opencode.json: replace the placeholders in ${placeholders.join(", ")}`,
    );
  }

  const extra = [];
  const visualModel = seam?.visualReview?.model;
  if (typeof visualModel === "string" && visualModel.trim().length > 0) {
    extra.push({ label: "visualReview.model", model: visualModel });
  }
  checkModelSelectors(value, agentIds, errors, warnings, notes, extra);

  for (const id of READ_ONLY_AGENTS) {
    const rules = agents[id]?.permissions ?? [];
    const denied = rules.some(
      (rule) =>
        rule.action === "edit" &&
        rule.effect === "deny" &&
        (rule.resource === "*" || rule.resource === "**"),
    );
    if (!denied) {
      warnings.push(
        `opencode.json: agents.${id} has no edit-deny; the read-only guarantee relies on it`,
      );
    }
  }
  checkPermissionMatrix(agents, warnings, notes);

  if (value.permissions) notes.push("opencode.json: project permissions present");
  return value;
}

function checkGlobalShadowing(home, agentIds, errors, notes) {
  const agentsDir = join(home, ".config", "opencode", "agents");
  let found = 0;
  for (const id of agentIds) {
    const file = join(agentsDir, `${id}.md`);
    if (existsSync(file)) {
      errors.push(
        `global agent ${id} at ${toPosix(file)} shadows the vendored agent (move it aside)`,
      );
      found += 1;
    }
  }
  if (found === 0) notes.push("global agents: no same-ID shadowing");
}

const SECRET_PATTERNS = [
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, kind: "error", label: "private key" },
  { re: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/, kind: "error", label: "API key" },
  { re: /\bgh[pousr]_[A-Za-z0-9]{20,}/, kind: "error", label: "GitHub token" },
  { re: /\bgithub_pat_[A-Za-z0-9_]{20,}/, kind: "error", label: "GitHub token" },
  { re: /\bglpat-[A-Za-z0-9_-]{20,}/, kind: "error", label: "GitLab token" },
  { re: /\bnpm_[A-Za-z0-9]{20,}/, kind: "error", label: "npm token" },
  { re: /\bpypi-[A-Za-z0-9_-]{20,}/, kind: "error", label: "PyPI token" },
  { re: /\bhf_[A-Za-z0-9]{20,}/, kind: "error", label: "Hugging Face token" },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/, kind: "error", label: "Slack token" },
  { re: /\bAKIA[0-9A-Z]{16}/, kind: "error", label: "AWS access key" },
  { re: /\bAIza[0-9A-Za-z_-]{30,}/, kind: "error", label: "Google API key" },
  {
    re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
    kind: "error",
    label: "JWT",
  },
  {
    re: /(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:@/]+:[^\s@/]+@/,
    kind: "error",
    label: "connection string with credentials",
  },
  { re: /AccountKey=[A-Za-z0-9+/=]{20,}/, kind: "error", label: "Azure account key" },
  {
    re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/,
    kind: "error",
    label: "SendGrid key",
  },
  {
    re: /["']?(?:api[-_]?key|token|secret|password|passwd|credential|authorization|bearer)["']?\s*:\s*"(?!\{env:|\{file:)/i,
    kind: "warning",
    label: "inline credential",
  },
  {
    re: /["'](?:key|auth)["']\s*:\s*"(?!\{env:|\{file:)/i,
    kind: "warning",
    label: "inline credential",
  },
  {
    re: /\b(?:api[_-]?key|access[_-]?token|secret|password)\s*=\s*(?!\{env:|\{file:|<|$)[^\s#"']{16,}/i,
    kind: "warning",
    label: "literal credential assignment",
  },
];

const SECRET_EXTENSIONS = /\.(md|mdx|json|jsonc|ya?ml|txt|toml|mjs|cjs|js|ts|py|sh|ps1)$/i;
const SECRET_SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  "target",
  ".agents",
  ".workflow-backup",
  ".workflow-stage",
]);
const SECRET_MAX_BYTES = 1024 * 1024;
// Benchmark task files are deliberately vulnerable fixtures, not project code.
const SECRET_SKIP_PATH = /(?:^|[\\/])benchmarks[\\/]packs[\\/]/;

function collectSecretFiles(path, out = []) {
  if (!existsSync(path)) return out;
  const stat = statSync(path);
  if (stat.isFile()) {
    if (SECRET_EXTENSIONS.test(path) && stat.size <= SECRET_MAX_BYTES) out.push(path);
    return out;
  }
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SECRET_SKIP_DIRS.has(entry.name)) collectSecretFiles(join(path, entry.name), out);
    } else if (entry.isFile()) {
      const abs = join(path, entry.name);
      try {
        if (SECRET_EXTENSIONS.test(abs) && statSync(abs).size <= SECRET_MAX_BYTES) {
          out.push(abs);
        }
      } catch {
        // A file that disappeared mid-scan is not a secret.
      }
    }
  }
  return out;
}

function checkSecrets(projectDir, errors, warnings, notes) {
  const roots = [
    join(projectDir, ".opencode"),
    join(projectDir, "docs"),
    join(projectDir, "templates"),
    join(projectDir, "benchmarks"),
    join(projectDir, ".cortexkit"),
    join(projectDir, ".scratch"),
    join(projectDir, "AGENTS.md"),
    join(projectDir, "README.md"),
    join(projectDir, "opencode.json"),
    join(projectDir, "opencode.jsonc"),
    join(projectDir, "package.json"),
  ];
  const files = [...new Set(roots.flatMap((root) => collectSecretFiles(root)))];

  let scanned = 0;
  for (const abs of files) {
    if (SECRET_SKIP_PATH.test(abs)) continue;
    scanned += 1;
    const rel = toPosix(abs.slice(projectDir.length + 1));
    const local = rel.startsWith(".scratch/") || rel.startsWith(".cortexkit/");
    const text = readFileSync(abs, "utf8");
    for (const { re, kind, label } of SECRET_PATTERNS) {
      if (!re.test(text)) continue;
      if (local || kind === "warning") {
        warnings.push(`${rel}: possible ${label} (verify it is an example)`);
      } else {
        errors.push(`${rel}: looks like a ${label}`);
      }
    }
  }
  notes.push(`secrets: scanned ${scanned} project text files`);
}

function checkRubrics(seam, projectDir, errors, notes) {
  const name = seam.rubrics?.default ?? "perception";
  const skillsDir = join(projectDir, ".opencode", "skills", "hillclimb");
  if (!existsSync(skillsDir)) {
    notes.push("hillclimb: skill not vendored; rubric check skipped");
    return;
  }
  const bare = /^[a-z0-9-]+$/.test(name);
  const rel = bare ? `.opencode/skills/hillclimb/references/rubrics/${name}.md` : name;
  const abs = projectFile(projectDir, rel);
  if (!existsSync(abs)) {
    errors.push(
      `rubrics.default: "${name}" does not resolve to a rubric file (looked for ${rel})`,
    );
    return;
  }
  notes.push(`hillclimb: rubric ${name}`);
}

function checkPacks(seam, projectDir, errors, warnings, notes) {
  for (const pack of seam.packs ?? []) {
    const manifest = join(projectDir, ".opencode", "packs", pack, "pack.json");
    if (!existsSync(manifest)) {
      errors.push(`packs.${pack}: not vendored (expected ${toPosix(manifest)})`);
      continue;
    }
    const lock = join(projectDir, "skills-lock.json");
    const installed = existsSync(join(projectDir, ".agents", "skills"));
    if (installed) notes.push(`pack ${pack}: skills installed in .agents/skills`);
    else warnings.push(`pack ${pack}: not installed yet; run \`base pack install ${pack}\``);
    if (existsSync(lock)) notes.push(`pack ${pack}: skills-lock.json present`);
  }
}

export function doctor(projectDir, { home = homedir() } = {}) {
  const errors = [];
  const warnings = [];
  const notes = [];

  const manifest = readManifest(projectDir);
  if (!manifest) {
    errors.push(`${MANIFEST_REL}: missing (run \`base init\`)`);
    return { errors, warnings, notes };
  }

  const { seam, errors: seamErrors, warnings: seamWarnings } = loadSeam(projectDir);
  errors.push(...seamErrors);
  warnings.push(...seamWarnings);

  if (seam && manifest.version !== seam.base.version) {
    errors.push(
      `version: seam pins ${seam.base.version} but the manifest records ${manifest.version}`,
    );
  }

  for (const [dest, hash] of Object.entries(manifest.files)) {
    const abs = projectFile(projectDir, dest);
    if (!existsSync(abs)) {
      errors.push(`${dest}: missing (run \`base update --check\`)`);
    } else if (sha256(readFileSync(abs, "utf8")) !== hash) {
      errors.push(`${dest}: modified (run \`base check\` for the diff)`);
    }
  }

  const agentsFile = projectFile(projectDir, "AGENTS.md");
  if (!existsSync(agentsFile)) {
    errors.push("AGENTS.md: missing (the workflow triggers are not loaded)");
  } else {
    const block = extractBlock(readFileSync(agentsFile, "utf8"));
    if (!block) {
      errors.push("AGENTS.md: the workflow-base block is missing");
    } else if (sha256(block.trim()) !== manifest.agentsBlockHash) {
      errors.push("AGENTS.md: the workflow-base block was edited or is stale");
    } else {
      notes.push("AGENTS.md: managed block matches the manifest");
    }
  }

  if (seam) {
    checkDocs(seam, projectDir, errors, warnings, notes);
    const docAudit = auditDocs(projectDir, { seam });
    for (const broken of docAudit.links.broken) {
      warnings.push(`${broken.file}: link target does not exist: ${broken.target}`);
    }
    for (const issue of docAudit.adr.issues) {
      warnings.push(`${issue.file}: ${issue.reason}`);
    }
    notes.push(
      `docs: ${docAudit.links.files} markdown files, ${docAudit.links.checked} links checked, ${docAudit.adr.checked} ADRs`,
    );
    checkRubrics(seam, projectDir, errors, notes);
    checkPacks(seam, projectDir, errors, warnings, notes);
  }
  const agentIds = agentIdsFromManifest(manifest);
  const ids = agentIds.length > 0 ? agentIds : ALL_AGENTS;
  const config = checkConfig(projectDir, ids, errors, warnings, notes, seam);
  const { slots, error: requirementsError } = loadProjectRequirements(projectDir);
  if (requirementsError) {
    notes.push(requirementsError);
  } else {
    checkRequirements({
      seam,
      config,
      slots,
      warnings,
      configFound: config !== null,
    });
    checkLineageDiversity({ seam, config, slots, warnings, notes });
  }
  checkGlobalShadowing(home, ids, errors, notes);
  checkSecrets(projectDir, errors, warnings, notes);

  const owned = new Set(Object.keys(manifest.files));
  for (const dir of ["agents", "commands", "skills"]) {
    for (const abs of walk(join(projectDir, ".opencode", dir))) {
      const rel = toPosix(abs.slice(projectDir.length + 1));
      if (!owned.has(rel)) warnings.push(`${rel}: not owned by the workflow base`);
    }
  }

  return { errors, warnings, notes };
}

function backupDirFor(home) {
  const base = join(
    home,
    ".config",
    "opencode",
    `agents.bak-${new Date().toISOString().slice(0, 10)}`,
  );
  return existsSync(base) ? `${base}-${Date.now()}` : base;
}

/**
 * The mechanical doctor fixes: create the required doc directories and move
 * same-ID global agents into a dated backup. Everything else needs a human.
 */
export function fixDoctor(projectDir, { home = homedir(), dryRun = false } = {}) {
  const actions = [];
  const errors = [];
  const manifest = readManifest(projectDir);
  if (!manifest) {
    errors.push(`${MANIFEST_REL}: missing (run \`base init\`)`);
    return { actions, errors };
  }

  const { seam, errors: seamErrors } = loadSeam(projectDir);
  errors.push(...seamErrors);
  if (seam?.docs) {
    for (const key of ["issues", "adr", "notes"]) {
      const rel = seam.docs[key];
      if (!rel || existsSync(join(projectDir, rel))) continue;
      actions.push(`create ${rel}`);
      if (!dryRun) mkdirSync(join(projectDir, rel), { recursive: true });
    }
  }

  const agentIds = agentIdsFromManifest(manifest);
  const ids = agentIds.length > 0 ? agentIds : ALL_AGENTS;
  const agentsDir = join(home, ".config", "opencode", "agents");
  const backupDir = backupDirFor(home);
  for (const id of ids) {
    const file = join(agentsDir, `${id}.md`);
    if (!existsSync(file)) continue;
    const target = join(backupDir, `${id}.md`);
    actions.push(`move global agent ${id} -> ${toPosix(target)}`);
    if (!dryRun) {
      mkdirSync(backupDir, { recursive: true });
      copyFileSync(file, target);
      rmSync(file, { force: true });
    }
  }

  return { actions, errors };
}