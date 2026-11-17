# Drax AI Workflow

The authored source of a project-agnostic OpenCode workflow set: a council for
divergent decisions, a hillclimb loop with a 1–10 perception rubric, grilling,
handoff, a security lens, domain-doc and issue-tracker conventions, and the `base`
CLI that vendors them into a project.

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
commands/      council, hillclimb, grill-me, handoff
skills/        council, hillclimb (+ rubric), grilling, handoff, workflow-base, find-skills, context-engineering
packs/         engineering (optional third-party skills)
schema/        the seam JSON Schema
templates/     a starter seam
tools/         the `base` CLI (vendored into every project)
AGENTS.base.md the managed block injected into a project AGENTS.md
VERSION        the release version; git tags are the immutable store
```

The base owns no `opencode.json`. Provider, model, permissions, compaction and tool
output are the project's. Agents carry no `model:` and no permissions; they inherit
the project's, and the project supplies the cheap per-agent models and the
read-only edit-deny rules for the subagents. The one exception is the opt-in
`base new --config` scaffold, written only when the file is absent; the base never
updates it afterwards.

## Start a brand-new project

`base new` is `init` plus the mechanical setup:

```sh
node tools/base.mjs new <project-dir> \
  --project <name> \
  --preset web \
  --pack engineering \
  --config
```

It fills a preset seam (`bare`, `web`, `cli`, `docs`), creates the required
`.scratch` and `docs/adr` directories, optionally writes a one-shot
`opencode.json` scaffold (`--config`, only when absent), and runs `check` and
`doctor`. Flags override the preset: `--build`, `--test`, `--free`, `--paid`,
`--surface`, `--widths`, `--themes`, `--seed`, `--capture`, the doc paths and
`--pack`. A non-Node stack uses `--preset bare` plus explicit checks, for example
`--build "make" --test "make test" --surface cli`.

The scaffold's `<provider/model>` placeholders are intentional: `doctor` warns
until they are replaced. The base writes `opencode.json` once, at creation, and
never updates it. `--no-verify` skips the post-install check and doctor.

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
| `base doctor .` | Seam schema, required docs, model/permissions warnings, global-agent shadowing, AGENTS block hash, secret scan, pack state. |
| `base doctor --fix .` | Create the required doc dirs and move same-ID global agents into a dated backup. |
| `base status .` | Version, commit, per-file state, seam summary. |
| `base update . --from <base>` | Copy the current base version, atomically. Refuses locally modified files unless `--force`. |
| `base update . --check` | Print the update plan and exit 1 if it would change anything. |
| `base eject .` | Remove manifest-owned clean files, the managed block and the manifest; leave the seam. |
| `base print-config .` | Print the `opencode.json` fragment to merge. |
| `base pack install <name> .` | Run `packs/<name>/install.mjs` with the project as cwd. |
| `base version` | Print the base version; falls back to the manifest in a consumer. |

All commands accept the target directory (default `.`). Exit codes: `0` success,
`1` failed check/validation, `2` usage error.

## The seam

`.opencode/workflow.json` is the only file a project edits under `.opencode/`. It
names the build/test/free/paid checks, how a visual artifact is seeded and captured,
which docs the skills read, and which packs to vendor. Unknown keys are rejected;
`base.version` must match the manifest. The full schema is in
`skills/workflow-base/references/seam.md` and `schema/workflow.schema.json`.

## Updating

From the project root, point at the base checkout:

```sh
git -C <base> checkout v0.2.0
node .opencode/tools/base.mjs update . --from <base>
```

`--from` (or the `WORKFLOW_BASE` environment variable) is required when the base
is not the current directory. Run `update . --check` first to see the plan.

The update stages, validates and replaces; a write failure restores the old tree
from `.opencode/.workflow-backup/<timestamp>/`. Review the diff, run the seam's
floor, and commit the vendored tree, the manifest, the seam version and the
`AGENTS.md` block together.

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
and rollback, `new` with presets (including `--config` and `--dry-run`),
`doctor --fix`, and an end-to-end init → check → doctor → update → pack → eject
run in temp directories.

## Windows

No symlinks; files are copied, so no developer mode is needed. Content is stored LF
and hashes are normalized to LF, so a CRLF checkout does not report drift. Writes
go through a plan and an applier with a backup, so a failed update never leaves a
half-written tree.

## Decision record

[`docs/adr/0001-vendored-base.md`](docs/adr/0001-vendored-base.md) records why this
is vendored rather than global, and the dissent.