import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyPlan } from "./apply.mjs";
import { checkDocs as auditDocs } from "./docs.mjs";
import { doctor, fixDoctor } from "./doctor.mjs";
import { findInProject } from "./find.mjs";
import { fleet } from "./fleet.mjs";
import { sha256 } from "./hash.mjs";
import {
  MANIFEST_REL,
  listBaseFiles,
  manifestContent,
  manifestFor,
  projectFile,
  readBaseFiles,
  readManifest,
  renderBlock,
} from "./manifest.mjs";
import { planCheck, planEject, planInit, planUpdate, listExtraFiles } from "./plan.mjs";
import { DEFAULT_PROFILE, loadProfile } from "./profile.mjs";
import { PRESETS, PRESET_ALIASES, applyPreset, resolvePresetName } from "./presets.mjs";
import { probeSlot } from "./probe.mjs";
import {
  bindingFor,
  describeRequirement,
  loadBaseRequirements,
  loadProjectRequirements,
  newRequirements,
} from "./requirements.mjs";
import { SEAM_REL, defaultSeam, loadSeam, validateSeam } from "./seam.mjs";
import {
  exportRuns,
  finishRun,
  listRuns,
  recordRun,
  showRun,
  startRun,
  summarizeRuns,
} from "./runs.mjs";

const REPEATABLE = new Set(["free", "paid", "pack", "evidence"]);

function parseFlags(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      flags._.push(arg);
      continue;
    }
    const body = arg.slice(2);
    const eq = body.indexOf("=");
    const key = eq === -1 ? body : body.slice(0, eq);
    const camel = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    let value;
    if (eq !== -1) {
      value = body.slice(eq + 1);
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      value = argv[i + 1];
      i += 1;
    } else {
      value = true;
    }
    if (REPEATABLE.has(key)) {
      flags[camel] = [...(flags[camel] ?? []), value];
    } else {
      flags[camel] = value;
    }
  }
  return flags;
}

const toArray = (value) => {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
};

function readVersion(root) {
  const file = join(root, "VERSION");
  return existsSync(file) ? readFileSync(file, "utf8").trim() : null;
}

