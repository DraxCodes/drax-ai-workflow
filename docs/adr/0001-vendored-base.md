# 0001 — Vendor the workflow base into each project

**Status:** accepted (2026-11-17)
**Context:** extracting the project-agnostic workflows out of a single app repo so
several projects can share them.

## Decision

The project-agnostic workflows live in one authored repo, `drax-ai-workflow`, and
are **vendored into each participating project**: a committed copy under
`.opencode/`, a per-file hash manifest, and a small project-edited seam
(`.opencode/workflow.json`). `base init` installs, `base update` bumps, `base check`
detects drift, `base doctor` validates, `base eject` removes.

The base never writes `opencode.json` after creation; the project owns provider,
model, permissions and compaction. The sole exception is the opt-in one-shot
`base new --config` scaffold, written only when the file is absent. Base agents
carry no `model:` and no permissions.

Git tags (`v0.1.0`, …) are the immutable store. A project pins by checking out a tag
and running `base update`.

## Options considered

| Option | Shape | Verdict |
| --- | --- | --- |
| **A. Vendored, pinned (chosen)** | Committed copy + hash manifest + seam, per project | Chosen |
| B. Global install | One copy at `~/.config/opencode`, shared by every project | Rejected |
| C. Global with a versioned store | Global load path plus a per-project pinned store | Rejected |

## Why A

- The loaded content is visible in the project's own diff and review.
- Two projects can pin different versions; an update is deliberate, not ambient.
- Drift is a `check` failure with a per-file hash, not a silent merge.
- It works with OpenCode's fixed load paths: there is no indirection to fight.
- Eject is clean: the project keeps its seam and loses only base-owned files.

## Why not B

A global copy cannot be versioned per project: whatever sits in the global path is
what every project loads. That is exactly how the predecessor drifted — agents 140
lines behind, no global commands or skills, a partial config, and two copies that
could silently merge. A global install also couples unrelated projects' upgrade
cadence.

## Why not C

The experience seat preferred a global convenience tier with a pinned store. It was
rejected on the load-path argument: OpenCode loads agents, commands, skills and
`AGENTS.md` from fixed global locations. A versioned store elsewhere cannot change
what the global path resolves to without a bootstrap that writes the global path
anyway — which is option B with extra steps, plus a failure mode where the
bootstrap is stale. C remains available later as a thin convenience layer on top of
A.

## Consequences

- Every project carries the base's files in its history. That is the review cost
  the vendoring buys visibility with.
- An update is a real diff to review, not a background refresh.
- The base's own tests are the floor for the CLI; a project's `base check` is the
  guard against a bad copy.
- Stale global agents must be removed once, or `doctor` fails on the shadowing.

The full deliberation, including the dissent, is recorded in the originating
project's `.scratch/workflow-base/council.md`.