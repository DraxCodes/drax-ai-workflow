# Drax AI Workflow

The authored source of a project-agnostic OpenCode workflow set: a council for
divergent decisions, a hillclimb loop with a named 1-10 rubric, grilling,
handoff, a security lens, domain-doc and issue-tracker conventions, and the `base`
CLI that vendors them into a project.

The same workflows also run in **VS Code Copilot Chat**; `base new`/`init`/`update`
generate a `.github/` bridge (see [VS Code Copilot Chat](#vs-code-copilot-chat)),
so one prompt starts a project in either harness.

The **base never runs in a project**. Each project carries a pinned copy under
`.opencode/` and a small seam (`.opencode/workflow.json`). The copy is committed,
reviewable and hash-checked; the seam is project-edited and base-validated.

## Why vendored, not global

A global install at `~/.config/opencode` cannot be versioned per project: whatever
is in the global path is what every project loads. That is how this base's
predecessor drifted — four agents 140 lines behind, no global commands or skills,
and a partial global config. Vendoring makes the version visible in the project's
diff, lets two projects pin different versions, and makes drift a `check` failure
instead of a surprise.

## Contents

```
agents/        task-orchestrator, plan-architect, quality-gatekeeper, security-auditor
commands/      council, start-project, hillclimb, grill-me, handoff
skills/        council, hillclimb (+ four rubrics), grilling, handoff, workflow-base, find-skills, context-engineering
packs/         engineering (optional third-party skills)
benchmarks/    model benchmark protocol, task packs and measured records
schema/        the seam JSON Schema
templates/     a starter seam and the copy-paste prompts
tools/         the `base` CLI, visual review and benchmark scripts (vendored into every project)
AGENTS.base.md the managed block injected into a project AGENTS.md
VERSION        the release version; git tags are the immutable store
```

Generated into a project by the Copilot bridge (source of truth stays under
`.opencode/`):

```
.github/skills/<id>/   one Agent Skill per command and skill (SKILL.md + references)
.github/agents/        plan-architect, quality-gatekeeper, security-auditor (.agent.md)
```

The base owns no `opencode.json`. Provider, model, permissions, compaction and tool
output are the project's. Agents carry no `model:` and no permissions; they inherit
the project's, and the project supplies the cheap per-agent models and the
read-only edit-deny rules for the subagents. The one exception is the opt-in
`base new --config` scaffold, written only when the file is absent; the base never
updates it afterwards. A machine-local **bootstrap profile** can fill that
scaffold, so the public base names no provider (see below).

## Start from a prompt

The shortest path from an empty folder to project work is one prompt. Open
OpenCode in the empty folder and paste (the same block works in Copilot Chat —
see [VS Code Copilot Chat](#vs-code-copilot-chat)):

<!-- prompt:new-project:begin -->
```text
Set up this folder with Drax AI Workflow, then start the project.

1. Clone https://github.com/DraxCodes/drax-ai-workflow into a temp dir
   (or use $env:WORKFLOW_BASE when it is set); call that path <base>.
2. Run:
   node <base>/tools/base.mjs new . --project <name> --preset checks-web --config
   (use --preset checks-none with --build/--test/--surface for a non-web stack)
3. Optional engineering skills:
   node .opencode/tools/base.mjs pack install engineering .
4. Run: node .opencode/tools/base.mjs requirements .
   If a slot is unbound or still a placeholder, ask me which model to bind — ranked
   options with modality, price and lineage, plus "assign later". Do not bind one
   without my answer. Probe the model you bound with one one-token call.
5. If this folder is not a git repo, run git init, add the stack's .gitignore
   (include .scratch/ for local specs and benchmark runs) and commit the baseline.
   Delete the temp clone.
6. Do not write app code yet. Tell me to restart the session so the new agents,
   skills and commands load, then run /start-project <my idea>.
```
<!-- prompt:new-project:end -->

`base new` prints `check` and `doctor` results, so the baseline is verified before
you leave the prompt. Agents, commands and skills written mid-session may not be
visible until OpenCode restarts; that restart is why the last step exists.
`/start-project` turns the idea into an approved first spec in the issue directory
and stops — it does not scaffold the stack or write app code.

## Update from a prompt

In a project that already carries the base, paste this to pull a newer release:

<!-- prompt:update-project:begin -->
```text
Update this project's vendored Drax AI Workflow, then tell me what needs configuring.

1. Clone https://github.com/DraxCodes/drax-ai-workflow into a temp dir
   (or use $env:WORKFLOW_BASE when it is set); call that path <base>.
2. Plan with the base's own CLI, so the release's new requirements are listed:
   node <base>/tools/base.mjs update . --from <base> --check
3. Apply with this project's vendored CLI:
   node .opencode/tools/base.mjs update . --from <base>
   If it refuses on locally modified files, list them and stop. Do not use --force
   without asking me.
4. Run: node .opencode/tools/base.mjs doctor .
   and: node .opencode/tools/base.mjs requirements .
5. Report: old -> new version, files changed, and every unbound or placeholder slot.
6. For each unbound slot, ask me which model to bind — ranked options with modality,
   price and lineage, plus "assign later". Do not bind a model without my answer.
   Probe the model you bound with one one-token call and record the result.
7. If the update changed agents, commands or skills, tell me to restart the session.
   Delete the temp clone. Do not commit anything I have not seen.
```
<!-- prompt:update-project:end -->

`update` refuses locally modified files unless `--force`; the prompt tells the agent
to list them and stop instead of forcing. New releases that add a model slot are
announced by `update` and then reported by `requirements` — that is the moment the
agent asks which model to bind.

## Hillclimb rubrics

The hillclimb gate is a named 1–10 rubric, not one fixed scale. Four ship in the
`hillclimb` skill's `references/rubrics/`:

| Rubric | Artifact | Gate question |
| --- | --- | --- |
| `perception` | UI, UX, visual surfaces, copy, rendered docs | Does it land well with a person looking at it? |
| `usability` | API, CLI, errors, logs, config, docs | Can a first-time user get value without guessing? |
| `performance` | latency, throughput, memory, size, build time, cost | Does it meet a budget declared before measuring? |
| `completeness` | a spec, proposal, architecture choice, built feature | Is every obligation decided, including the unnamed ones? |

Selection happens once, before the first score:

1. `Rubric: <name>` in the task or spec wins.
2. Otherwise the seam's `rubrics.default` (`"rubrics": { "default": "performance" }`).
3. Otherwise `perception`.

The shared parts never move: the seam's `checks` are the floor, a red floor cannot
score 8, scores are whole numbers, 8 ships unless a 10 was demanded, and two
iterations without a higher score stop the run. What changes per rubric is the
probes, the level anchors, and the evidence a score must cite.

`completeness` is the "what did I miss?" gate: it scores an artifact against a
filled obligation inventory (actors, inputs, states, failure, permissions, data
lifecycle, limits, observability, compatibility, cost, security, dependencies,
non-goals). A short spec that decides every row beats a long one that decides
none. Use it to hillclimb a feature proposal before building it.

`performance` requires the budget table — metric, baseline, target, method and
environment — to be declared *before* the first measurement. A target chosen after
seeing the number is void.

A project can add its own rubric file and name it in `rubrics.default`; a path
like `docs/rubrics/security.md` is accepted and `doctor` resolves it. The
`docs.rubricAddendum` still extends whichever rubric is selected.

`perception` also has an independent reviewer. Before the first SHIP or STOP verdict,
the gate runs a scripted blindspot pass over the same screenshots with a second model
(`seam.visualReview.model`). It reports findings and never a score; the gatekeeper
accepts or rejects each one against the shots, and a disagreement evidence cannot
settle stops the loop and goes to the user. One run, plus one more when the gate names
a low-confidence trigger. With no model bound the pass is skipped and recorded — it
never falls back to the gate's own model.

## Spend discipline

Cost follows **context size**, not step count. A ten-step task on a few files is cheap;
one review that reads a whole tree is not. Three tiers exist and are not interchangeable:

| Tier | Scope | Frequency |
| --- | --- | --- |
| Lens (`security-auditor`) | one change, as a diff | every change |
| Gate (`quality-gatekeeper`) | one artifact, as evidence | every hillclimb iteration |
| Audit (a review since a fixed point) | the diff or tree since a tag | a release or branch end, once |

The rules, also in the managed `AGENTS.md` block so every session and both harnesses
load them:

- **Scope every review before starting it** — a fixed point plus paths, never "the repo".
- **Default to the change, not the repository.** Whole-tree only at a release, once.
- **Give a delegated brief a scope.** A subagent starts with no context; what you point it
  at is the whole cost.
- **Escalate the model, not the scope.** Send the finding, not the diff it came from.
- **State the cost of a big review in one line before running it.**

An audit's cost is the brief, not the model: slice it, state claims rather than handing
over dependencies, and ask for findings rather than confirmation — a neutral brief catches
what a checklist rules out by assumption. The same reasoning seats models: a read-heavy
lens can sit on a cheap model precisely because the brief, not the price per token, is what
the bill is made of. Put candidates on the same real change and keep the cheapest one whose
findings survive verification.

Estimates in a UI usually price tokens at list rates. A discounted provider can bill a
fraction of that, so treat a displayed figure as an upper bound and check the invoice
before concluding a model is expensive.

## Model benchmarks

A slot recommendation is only as good as its evidence. The measured tier now ships
a protocol, task packs and records, all base-owned and hashed with the release, so
every project that updates sees the same evidence.

The first pack is `security-review` for `council.risk`: ten short, self-contained
code slices with an exhaustive key. Each model reviews the slice blind — the brief
and the files, never the key — and the harness scores caught defects, misses, false
positives, severity mismatches, tokens, estimated cost and latency. Two models on
the same pack also get **unique catch** and **agreement**: what one caught that the
other missed, which is the question a second seat exists to answer.

```sh
node .opencode/tools/base.mjs benchmark validate
node .opencode/tools/base.mjs benchmark report --slot council.risk
```

A model is **measured** only with at least ten distinct scored tasks and no failed
task. Fewer is a **pilot**: it can justify one more run, never a permanent
assignment. Evidence older than 180 days is stale and ranks below fresh measured
evidence.

Benchmarks are paid work, so the harness defaults to refusing spend. A real run
needs an explicit model list, a `--budget-usd` cap, and a declared price for every
model (`opencode.json` model `cost`, or `--prices`); `--price-band` (default 2×)
refuses a candidate priced far above the reference instead of silently dropping it.
Preflight prints the worst-case estimate, the run stops at the cap, and retries
default to zero. `--dry-run` makes no provider call.

```sh
node .opencode/tools/benchmark.mjs run \
  --models provider/model-a,provider/model-b \
  --reference-model provider/model-a \
  --budget-usd 1 --prices prices.json --dry-run
```

A run writes a record fragment under `.scratch/` (keep it out of git; the start
prompt adds `.scratch/` to the project `.gitignore`). In a base
checkout, an explicit `benchmark promote <run-dir>` merges it into
`benchmarks/records.json`; the command refuses in a project, so a project never
writes base evidence. The full protocol and pack shape are in
[`benchmarks/protocol.md`](benchmarks/protocol.md). The visual pack is deferred
until the provider image quota allows it; the same protocol and scoring apply.

The report groups by pack hash, `max_tokens` and retry count, so a changed fixture
or a different output budget cannot silently rank as the same evidence. A malformed
answer is a failed task, not a repaired one; the key is never shown to the model.

## Docs for the next agent

The workflow writes down what it learned. `docs.notes` (default `docs/notes/`) is a
working notebook: one note per topic, for an agent rather than a person, committed so it
survives a change of machine.

A note earns its place when a session lost time to something that will cost the next one
the same time — a library behaving unlike its documentation, a version-specific detail an
upgrade will break, an environment quirk producing a misleading error, or the reliable way
to run a project's common procedure. Each carries the version it was written against and
the file or command that shows it, and states the cause rather than only the symptom.

Notes are distinct from the other doc kinds the seam names: an ADR records a decision, a
glossary defines a domain term, a spec states a requirement, and a note records a fact
about the tools. The managed block carries the writing rule, so every project inherits it;
`doctor` warns while the directory is absent.

## Handoff

A session that ends by compaction or at a work-item boundary leaves a `/handoff` document
in the OS temp directory: the focus, the branch and commit, the decisions still open, the
traps already paid for, the skills to load next, and a pasteable starting prompt. It links
to the spec, issues and commits rather than copying them.

The trigger is in the managed `AGENTS.md` block, because a handoff nobody remembers to write
costs the next session everything the last one learned.

## VS Code Copilot Chat

Copilot Chat reads `AGENTS.md` directly, so the managed block and the project's own
rules load without a second instruction file. The rest of the workflow is bridged
into the two native Copilot formats when `base new`, `init` or `update` copies a
tree:

| Generated | Source | Purpose |
| --- | --- | --- |
| `.github/skills/<id>/SKILL.md` | `commands/<id>.md` and `skills/<id>/SKILL.md` | Agent Skills, which Copilot shows as `/<id>` slash commands and auto-loads from their description |
| `.github/agents/<id>.agent.md` | `agents/<id>.md` for the three lenses | Custom agents: `plan-architect` (read/search), `quality-gatekeeper` (adds `execute`), `security-auditor` (adds `execute`, `web`) |

The bridge is generated, never hand-edited — the canonical files stay under
`.opencode/`, and `base check` reports drift. Some mechanics differ from OpenCode:

- A command and a skill can share an id (`council`, `hillclimb`, `handoff`).
  Copilot keeps one skill per directory, so the generated `SKILL.md` is the command's
  entry point with the canonical skill body appended as a reference section.
- The command frontmatter's `agent:` is dropped, `$ARGUMENTS` becomes "the text the
  user typed after `/<id>`", and each skill's `name` is normalized to its directory
  (Copilot silently ignores a skill whose `name` and directory disagree).
- The skill body points at the canonical `.opencode/agents/` and `.opencode/skills/`
  paths, because the generated copies are what Copilot loads.

To use it: open the new folder in VS Code, open Copilot Chat, and paste the same
[prompt block](#start-from-a-prompt). After `base new` finishes, start a **new chat**
(the Copilot equivalent of the restart), then type `/start-project <idea>`.
`/council`, `/hillclimb`, `/grill-me` and `/handoff` are available the same way, and
the three lens agents appear in the agent picker.

`--no-copilot` skips the bridge on `new`, `init` and `update` and removes an existing
`.github/skills` + `.github/agents` tree. `doctor` prints `copilot: N skills` /
`copilot: N agents`, or `copilot: bridge not installed`; it fails a skill whose
`name` does not match its directory. Nothing under `.opencode/` or `AGENTS.md`
changes for OpenCode or T3 Code.

## Start a brand-new project

`base new` is `init` plus the mechanical setup:

```sh
node tools/base.mjs new <project-dir> \
  --project <name> \
  --preset checks-web \
  --pack engineering \
  --config
```

A preset fills **exactly five seam fields and nothing else**: `checks.build`,
`checks.test`, `verify.surface`, `verify.widths` and `verify.themes`. It never
chooses a language, framework, folder layout, architecture or dependency — the
project makes those decisions in `/start-project`.

| Preset | Fills |
| --- | --- |
| `checks-none` | No build or test; `surface: none` |
| `checks-web` | `npm run build`, `npm test`; `surface: web`; 375/900; light/dark |
| `checks-cli` | `npm run build`, `npm test`; `surface: cli` |
| `checks-docs` | No build or test; `surface: docs` |

The old names `bare`, `web`, `cli` and `docs` are aliases, so existing prompt
blocks keep working; `base new` prints the canonical name, the alias it replaced,
and the five fields it filled. Flags override every field: `--build`, `--test`,
`--free`, `--paid`, `--surface`, `--widths`, `--themes`, `--seed`, `--capture`,
the doc paths (`--issues`, `--adr`, `--glossary`, `--notes-dir`) and `--pack`. A non-Node
stack uses `--preset checks-none` plus explicit checks, for example
`--build "make" --test "make test" --surface cli`.

It also creates the required `.scratch` and `docs/adr` directories, optionally
writes a one-shot `opencode.json` scaffold (`--config`, only when absent), and
runs `check` and `doctor`.

The scaffold's `<provider/model>` placeholders are intentional: `doctor` warns
until they are replaced. The base writes `opencode.json` once, at creation, and
never updates it. `--no-verify` skips the post-install check and doctor, and
`--no-copilot` skips the [Copilot bridge](#vs-code-copilot-chat).

### Bootstrap profile

`base new --config` also looks for a machine-local profile at
`~/.config/drax/bootstrap.json`. When it exists, its `opencode` object becomes
`opencode.json` (no placeholders) and its `agentsMd` string is appended to
`AGENTS.md`, outside the managed block. That is how a personal provider, model
mix and council seats reach a new project while the public base stays
vendor-neutral.

```json
{
  "opencode": {
    "$schema": "https://opencode.ai/config.json",
    "model": "provider/default-model",
    "provider": { "myprovider": { "options": { "apiKey": "{env:PROVIDER_KEY}" } } },
    "agents": {
      "task-orchestrator": { "model": "provider/default-model#low" },
      "quality-gatekeeper": { "model": "provider/experience-model#medium" }
    }
  },
  "agentsMd": "### Council seat models\n\nChair runs ...; experience runs ..."
}
```

- `--profile <file>` reads another file and must exist; `--no-profile` ignores the
  profile and writes the placeholder scaffold. Both require `--config`.
- Declare a model's allowed `variants` in the profile (`"variants": { "low": {}, "high": {} }`);
  `doctor` then flags a seat that names a variant outside that set or one marked
  `"disabled": true`, and warns when a seat names a model the provider block does
  not declare. Without a declared variant list the catalogue owns the names, so the
  check leaves them alone.
- Credential fields (`apiKey`, `token`, `secret`, `password`, `key`, `Authorization`,
  `Bearer`) must be `{env:NAME}` or `{file:path}` references. A literal value —
  including one wrapped in `<...>` — is rejected with exit 2 before anything is
  written. Placeholders are for unfilled model fields, not credentials.
- The profile is machine-local. It is not part of the base, is never committed,
  and `base` never writes or updates it.

`doctor --fix` performs the two mechanical fixes: it creates the required doc
directories and moves same-ID global agents into a dated `agents.bak-*` backup.
Add `--dry-run` to see the actions first.

## Install into a project

`init` is the lower-level install, for a project that already has a seam or wants
to fill it by hand.

From a base checkout:

```sh
node tools/base.mjs init <project-dir> \
  --project <name> \
  --test "npm test" \
  --build "npm run build" \
  --surface none
```

`init` copies the manifest-owned tree, writes a seam skeleton (flags fill it),
injects the managed `AGENTS.md` block and writes `.opencode/.workflow-manifest.json`.
It refuses to overwrite a differing existing tree unless `--force`.

Then:

1. Fill `.opencode/workflow.json` (checks, verify, docs). See
   `skills/workflow-base/references/seam.md`.
2. Run `node .opencode/tools/base.mjs doctor .`.
3. Merge the fragment from `node .opencode/tools/base.mjs print-config .` into
   `opencode.json` by hand — `init` never writes it.

## Daily commands

Run from the project root; the CLI is vendored at `.opencode/tools/base.mjs`.

| Command | Behaviour |
| --- | --- |
| `base check .` | Drift against the manifest; lists changed, missing and unowned-extra files; exit 1 on changed/missing content or a seam/manifest mismatch. |
| `base doctor .` | Seam schema, required docs, model/variant selector warnings, permissions warnings, global-agent shadowing, AGENTS block hash, secret scan, pack state. |
| `base doctor --fix .` | Create the required doc dirs and move same-ID global agents into a dated backup. |
| `base status .` | Version, commit, per-file state, seam summary. |
| `base update . --from <base>` | Copy the current base version, atomically. Refuses locally modified files unless `--force`. |
| `base update . --check` | Print the update plan and exit 1 if it would change anything. |
| `base eject .` | Remove manifest-owned clean files, the managed block and the manifest; leave the seam. |
| `base print-config .` | Print the `opencode.json` fragment to merge. |
| `base requirements .` | List the model slots, their binding state and exact key; `--json` for scripts. |
| `base benchmark report --slot <id>` | Rank measured benchmark evidence for a slot; free, `--json` for scripts. |
| `base benchmark validate` | Check the shipped task pack, its files and its keys; free. |
| `base benchmark run ...` | Run a pack against explicit models; paid, and refuses without a budget and prices. |
| `base pack install <name> .` | Run `packs/<name>/install.mjs` with the project as cwd. |
| `base version` | Print the base version; falls back to the manifest in a consumer. |

All commands accept the target directory (default `.`). Exit codes: `0` success,
`1` failed check/validation, `2` usage error.

## The seam

`.opencode/workflow.json` is the only file a project edits under `.opencode/`. It
names the build/test/free/paid checks, how a visual artifact is seeded and captured,
the default hillclimb rubric, which docs the skills read, and which packs to vendor.
Unknown keys are rejected; `base.version` must match the manifest. The full schema is
in `skills/workflow-base/references/seam.md` and `schema/workflow.schema.json`.

## Updating

From the project root, point at the base checkout:

```sh
git -C <base> checkout v0.6.0
node <base>/tools/base.mjs update . --from <base> --check   # plan, and this release's new slots
node .opencode/tools/base.mjs update . --from <base>        # apply, with the project's own CLI
```

`--from` (or the `WORKFLOW_BASE` environment variable) is required when the base
is not the current directory. Plan with the base's CLI: the code that knows a
release's new requirements arrives *with* the update, so the project's vendored
copy cannot announce them for that same release. Apply with the vendored CLI, the
code the project already runs.

The update stages, validates and replaces; a write failure restores the old tree
from `.opencode/.workflow-backup/<timestamp>/`. Review the diff, run the seam's
floor, and commit the vendored tree, the manifest, the seam version and the
`AGENTS.md` block together.

`update` never merges new seam keys into an existing project — the seam belongs to the
project. When a release introduces an optional one, add it yourself. Since 0.5.2 that is
`docs.notes`, defaulting to `docs/notes`; without it `doctor` checks nothing and the
managed block's pointer is the only mention of where notes go.

Since 0.6.0 the optional key is `visualReview`, and `update` announces the new
`hillclimb.blindspot` slot. Bind an image-capable model there (or leave it unbound and
the pass is skipped and recorded); `base requirements .` prints the exact key and the
model shape it needs.

## Precedence

- A project skill with the same ID as a vendored skill **overrides** it. That is a
  drift the next `check`/`update` reports; a project that wants different behaviour
  should use a distinct ID.
- Global agents with the same ID shadow the vendored ones. `doctor` fails on it.
- `AGENTS.md` outside the managed block is the project's and is never touched.

## Tests

```sh
node --test
```

The suite covers the seam schema, hash normalization (CRLF/LF), the plan/applier
and rollback, `new` with presets (including `--config`, `--dry-run` and bootstrap
profiles: default path, `--profile`, `--no-profile`, credential-literal
rejection including made-up `{word:...}` shapes, `<...>` wrappers and
token-shaped keys), the Copilot bridge (skill/agent shape, `name` matching the
directory, `$ARGUMENTS` substitution, command/skill body merging, `--no-copilot`,
and a `doctor` failure on a mismatched name), the rubric library (four shipped
files, a seam default, a project-path rubric and an unresolved-name failure), the
preset scope (`checks-*`, aliases, and no stack scaffold),
`doctor --fix`, and an end-to-end init → check → doctor → update → pack → eject
run in temp directories. It also checks seat model selectors against the provider's
declared catalogue and variant lists, and the benchmark pack, scoring, price band,
budget stop, record ranking and both benchmark CLI entry points.

## Windows

No symlinks; files are copied, so no developer mode is needed. Content is stored LF
and hashes are normalized to LF, so a CRLF checkout does not report drift. Writes
go through a plan and an applier with a backup, so a failed update never leaves a
half-written tree.

## Decision record

[`docs/adr/0001-vendored-base.md`](docs/adr/0001-vendored-base.md) records why this
is vendored rather than global, and the dissent.
[`docs/adr/0002-copilot-bridge.md`](docs/adr/0002-copilot-bridge.md) records why the
Copilot support is a generated `.github/` bridge rather than a parallel tree.
[`docs/adr/0003-named-rubrics.md`](docs/adr/0003-named-rubrics.md) records why the
hillclimb gate ships named rubrics instead of one fixed scale.