function gitCommit(root) {
  const result = spawnSync("git", ["-C", root, "rev-parse", "--short", "HEAD"], {
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function isBaseRoot(dir) {
  return (
    Boolean(dir) &&
    existsSync(join(dir, "VERSION")) &&
    existsSync(join(dir, "AGENTS.base.md"))
  );
}

function sourceRoot(flags) {
  const candidates = [];
  if (typeof flags.from === "string") candidates.push(resolve(flags.from));
  if (process.env.WORKFLOW_BASE) candidates.push(resolve(process.env.WORKFLOW_BASE));
  candidates.push(resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."));
  candidates.push(process.cwd());
  for (const dir of candidates) {
    if (isBaseRoot(dir)) return dir;
  }
  return null;
}

function requireSource(flags) {
  const root = sourceRoot(flags);
  if (!root) {
    throw new Error(
      "no base checkout found; run from the drax-ai-workflow repo, set WORKFLOW_BASE, or pass --from <dir>",
    );
  }
  return root;
}

function renderBaseBlock(baseRoot, version) {
  const template = readFileSync(join(baseRoot, "AGENTS.base.md"), "utf8");
  return renderBlock(template, version);
}

function printReport(title, { errors = [], warnings = [], notes = [] }) {
  console.log(title);
  for (const note of notes) console.log(`  · ${note}`);
  for (const warning of warnings) console.log(`  ! ${warning}`);
  for (const error of errors) console.log(`  ✗ ${error}`);
}

function applySeamFlags(seam, flags, { extended = false } = {}) {
  if (flags.build) seam.checks.build = { command: flags.build, cwd: "." };
  if (flags.test) seam.checks.test = { command: flags.test, cwd: "." };
  if (flags.free) {
    seam.checks.free = toArray(flags.free).map((command) => ({ command, cwd: "." }));
  }
  if (flags.paid) {
    seam.checks.paid = toArray(flags.paid).map((command) => ({ command, cwd: "." }));
  }
  if (flags.surface) seam.verify.surface = flags.surface;
  if (flags.seed) seam.verify.seed = flags.seed;
  if (flags.capture) seam.verify.capture = flags.capture;
  if (flags.captureCwd) seam.verify.captureCwd = flags.captureCwd;
  if (flags.issues) seam.docs.issues = flags.issues;
  if (flags.glossary) seam.docs.glossary = flags.glossary;
  if (flags.adr) seam.docs.adr = flags.adr;
  if (flags.notesDir) seam.docs.notes = flags.notesDir;
  if (flags.rubricAddendum) seam.docs.rubricAddendum = flags.rubricAddendum;
  if (extended) {
    if (flags.widths) {
      seam.verify.widths = String(flags.widths)
        .split(",")
        .map((value) => {
          const n = Number(value.trim());
          return Number.isFinite(n) ? n : value.trim();
        });
    }
    if (flags.themes) {
      seam.verify.themes = String(flags.themes)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    }
    if (flags.contract) seam.docs.contract = flags.contract;
    if (flags.artDirection) seam.docs.artDirection = flags.artDirection;
  }
  seam.packs = toArray(flags.pack);
  return seam;
}

function installProject({ baseRoot, target, seam, flags }) {
  const version = readVersion(baseRoot);
  const { errors } = validateSeam(seam);
  if (errors.length > 0) {
    printReport("The seam would be invalid:", { errors });
    return { code: 2 };
  }

  const packs = seam.packs ?? [];
  const files = readBaseFiles(baseRoot, listBaseFiles(baseRoot, packs));
  const block = renderBaseBlock(baseRoot, version);
  const plan = planInit({
    projectDir: target,
    files,
    seamContent: `${JSON.stringify(seam, null, 2)}\n`,
    block,
    force: Boolean(flags.force),
  });

  if (plan.conflicts.length > 0) {
    printReport("Refusing to initialize:", { errors: plan.conflicts });
    console.log("\nUse --force to replace the differing files.");
    return { code: 1 };
  }

  const manifest = manifestFor(files, {
    version,
    commit: gitCommit(baseRoot),
    packs,
    block,
  });
  plan.writes.push({
    path: MANIFEST_REL,
    content: manifestContent(manifest),
    kind: "manifest",
  });

  const result = applyPlan(target, plan, { dryRun: Boolean(flags.dryRun) });
  if (flags.dryRun) {
    console.log(`\nDry run: would write ${plan.writes.length} files into ${target}`);
    return { code: 0, result, version, dryRun: true };
  }

  console.log(
    `Initialized ${seam.project} at ${target} with drax-ai-workflow ${version}.`,
  );
  console.log(`  files: ${result.written.length} written, ${result.deleted.length} removed`);
  console.log(`  diff: +${result.written.length} -${result.deleted.length}`);
  if (result.backupDir) console.log(`  backup: ${result.backupDir}`);
  return { code: 0, result, version };
}

function initCommand(flags) {
  const baseRoot = requireSource(flags);
  const target = resolve(flags._[0] ?? ".");
  const version = readVersion(baseRoot);
  const project = flags.project ?? basename(target);
  const seam = applySeamFlags(defaultSeam({ project, baseVersion: version }), flags);
  const install = installProject({ baseRoot, target, seam, flags });
  if (install.code !== 0 || install.dryRun) return install.code;

  console.log("\nNext:");
  console.log(`  1. Fill .opencode/workflow.json (checks, verify, docs).`);
  console.log(`  2. Run: node .opencode/tools/base.mjs doctor .`);
  console.log(`  3. Merge the fragment from: node .opencode/tools/base.mjs print-config .`);
  return 0;
}

function scaffoldDocs(baseRoot, target, seam) {
  const created = [];
  const pairs = [
    [seam.docs.notes && "templates/docs/notes-readme.md", seam.docs.notes && `${seam.docs.notes}/README.md`],
    [seam.docs.notes && "templates/docs/note.md", seam.docs.notes && `${seam.docs.notes}/_template.md`],
    [seam.docs.adr && "templates/docs/adr-readme.md", seam.docs.adr && `${seam.docs.adr}/README.md`],
    [seam.docs.adr && "templates/docs/adr.md", seam.docs.adr && `${seam.docs.adr}/0000-template.md`],
  ];
  for (const [from, to] of pairs) {
    if (!from || !to) continue;
    const src = join(baseRoot, from);
    const dest = join(target, to);
    if (!existsSync(src) || existsSync(dest)) continue;
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    created.push(to);
  }
  return created;
}

function configScaffold(profile) {
  const deny = [{ action: "edit", resource: "*", effect: "deny" }];
  if (profile?.opencode) {
    return {
      $schema: "https://opencode.ai/config.json",
      ...profile.opencode,
    };
  }
  return {
    $schema: "https://opencode.ai/config.json",
    model: "<provider/model>",
    agents: {
      "task-orchestrator": { model: "<provider/model#low>" },
      "plan-architect": { model: "<provider/model#medium>", permissions: deny },
      "quality-gatekeeper": { model: "<provider/model#medium>", permissions: deny },
      "security-auditor": { model: "<provider/model#medium>", permissions: deny },
    },
  };
}

function verifyProject(target) {
  const manifest = readManifest(target);
  if (!manifest) {
    console.error(`${MANIFEST_REL}: missing; cannot verify`);
    return { ok: false };
  }
  const { seam, errors } = loadSeam(target);
  const result = planCheck({
    projectDir: target,
    oldManifest: manifest,
    seamVersion: seam?.base?.version,
  });
  const problems = [...errors, ...result.problems];
  for (const file of result.changed) problems.push(`changed: ${file}`);
  for (const file of result.missing) problems.push(`missing: ${file}`);
  for (const file of result.extra) {
    console.log(`  extra: ${file} (not owned; project addition or stale)`);
  }
  console.log(
    `  check: ${problems.length === 0 ? "clean" : "drift found"} (${result.clean.length} files)`,
  );
  for (const problem of problems) console.log(`    ✗ ${problem}`);

  const report = doctor(target);
  console.log(`  doctor: ${report.errors.length === 0 ? "no errors" : "errors found"}`);
  for (const warning of report.warnings) console.log(`    ! ${warning}`);
  for (const error of report.errors) console.log(`    ✗ ${error}`);

  return { ok: problems.length === 0 && report.errors.length === 0 };
}

function newCommand(flags) {
  const baseRoot = requireSource(flags);
  const target = resolve(flags._[0] ?? ".");
  const version = readVersion(baseRoot);
  const project = flags.project ?? basename(target);
  const presetName = flags.preset ?? "checks-none";
  if (!resolvePresetName(presetName)) {
    console.error(
      `unknown preset: ${presetName} (use ${Object.keys(PRESETS).join(", ")}; ` +
        `${Object.keys(PRESET_ALIASES).join(", ")} are aliases)`,
    );
    return 2;
  }

  const seam = defaultSeam({ project, baseVersion: version });
  const preset = applyPreset(seam, presetName);
  applySeamFlags(seam, flags, { extended: true });

  if (!flags.config && (flags.profile || flags.noProfile)) {
    console.error("--profile and --no-profile only apply with --config");
    return 2;
  }

  const profileFile = flags.noProfile
    ? null
    : flags.profile
      ? resolve(flags.profile)
      : DEFAULT_PROFILE;
  const { profile, errors: profileErrors } = flags.config
    ? loadProfile(profileFile, { required: Boolean(flags.profile) })
    : { profile: null, errors: [] };
  if (profileErrors.length > 0) {
    printReport("The bootstrap profile is invalid:", { errors: profileErrors });
    return 2;
  }

  const install = installProject({ baseRoot, target, seam, flags });
  if (install.code !== 0) return install.code;
  if (install.dryRun) return 0;

  const surface = seam.verify.surface;
  const parts = [surface];
  if (seam.verify.widths?.length) parts.push(seam.verify.widths.join("/"));
  if (seam.verify.themes?.length) parts.push(seam.verify.themes.join("/"));
  console.log(
    `  preset: ${preset?.name ?? presetName}${preset?.alias ? ` (alias ${preset.alias})` : ""} — fills checks.build, checks.test, verify.surface/widths/themes only; no stack, layout or dependency`,
  );
  console.log(`  seam: ${SEAM_REL} (${parts.join("; ")})`);
  console.log(
    `  checks: build ${seam.checks.build?.command ?? "none"}; test ${seam.checks.test?.command ?? "none"}; ${seam.checks.free.length} free, ${seam.checks.paid.length} paid`,
  );

  const created = [];
  for (const key of ["issues", "adr", "notes"]) {
    const rel = seam.docs[key];
    if (!rel) continue;
    const abs = join(target, rel);
    if (!existsSync(abs)) {
      mkdirSync(abs, { recursive: true });
      created.push(rel);
    }
  }
  created.push(...scaffoldDocs(baseRoot, target, seam));
  console.log(
    `  docs: ${created.length > 0 ? `created ${created.join(", ")}` : "already present"}`,
  );

  let configWritten = false;
  let configFromProfile = false;
  if (flags.config) {
    const file = join(target, "opencode.json");
    if (existsSync(file)) {
      console.log("  config: opencode.json already exists; left as-is");
    } else {
      writeFileSync(file, `${JSON.stringify(configScaffold(profile), null, 2)}\n`, "utf8");
      configWritten = true;
      configFromProfile = Boolean(profile?.opencode);
      console.log(
        configFromProfile
          ? "  config: opencode.json written from the bootstrap profile (no placeholders)"
          : "  config: opencode.json written (fill the <provider/model> placeholders)",
      );
    }
  }

  if (profile?.agentsMd) {
    const agentsFile = join(target, "AGENTS.md");
    if (existsSync(agentsFile)) {
      const text = readFileSync(agentsFile, "utf8");
      const section = profile.agentsMd.trim();
      if (section && !text.includes(section)) {
        writeFileSync(agentsFile, `${text.trimEnd()}\n\n${section}\n`, "utf8");
        console.log("  agents: appended the profile's AGENTS.md section");
      }
    }
  }

  const verified = flags.noVerify ? { ok: true } : verifyProject(target);

  console.log("\nNext:");
  console.log(
    configFromProfile
      ? "  1. Review opencode.json and the council seats in AGENTS.md."
      : configWritten
        ? "  1. Fill the <provider/model> placeholders in opencode.json."
        : "  1. Merge the fragment from: node .opencode/tools/base.mjs print-config .",
  );
  console.log(
    configWritten
      ? "  2. Commit the vendored tree, the manifest, the seam, the AGENTS block and opencode.json."
      : "  2. Commit the vendored tree, the manifest, the seam and the AGENTS block.",
  );
  let next = 3;
  if (!verified.ok) {
    console.log(`  ${next++}. Run: node .opencode/tools/base.mjs doctor --fix .`);
  }
  console.log(`  ${next}. Start the first session with /start-project.`);
  if (seam.packs.length > 0) {
    console.log(
      `  · pack: node .opencode/tools/base.mjs pack install ${seam.packs[0]} .`,
    );
  }
  return verified.ok ? 0 : 1;
}

function updateCommand(flags) {
  const target = resolve(flags._[0] ?? ".");
  const manifest = readManifest(target);
  if (!manifest) {
    console.error(`${MANIFEST_REL}: missing; run \`base init\` first`);
    return 1;
  }
  const source = requireSource(flags);
  const version = readVersion(source);
  const { slots } = loadBaseRequirements(source);
  const incoming = newRequirements(manifest.version, version, slots);
  const { seam } = loadSeam(target);
  const packs = flags.pack ? toArray(flags.pack) : (manifest.packs ?? []);
  const files = readBaseFiles(source, listBaseFiles(source, packs));
  const block = renderBaseBlock(source, version);

  const plan = planUpdate({
    projectDir: target,
    files,
    oldManifest: manifest,
    newVersion: version,
    commit: gitCommit(source),
    block,
    packs,
    force: Boolean(flags.force),
  });

  const checkOnly = Boolean(flags.check) || Boolean(flags.dryRun);
  if (checkOnly) {
    console.log(`${manifest.version} -> ${version} (${packs.length} pack${packs.length === 1 ? "" : "s"})`);
    for (const write of plan.writes) console.log(`  write ${write.path}`);
    for (const del of plan.deletes) console.log(`  delete ${del}`);
    for (const conflict of plan.conflicts) console.log(`  ✗ ${conflict}`);
    if (incoming.length > 0) {
      console.log(`  new model requirements (${version}):`);
      for (const slot of incoming) console.log(`    · ${describeRequirement(slot)}`);
    }
    if (plan.conflicts.length > 0) return 1;
    return plan.writes.length > 0 || plan.deletes.length > 0 ? 1 : 0;
  }

  if (plan.conflicts.length > 0) {
    printReport("Refusing to update:", { errors: plan.conflicts });
    return 1;
  }

  const result = applyPlan(target, plan);
  console.log(`Updated ${manifest.version} -> ${version}.`);
  console.log(`  files: ${result.written.length} written, ${result.deleted.length} removed`);
  if (result.backupDir) console.log(`  backup: ${result.backupDir}`);
  if (incoming.length > 0) {
    console.log(`  new model requirements (${incoming.length}):`);
    for (const slot of incoming) console.log(`    · ${describeRequirement(slot)}`);
    console.log(
      "  Next: node .opencode/tools/base.mjs doctor . — bind the slots it lists.",
    );
  }
  return 0;
}

function checkCommand(flags) {
  const target = resolve(flags._[0] ?? ".");
  const manifest = readManifest(target);
  if (!manifest) {
    console.error(`${MANIFEST_REL}: missing; run \`base init\` first`);
    return 1;
  }
  const { seam, errors } = loadSeam(target);
  const result = planCheck({
    projectDir: target,
    oldManifest: manifest,
    seamVersion: seam?.base?.version,
  });
  const problems = [...errors, ...result.problems];
  console.log(`drax-ai-workflow ${manifest.version} at ${target}`);
  if (result.clean.length > 0) console.log(`  clean: ${result.clean.length} files`);
  for (const file of result.changed) console.log(`  changed: ${file}`);
  for (const file of result.missing) console.log(`  missing: ${file}`);
  for (const file of result.extra) {
    console.log(`  extra: ${file} (not owned; project addition or stale)`);
  }
  for (const problem of problems) console.log(`  ✗ ${problem}`);

  const bad =
    result.changed.length + result.missing.length + problems.length > 0;
  console.log(bad ? "\nDrift found." : "\nClean.");
  return bad ? 1 : 0;
}

function doctorCommand(flags) {
  const target = resolve(flags._[0] ?? ".");
  const home = flags.home ? resolve(flags.home) : undefined;
  if (flags.fix) {
    const fix = fixDoctor(target, { home, dryRun: Boolean(flags.dryRun) });
    if (fix.errors.length > 0) {
      printReport("Cannot fix:", { errors: fix.errors });
      return 1;
    }
    if (fix.actions.length === 0) {
      console.log("Nothing to fix.");
    } else {
      console.log(flags.dryRun ? "Would fix:" : "Fixed:");
      for (const action of fix.actions) console.log(`  · ${action}`);
    }
    if (flags.dryRun) return 0;
  }
  const result = doctor(target, home ? { home } : {});
  printReport(`Doctor: ${target}`, result);
  const ok = result.errors.length === 0;
  console.log(ok ? "\nNo errors." : "\nErrors found.");
  return ok ? 0 : 1;
}

function statusCommand(flags) {
  const target = resolve(flags._[0] ?? ".");
  const manifest = readManifest(target);
  if (!manifest) {
    console.error(`${MANIFEST_REL}: missing; run \`base init\` first`);
    return 1;
  }
  const { seam } = loadSeam(target);
  console.log(`drax-ai-workflow ${manifest.version}`);
  console.log(`  commit: ${manifest.commit || "(unknown)"}`);
  console.log(`  installed: ${manifest.installedAt}`);
  console.log(`  packs: ${(manifest.packs ?? []).join(", ") || "(none)"}`);
  if (seam) {
    console.log(`  project: ${seam.project}`);
    console.log(`  workflows: ${(seam.workflows ?? []).join(", ") || "(none)"}`);
    console.log(`  surface: ${seam.verify?.surface ?? "(unset)"}`);
  }
  let clean = 0;
  let modified = 0;
  let missing = 0;
  for (const [dest, hash] of Object.entries(manifest.files)) {
    const abs = projectFile(target, dest);
    if (!existsSync(abs)) {
      console.log(`  missing: ${dest}`);
      missing += 1;
    } else if (sha256(readFileSync(abs, "utf8")) !== hash) {
      console.log(`  modified: ${dest}`);
      modified += 1;
    } else {
      clean += 1;
    }
  }
  console.log(`  files: ${clean} clean, ${modified} modified, ${missing} missing`);
  return modified + missing > 0 ? 1 : 0;
}

function ejectCommand(flags) {
  const target = resolve(flags._[0] ?? ".");
  const manifest = readManifest(target);
  if (!manifest) {
    console.error(`${MANIFEST_REL}: missing; nothing to eject`);
    return 1;
  }
  const plan = planEject({ projectDir: target, manifest, force: Boolean(flags.force) });
  if (plan.conflicts.length > 0) {
    printReport("Refusing to eject:", { errors: plan.conflicts });
    return 1;
  }
  const extra = listExtraFiles(target, manifest);
  const result = applyPlan(target, plan, { dryRun: Boolean(flags.dryRun) });
  if (flags.dryRun) return 0;
  console.log(`Ejected drax-ai-workflow ${manifest.version}.`);
  console.log(`  removed: ${result.deleted.length} files`);
  console.log(`  left in place: ${SEAM_REL} (the project seam)`);
  for (const file of extra) {
    console.log(`  left in place: ${file} (not owned by the base)`);
  }
  return 0;
}

function printConfigCommand(flags) {
  const target = resolve(flags._[0] ?? ".");
  const { seam, errors } = loadSeam(target);
  if (!seam && errors.length > 0) {
    printReport("No valid seam:", { errors });
    return 1;
  }
  const deny = [
    { action: "edit", resource: "*", effect: "deny" },
  ];
  const fragment = {
    model: "<provider/model>",
    agents: {
      "task-orchestrator": { model: "<provider/model#low>" },
      "plan-architect": { model: "<provider/model#medium>", permissions: deny },
      "quality-gatekeeper": { model: "<provider/model#medium>", permissions: deny },
      "security-auditor": { model: "<provider/model#medium>", permissions: deny },
    },
  };
  console.log(JSON.stringify(fragment, null, 2));
  console.error(
    "\nMerge this into opencode.json. The base never writes opencode.json; the placeholders are yours to replace.",
  );
  return 0;
}

function requirementsCommand(flags) {
  const target = resolve(flags._[0] ?? ".");
  const { seam, errors: seamErrors } = loadSeam(target);
  if (!seam) {
    printReport("Cannot read requirements:", { errors: seamErrors });
    return 1;
  }
  const { slots, error } = loadProjectRequirements(target);
  if (error) {
    console.error(error);
    return 1;
  }

  let config = null;
  const configFile = join(target, "opencode.json");
  if (existsSync(configFile)) {
    try {
      config = JSON.parse(readFileSync(configFile, "utf8").replace(/^\uFEFF/, ""));
    } catch (parseError) {
      console.error(`opencode.json: ${parseError.message}`);
      return 1;
    }
  }

  const rows = slots.map((slot) => {
    const binding = bindingFor(slot, seam, config);
    const value = typeof binding.value === "string" ? binding.value.trim() : "";
    const state =
      value.length === 0 ? "unbound" : /^<.*>$/.test(value) ? "placeholder" : "bound";
    return {
      id: slot.id,
      state,
      serves: slot.serves ?? [],
      purpose: slot.purpose ?? "",
      since: slot.since ?? null,
      needs: slot.needs ?? {},
      key: slot.bind.kind === "agent" ? `agents.${slot.bind.agent}.model` : slot.bind.path,
      file: binding.file,
      value: value || null,
    };
  });

  if (flags.json) {
    console.log(JSON.stringify({ project: target, slots: rows }, null, 2));
    return 0;
  }

  const bound = rows.filter((row) => row.state === "bound").length;
  console.log(`Model slots: ${target}`);
  console.log(`  ${bound}/${rows.length} bound`);
  for (const row of rows) {
    const id = row.id.padEnd(20);
    const state = row.state.padEnd(12);
    console.log(`  ${id} ${state} ${row.key}${row.value ? ` = ${row.value}` : ""}`);
    if (row.state === "bound") continue;
    const modality =
      Array.isArray(row.needs.modality) && row.needs.modality.length > 0
        ? `${row.needs.modality.join(" + ")} input`
        : "";
    const needs = [modality, row.needs.workShape].filter(Boolean).join(", ");
    const action =
      row.state === "placeholder"
        ? `replace the placeholder in ${row.file}`
        : `add it to ${row.file} after asking`;
    console.log(
      `  ${"".padEnd(20)} ${"".padEnd(12)} ${needs ? `needs ${needs}; ` : ""}${action}`,
    );
  }
  return 0;
}

function ciCommand(flags) {
  const target = resolve(flags._[0] ?? ".");
  const script = join(dirname(fileURLToPath(import.meta.url)), "..", "base.mjs");
  const steps = [];
  let ok = true;

  const runStep = (name, args) => {
    const result = spawnSync(process.execPath, [script, ...args], {
      encoding: "utf8",
      stdio: flags.json ? "pipe" : "inherit",
    });
    const status = result.status ?? 1;
    steps.push({
      name,
      status,
      stdout: flags.json ? result.stdout : undefined,
      stderr: flags.json ? result.stderr : undefined,
    });
    if (status !== 0) ok = false;
    return status;
  };

  runStep("check", ["check", target]);
  runStep("doctor", ["doctor", target]);

  if (!flags.noBenchmark) {
    const packsDir = join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "benchmarks",
      "packs",
    );
    const packDirs = existsSync(packsDir)
      ? readdirSync(packsDir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => join(packsDir, entry.name))
      : [];
    if (packDirs.length === 0) {
      steps.push({ name: "benchmark", status: 0, skipped: "pack not installed" });
    } else {
      for (const dir of packDirs) {
        runStep(`benchmark:${basename(dir)}`, ["benchmark", "validate", "--pack", dir]);
      }
    }
  }

  if (flags.withProjectChecks) {
    const { seam, errors } = loadSeam(target);
    if (!seam) {
      steps.push({ name: "project checks", status: 1, stderr: errors.join("; ") });
      ok = false;
    } else {
      const entries = [
        ["build", seam.checks.build],
        ["test", seam.checks.test],
        ...seam.checks.free.map((entry, index) => [`free[${index}]`, entry]),
      ].filter(([, entry]) => entry && entry.command);
      for (const [name, entry] of entries) {
        const cwd = entry.cwd ? resolve(target, entry.cwd) : target;
        const result = spawnSync(entry.command, {
          cwd,
          shell: true,
          encoding: "utf8",
          stdio: flags.json ? "pipe" : "inherit",
        });
        const status = result.status ?? 1;
        steps.push({
          name: `project ${name}`,
          status,
          stdout: flags.json ? result.stdout : undefined,
          stderr: flags.json ? result.stderr : undefined,
        });
        if (status !== 0) ok = false;
      }
    }
  }

  if (flags.json) {
    console.log(JSON.stringify({ target, ok, steps }, null, 2));
  } else {
    console.log(ok ? "\nCI: pass." : "\nCI: fail.");
  }
  return ok ? 0 : 1;
}

function findCommand(flags) {
  const query = flags._[0];
  const target = resolve(flags._[1] ?? ".");
  if (!query || typeof query !== "string") {
    console.error("usage: base find <question> [target] [--code] [--no-commits] [--limit n]");
    return 2;
  }
  const limit = flags.limit === undefined ? 20 : Number(flags.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    console.error("find: --limit must be an integer from 1 to 100");
    return 2;
  }
  const result = findInProject(target, query, {
    code: Boolean(flags.code),
    commits: !flags.noCommits,
    limit,
  });
  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return result.total > 0 ? 0 : 1;
  }
  console.log(`Recall: "${query}" in ${target}`);
  if (result.docs.length === 0 && result.commits.length === 0) {
    console.log("  no matches; try fewer or different words");
    return 1;
  }
  for (const hit of result.docs) {
    console.log(`  ${hit.file}:${hit.line}  (${hit.score})`);
    console.log(`    ${hit.text}`);
  }
  for (const hit of result.commits) {
    console.log(`  commit ${hit.commit} ${hit.date}  ${hit.text}`);
  }
  return 0;
}

function fleetCommand(flags) {
  const root = resolve(flags._[0] ?? ".");
  const depth = flags.depth === undefined ? 3 : Number(flags.depth);
  if (!Number.isInteger(depth) || depth < 1 || depth > 8) {
    console.error("fleet: --depth must be an integer from 1 to 8");
    return 2;
  }
  const result = fleet(root, { maxDepth: depth });
  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return flags.check && (result.summary.drifted > 0 || result.summary.unbound > 0) ? 1 : 0;
  }
  console.log(`Fleet: ${result.root} (${result.summary.total} projects)`);
  if (result.projects.length === 0) {
    console.log("  no projects with .opencode/.workflow-manifest.json found");
    return 0;
  }
  console.log("  project                          version  files  drift  slots  installed");
  for (const project of result.projects) {
    const drift = project.drift ? `${project.changed}/${project.missing}` : "clean";
    const slots = `${project.slots - project.unbound - project.placeholder}/${project.slots}`;
    console.log(
      `  ${project.project.padEnd(32)} ${String(project.version).padEnd(8)} ${String(project.files).padEnd(6)} ${drift.padEnd(6)} ${slots.padEnd(6)} ${project.installedAt ?? ""}`,
    );
  }
  console.log(
    `  summary: ${result.summary.drifted} drifted, ${result.summary.unbound} unbound, ${result.summary.placeholders} placeholder`,
  );
  return flags.check && (result.summary.drifted > 0 || result.summary.unbound > 0) ? 1 : 0;
}

function docsCommand(flags) {
  const target = resolve(flags._[1] ?? ".");
  const { seam, errors } = loadSeam(target);
  if (!seam) {
    printReport("Cannot check docs:", { errors });
    return 1;
  }

  const result = auditDocs(target, { seam });
  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return result.links.broken.length > 0 ? 1 : 0;
  }

  console.log(`Docs: ${target}`);
  console.log(
    `  links: ${result.links.checked} checked in ${result.links.files} markdown files`,
  );
  for (const broken of result.links.broken) {
    console.log(`  ✗ ${broken.file}: missing ${broken.target}`);
  }
  console.log(`  adr: ${result.adr.checked} decision records checked`);
  for (const issue of result.adr.issues) {
    console.log(`  ! ${issue.file}: ${issue.reason}`);
  }
  return result.links.broken.length > 0 ? 1 : 0;
}

