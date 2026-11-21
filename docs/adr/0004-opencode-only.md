# 0004 — Target OpenCode only

**Status:** accepted (2026-11-21)
**Supersedes:** [0002](0002-copilot-bridge.md)

## Decision

The base targets **OpenCode only**. `base new`, `init` and `update` no longer
generate or own a `.github/` tree, and `--no-copilot` is removed. The vendored
`.opencode/` tree is the only generated copy.

`update` removes manifest-owned `.github/skills` and `.github/agents` files from an
existing project when they still match their recorded hashes. A file modified
locally is left in place and reported as a conflict, so a project keeps anything it
edited by hand.

## Why

The project does not use VS Code Copilot Chat. Maintaining a second generated
surface — its own skill format, tool aliases, name normalization and doctor checks —
buys nothing for this user and creates a class of drift that no one exercises.

The bridge also made the shared `AGENTS.md` block ambiguous: it addressed two
harnesses with different tools (`/compact`, the `question` tool, subagents). Removing
the second harness lets the base speak plainly about the one it runs on.

## Consequences

- The base is simpler: one generated tree, one set of instructions, one set of
  tests.
- `doctor` no longer validates `.github/` skills or agents.
- The secret scan no longer walks `.github/`; the wider scan added in the same
  release covers docs, notes and other committed text instead.
- A project that still wants Copilot can keep a hand-written bridge of its own; it is
  project-owned and outside the manifest.
- The decision is reversible as a new ADR, not by reviving 0002. A future second
  harness should be designed against the base as it exists then, not restored from
  the old bridge.