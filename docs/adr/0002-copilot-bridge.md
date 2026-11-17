# 0002 — Generate a `.github/` bridge for VS Code Copilot Chat

**Status:** accepted (2026-11-17)
**Context:** the workflow should start and run from the same one-paste prompt in
VS Code Copilot Chat as in OpenCode and T3 Code, without a second authored copy
and without changing the existing OpenCode tree.

## Decision

The base keeps one authored source under `.opencode/` and, at vendor time,
**generates** a Copilot bridge:

- `commands/<id>.md` and `skills/<id>/SKILL.md` → `.github/skills/<id>/SKILL.md`
  (Agent Skills; Copilot shows them as `/<id>` and auto-loads them by description).
- `agents/<id>.md` for the three read-only lenses → `.github/agents/<id>.agent.md`
  (custom agents; `plan-architect` gets `read`/`search`, `quality-gatekeeper` adds
  `execute`, `security-auditor` adds `execute` and `web`).
- Supporting files (a skill's `references/`) are copied alongside its `SKILL.md`.

Copilot reads `AGENTS.md` itself, so the bridge writes **no**
`.github/copilot-instructions.md` and keeps a single source of project rules.

The bridge is on by default for `new`, `init` and `update`; `--no-copilot` skips
it and removes an existing generated tree. `doctor` validates each skill's `name`
against its directory and counts skills and agents.

Generation normalizes the differences between the two harnesses:

| Copilot requirement | Transformation |
| --- | --- |
| Skill `name` must equal the directory, lowercase | Normalized from display names (`Council` → `council`) |
| One skill per directory | A command/skill id collision puts the command entry point first and appends the canonical skill body |
| No `agent:` frontmatter | Dropped |
| No `$ARGUMENTS` substitution | Replaced with "the text the user typed after `/<id>`" |

## Options considered

| Option | Shape | Verdict |
| --- | --- | --- |
| **A. Native generated bridge, always on (chosen)** | `.github/skills` + `.github/agents`, generated from `.opencode/` | Chosen |
| B. Same bridge, opt-in | Generated only with a `--copilot` flag or later command | Rejected |
| C. Pointer only | A `copilot-instructions.md` that points at `.opencode/` | Rejected |

## Why A

- One prompt starts a project in either harness, which was the request.
- Slash commands and lens agents are native Copilot surfaces, not prose the model
  must re-derive each session.
- Generation at vendor time means the canonical tree stays the only thing a human
  edits; there is no second authored copy to drift.
- The bridge is additive: no `.opencode/` path, no `AGENTS.md` structure and no
  OpenCode/T3 Code behavior changes.
- `--no-copilot` keeps the escape hatch for a project that only uses OpenCode.

## Why not B

The user asked that a new folder support either harness without a second decision.
Opt-in would make "paste the prompt in Copilot" fail on the common path (a plain
`base new`) and turn a support request into a footgun.

## Why not C

A pointer file gets Copilot to the right instructions, but the workflows are written
as slash commands and read-only subagents. Without skills and agents, the user has
to ask Copilot to read a command file and re-explain the lens before every run —
which is not "the same workflow", it is a manual transcription of it.

## Consequences

- A project's `.github/` is base-owned and generated. Hand edits are drift that the
  next `check`/`update` reports; the canonical edit is under `.opencode/`.
- `check` covers `.github/` files because they are in the same manifest, so the
  bridge is hashed like every other vendored file.
- Doctor's secret scan now includes `.github/`, so a leaked key in a generated or
  project `.github/` file is caught.
- The bridge follows Copilot's current formats. If those change (tool aliases,
  skill locations), the generator is the single place to update — the canonical
  workflows do not move.
- `--no-copilot` on an update deletes generated files it owns; a project that added
  its own `.github/` files keeps them, because only manifest-owned paths are removed.