async function probeCommand(flags) {
  const slotId = flags.slot ?? flags._[0];
  const target = resolve(flags._[1] ?? ".");
  if (!slotId) {
    console.error("usage: base probe <slot> [target] [--full] [--budget-usd <usd>] [--dry-run]");
    return 2;
  }

  const result = await probeSlot({ projectDir: target, slotId, flags });
  if (!result.ok && result.error) {
    console.error(`probe: ${result.error}`);
    return 1;
  }
  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }
  console.log(`Probe: ${result.slot} -> ${result.selector}`);
  console.log(`  budget: $${result.budgetUsd}; suite: ${result.suite.join(", ")}`);
  if (result.dryRun) {
    console.log("  dry run: no provider call");
    return 0;
  }
  for (const entry of result.results) {
    const cost = entry.costUsd === null ? "cost unknown" : `$${entry.costUsd}`;
    console.log(`  ${entry.name.padEnd(13)} ${entry.status.padEnd(11)} ${cost}  ${entry.detail ?? ""}`);
  }
  console.log(`  spent: $${result.spentUsd}`);
  return result.ok ? 0 : 1;
}

function runProjectInfo(target, flags) {
  const manifest = readManifest(target);
  const { seam } = loadSeam(target);
  const source = sourceRoot(flags);
  return {
    base: {
      name: "drax-ai-workflow",
      version: manifest?.version ?? (source ? readVersion(source) : null) ?? "unknown",
      commit: manifest?.commit ?? gitCommit(target),
    },
    project: seam?.project ?? basename(target),
  };
}

