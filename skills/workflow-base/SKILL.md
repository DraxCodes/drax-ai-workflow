---
name: Workflow base
description: How this project's vendored workflow base works — the seam, ownership and precedence, daily check/update/eject, the issue tracker and domain-doc conventions
---

# Workflow base

This project carries a pinned, vendored copy of the **drax-ai-workflow** base
under `.opencode/`. The base provides the agents (`task-orchestrator`,
`plan-architect`, `quality-gatekeeper`, `security-auditor`), the commands
(`council`, `start-project`, `hillclimb`, `grill-me`, `handoff`, `wayfinder`,
`checkpoint`, `domain-modeling`), the skills (`council`, `hillclimb`, `grilling`,
`handoff`, `wayfinder`, `checkpoint`, `domain-modeling`, `workflow-base`,
`find-skills`, `context-engineering`) and the `base` CLI.

This base targets OpenCode. The `.opencode/` tree is the only generated copy; there is
no `.github/` bridge and no second instruction file.

Everything the base owns is generated. Do not edit it in a project — edit the base
repo and update. Everything else in the project is the project's own.

## The seam

`.opencode/workflow.json` is the project-edited seam: the only file the project
changes to describe its checks, verification, docs and packs. It is validated by
`base doctor` and its schema is documented in `references/seam.md`.

If the seam is missing, the workflows are dormant. Say so and stop rather than
guessing at a project's checks or docs.

## Ownership and precedence

| Owner | Paths |
| --- | --- |
| Base | `.opencode/agents/`, `.opencode/commands/`, `.opencode/skills/`, `.opencode/tools/`, `.opencode/packs/` |
| Project | `.opencode/workflow.json`, `.opencode/.workflow-manifest.json`, `AGENTS.md` outside the managed block, `opencode.json`, app, tests, docs, `.scratch/` |

- The base **never writes `opencode.json`**. The project owns provider, model,
  permissions, compaction and tool output. `base print-config` emits a fragment to
  merge by hand.
- Base agents carry no `model:` and no permissions. They inherit the project model;
  the project supplies per-agent models and the read-only edit-deny rules.
- A project that needs different behaviour adds a **distinct ID**, not an edit to a
  generated file. A project skill with the same ID as a vendored one overrides it,
  which is a drift the next update reports.
- Universal docs are addressed skill-relatively (for example "the `hillclimb`
  skill's `references/rubrics/<name>.md`"), never by an absolute path.

## Daily commands

Run these from the project root; the CLI is vendored:

```sh
node .opencode/tools/base.mjs check .    # drift against the manifest
node .opencode/tools/base.mjs doctor .   # seam, docs, config, global shadowing, secrets
node .opencode/tools/base.mjs status .   # version, commit, per-file state
node .opencode/tools/base.mjs update . --from <base>   # bump to the checkout's version
node .opencode/tools/base.mjs requirements .   # model slots and their binding state
node .opencode/tools/base.mjs docs check .     # doc links and ADR status
node .opencode/tools/base.mjs fleet <root>     # versions, drift and slots across projects
node .opencode/tools/base.mjs find <question>  # recall over docs, notes and commits
node .opencode/tools/base.mjs ci .             # check + doctor + benchmark validate
node .opencode/tools/base.mjs eject .    # remove base-owned clean files and the AGENTS block
```

A brand-new project starts from a base checkout with
`base new <dir> --preset web --config`; the README's "Start from a prompt" block
is the one-paste version. `--config` fills `opencode.json` from the machine-local
`~/.config/drax/bootstrap.json` when present (`--no-profile` ignores it),
then the first session runs `/start-project <idea>` to get an approved spec.
`base doctor --fix .` performs the mechanical fixes (required doc dirs, same-ID
global agents).

`update` refuses locally modified files unless `--force`. `eject` leaves the seam
in place for the project.

## Updating the base

1. Check out the target tag in a base checkout (pass `--from <dir>`, set
   `WORKFLOW_BASE`, or run from the checkout).
2. Plan with the base's CLI: `node <base>/tools/base.mjs update . --from <base> --check`.
   The project's vendored copy predates the release, so only the base's CLI can list
   the model slots that release adds.
3. Apply with the base's CLI: `node <base>/tools/base.mjs update . --from <base>`.
   For 0.7.x this matters: a 0.6.x vendored CLI would regenerate the Copilot bridge
   that 0.7.0 removes. After 0.7.0, either CLI applies the same plan.
4. Run `node .opencode/tools/base.mjs requirements .` and bind any unbound slot — ask
   the user first, and probe the chosen model once. `doctor` keeps reporting the
   unbound ones.
5. Review the diff, run the floor (the seam's `checks`), commit the vendored tree,
   the manifest, the seam's version and the `AGENTS.md` block together.
6. `node .opencode/tools/base.mjs check .` must be clean before the commit.

The manifest records per-file `sha256:` hashes (normalized to LF) and the AGENTS
block hash, so a CRLF checkout does not report drift.

## References

- `references/seam.md` — the seam schema, field by field.
- `references/requirements.md` - model slots, binding, benchmark evidence and how to
  recommend a model.
- `references/options.md` - the discovery brief before a stack, library or language
  choice: boring default, modern default, wildcard, portfolio check, dated sources.
- `references/delegation.md` — the brief shape and the shared report envelope.
- `references/runs.md` — the JSONL run/evidence ledger and the data layering.
- `../../benchmarks/protocol.md` — the benchmark protocol, scoring and cost guard.
- `references/issue-tracker.md` — where issues, specs and triage state live.
- `references/domain.md` — how to read the glossary and ADRs before exploring.

## Related skills

- `hillclimb` — the 1–10 rubric and the iterate/stop gate.
- `council` — divergence before a large feature.
- `grilling` — sharpen a fuzzy goal into settled decisions.
- `handoff` — write a session handoff that a fresh session can resume.
- `wayfinder` — a map and tickets for a multi-session effort.
- `checkpoint` — a one-page `status.md` for one work item.
- `domain-modeling` — glossary terms and ADRs, created lazily.