#!/usr/bin/env node
import { resolve } from "node:path";
import { sha256 } from "./lib/hash.mjs";
import {
  buildPrompt,
  loadBrief,
  loadManifest,
  resolveReviewer,
  runReview,
} from "./lib/visual-review.mjs";

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
    if (eq !== -1) {
      flags[camel] = body.slice(eq + 1);
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
      flags[camel] = argv[i + 1];
      i += 1;
    } else {
      flags[camel] = true;
    }
  }
  return flags;
}

const USAGE = `usage: visual-review --manifest <file> --brief <file> --out <dir> [options]

  --project <dir>    project root (default .)
  --manifest <file>  shot manifest: { "shots": [{ "id", "file", ... }] }
  --brief <file>     the neutral visual brief every reviewer receives
  --out <dir>        where findings.glm.json (and merged.json) are written
  --gate <file>      the gate's findings, to write merged.json
  --run <n>          run number for the artifact (default 1)
  --max-tokens <n>   output budget (default 2000)
  --timeout <ms>     per-call timeout (default 60000)
  --model <selector> override the seam model for a benchmark; does not rebind
  --dry-run          resolve the reviewer and prompt without calling the provider`;

const flags = parseFlags(process.argv.slice(2));
if (flags.help) {
  console.log(USAGE);
  process.exit(0);
}

const projectDir = resolve(flags.project ?? ".");
const manifestPath = flags.manifest ? resolve(flags.manifest) : null;
const briefPath = flags.brief ? resolve(flags.brief) : null;
const outDir = flags.out ? resolve(flags.out) : null;

if (!manifestPath || !briefPath || !outDir) {
  console.error(USAGE);
  process.exit(2);
}

const reviewer = resolveReviewer(projectDir, process.env, flags.model ?? null);
if (reviewer.error) {
  // Unbound is a skip, not a failure: the gate proceeds single-judge and the
  // artifact records why.
  if (/is unbound/.test(reviewer.error)) {
    console.log(`skipped: ${reviewer.error}`);
    process.exit(0);
  }
  console.error(reviewer.error);
  process.exit(2);
}

if (flags.dryRun) {
  const manifest = loadManifest(manifestPath);
  const brief = loadBrief(briefPath);
  if (manifest.error) {
    console.error(manifest.error);
    process.exit(2);
  }
  if (brief.error) {
    console.error(brief.error);
    process.exit(2);
  }
  const prompt = buildPrompt({ brief: brief.text, shots: manifest.shots });
  console.log(`visual review (dry run): ${reviewer.selector}`);
  console.log(`  endpoint: ${reviewer.baseURL}`);
  console.log(`  shots: ${manifest.shots.length}`);
  console.log(`  brief: ${sha256(brief.text)}`);
  console.log(`  prompt: ${prompt.length} chars`);
  process.exit(0);
}

const result = await runReview({
  projectDir,
  manifestPath,
  briefPath,
  outDir,
  gatePath: flags.gate ? resolve(flags.gate) : undefined,
  run: Number.parseInt(flags.run ?? "1", 10) || 1,
  maxTokens: Number.parseInt(flags.maxTokens ?? "2000", 10) || 2000,
  timeoutMs: Number.parseInt(flags.timeout ?? "60000", 10) || 60000,
  selector: flags.model ?? null,
});

if (result.ok) {
  console.log(`visual review: ${reviewer.selector} (run ${result.envelope.run})`);
  console.log(`  findings: ${result.envelope.findings.length}`);
  console.log(`  wrote: ${result.file}`);
  if (result.mergedFile) {
    const { pairs, gateOnly, glmOnly } = result.merged;
    console.log(
      `  merge: ${pairs.length} paired, ${gateOnly.length} gate-only, ${glmOnly.length} glm-only`,
    );
    console.log(`  wrote: ${result.mergedFile}`);
  }
  process.exit(0);
}

if (result.code === "manifest" || result.code === "brief") {
  console.error(result.message);
  process.exit(2);
}

console.error(`review failed (${result.code}): ${result.message}`);
if (result.file) console.error(`  wrote: ${result.file}`);
process.exit(1);