function parseUsage(flags) {
  const usage = {};
  for (const [key, flag] of [
    ["inputTokens", "tokensIn"],
    ["outputTokens", "tokensOut"],
    ["costUsd", "costUsd"],
    ["latencyMs", "latencyMs"],
  ]) {
    if (flags[flag] === undefined) continue;
    const value = Number(flags[flag]);
    if (!Number.isFinite(value)) {
      throw new Error(`--${flag.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} must be a number`);
    }
    usage[key] = value;
  }
  return Object.keys(usage).length > 0 ? usage : undefined;
}

function runCommand(flags) {
  const sub = flags._[0];
  const target = resolve(
    sub === "start" || sub === "record" || sub === "list" || sub === "summary" || sub === "export"
      ? flags._[1] ?? "."
      : flags._[2] ?? ".",
  );

  if (sub === "start") {
    if (!flags.kind) {
      console.error("usage: base run start --kind <kind> --task <text> [target]");
      return 2;
    }
    const info = runProjectInfo(target, flags);
    const result = startRun({
      projectDir: target,
      kind: flags.kind,
      task: flags.task,
      project: info.project,
      base: info.base,
      commit: gitCommit(target),
      models: flags.models ? String(flags.models).split(",").map((s) => s.trim()).filter(Boolean) : [],
      rubric: flags.rubric,
      protocol: flags.protocol,
      pack: toArray(flags.pack)[0],
      operator: flags.operator,
      notes: flags.note,
      evidence: toArray(flags.evidence),
    });
    if (flags.json) {
      console.log(JSON.stringify(result.run, null, 2));
    } else {
      console.log(`Run ${result.run.id} started (${result.run.kind}).`);
      console.log(`  ledger: ${result.file}`);
    }
    return 0;
  }

  if (sub === "finish") {
    const id = flags._[1];
    if (!id || !flags.status) {
      console.error("usage: base run finish <id> --status <status> [target]");
      return 2;
    }
    const result = finishRun(target, id, {
      status: flags.status,
      verdict: flags.verdict,
      notes: flags.note,
      usage: parseUsage(flags),
      scores: flags.score !== undefined ? { score: Number(flags.score) } : undefined,
      evidence: toArray(flags.evidence),
    });
    if (flags.json) console.log(JSON.stringify(result.run, null, 2));
    else console.log(`Run ${result.run.id} ${result.run.status}.`);
    return 0;
  }

  if (sub === "record") {
    if (!flags.file) {
      console.error("usage: base run record --file <run.json> [target]");
      return 2;
    }
    const file = resolve(flags.file);
    const value = JSON.parse(readFileSync(file, "utf8"));
    const result = recordRun(target, value);
    if (flags.json) console.log(JSON.stringify(result.run, null, 2));
    else console.log(`Recorded run ${result.run.id}.`);
    return 0;
  }

  if (sub === "list" || sub === "summary") {
    const result = listRuns(target);
    if (flags.json) {
      console.log(JSON.stringify(sub === "summary" ? summarizeRuns(result.runs) : result, null, 2));
      return result.errors.length > 0 ? 1 : 0;
    }
    if (sub === "summary") {
      const summary = summarizeRuns(result.runs);
      console.log(`Runs: ${summary.total} in ${target}`);
      for (const [kind, count] of Object.entries(summary.byKind).sort()) {
        console.log(`  ${kind}: ${count}`);
      }
      for (const [status, count] of Object.entries(summary.byStatus).sort()) {
        console.log(`  ${status}: ${count}`);
      }
      console.log(`  cost: $${summary.costUsd}`);
      return result.errors.length > 0 ? 1 : 0;
    }
    console.log(`Runs: ${result.runs.length} in ${target}`);
    for (const run of result.runs) {
      console.log(
        `  ${run.id}  ${run.kind.padEnd(13)} ${run.status.padEnd(8)} ${run.task ?? ""}`,
      );
    }
    for (const error of result.errors) console.log(`  ! ${error}`);
    return result.errors.length > 0 ? 1 : 0;
  }

  if (sub === "show") {
    const id = flags._[1];
    if (!id) {
      console.error("usage: base run show <id> [target]");
      return 2;
    }
    const result = showRun(target, id);
    if (!result.run) {
      console.error(`no run ${id}`);
      return 1;
    }
    console.log(JSON.stringify(result.run, null, 2));
    return 0;
  }

  if (sub === "export") {
    const result = exportRuns(target, flags.out);
    console.log(`Exported ${result.runs} run(s) to ${result.file}.`);
    return result.errors.length > 0 ? 1 : 0;
  }

  console.error(
    "usage: base run start|finish|record|list|show|summary|export ... (see base help)",
  );
  return 2;
}

function packCommand(flags) {
  const [sub, name, targetArg] = flags._;
  const target = resolve(targetArg ?? ".");
  if (sub !== "install" || !name) {
    console.error("usage: base pack install <name> [target]");
    return 2;
  }
  const script = join(target, ".opencode", "packs", name, "install.mjs");
  if (!existsSync(script)) {
    console.error(`pack ${name} is not vendored in ${target}`);
    return 1;
  }
  const result = spawnSync(process.execPath, [script], { cwd: target, stdio: "inherit" });
  return result.status ?? 1;
}

const HELP = `drax-ai-workflow base

Usage:
  base new [target] [flags]        install a new project with a preset seam
  base init [target] [flags]       install a pinned base into a project
  base update [target] [--check]   bump the base to the current source version
  base check [target]              report drift against the manifest
  base doctor [target] [--fix]     validate the seam, config and global shadowing
  base status [target]             show the version, files and seam summary
  base eject [target]              remove the base-owned files and the AGENTS block
  base print-config [target]       print the opencode.json fragment to merge
  base requirements [target]       list the model slots and their binding state
  base docs check [target]         validate doc links and ADR status (also runs in doctor)
  base fleet [root] [--depth n]    read-only version/drift/slot view across projects
  base find <question> [target]    search docs, notes and commit messages (no embeddings)
  base ci [target]                 check + doctor + benchmark validate (CI wrapper)
  base probe <slot> [target]       capability probe for a bound model slot
  base run start|finish|record|list|show|summary|export
                                   JSONL evidence ledger under .scratch/runs/
  base benchmark run|report|validate   model benchmark harness (see tools/benchmark.mjs)
  base pack install <name> [target]
  base version

Flags:
  --from <dir>         source checkout (or WORKFLOW_BASE)
  --force              overwrite modified or differing files
  --dry-run            print the plan, write nothing
  --project <name>     seam project name
  --preset <name>      checks-none | checks-web | checks-cli | checks-docs (new;
                       bare/web/cli/docs are aliases; fills checks and the
                       verify surface only, never a stack or layout)
  --build/--test       seam check commands
  --free/--paid        repeatable seam check commands
  --surface <kind>     web | cli | api | docs | none
  --seed/--capture     visual verification hints
  --widths/--themes    comma lists (new)
  --config             write opencode.json once when absent (new)
  --profile <file>     bootstrap profile for --config (default ~/.config/drax/bootstrap.json)
  --no-profile         ignore the bootstrap profile and write placeholders
  --no-verify          skip the post-install check and doctor (new)
  --fix                apply the mechanical doctor fixes
  --pack <name>        repeatable pack selection
`;

export async function run(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);

  try {
    switch (command) {
      case "new":
        return newCommand(flags);
      case "init":
        return initCommand(flags);
      case "update":
        return updateCommand(flags);
      case "check":
        return checkCommand(flags);
      case "doctor":
        return doctorCommand(flags);
      case "status":
        return statusCommand(flags);
      case "eject":
        return ejectCommand(flags);
      case "requirements":
        return requirementsCommand(flags);
      case "docs":
        return docsCommand(flags);
      case "fleet":
        return fleetCommand(flags);
      case "find":
        return findCommand(flags);
      case "ci":
        return ciCommand(flags);
      case "probe":
        return probeCommand(flags);
      case "run":
        return runCommand(flags);
      case "benchmark": {
        const script = join(dirname(fileURLToPath(import.meta.url)), "..", "benchmark.mjs");
        const result = spawnSync(process.execPath, [script, ...rest], { stdio: "inherit" });
        return result.status ?? 1;
      }
      case "print-config":
        return printConfigCommand(flags);
      case "pack":
        return packCommand(flags);
      case "version":
      case "--version":
      case "-v": {
        const root = sourceRoot(flags);
        if (root) {
          console.log(readVersion(root));
          return 0;
        }
        const manifest = readManifest(resolve(flags._[0] ?? "."));
        if (manifest) {
          console.log(manifest.version);
          return 0;
        }
        console.log("unknown (no base checkout and no manifest)");
        return 1;
      }
      case undefined:
      case "help":
      case "--help":
      case "-h":
        console.log(HELP);
        return 0;
      default:
        console.error(`unknown command: ${command}\n`);
        console.log(HELP);
        return 2;
    }
  } catch (error) {
    if (error.conflicts) {
      printReport("Refusing to write:", { errors: error.conflicts });
    } else {
      console.error(error.message);
    }
    return 1;
  }
}