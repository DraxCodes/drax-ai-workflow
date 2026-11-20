# The workflow seam

`.opencode/workflow.json` is the small, project-edited contract between a project
and its vendored workflow base. The base validates it but never rewrites it. Unknown
keys are rejected so a typo cannot silently disable a check.

## Shape (schema version 1)

```json
{
  "schemaVersion": 1,
  "base": { "name": "drax-ai-workflow", "version": "0.1.0" },
  "project": "example",
  "workflows": ["council", "hillclimb", "grilling", "handoff", "security"],
  "checks": {
    "build": { "command": "npm run build", "cwd": "." },
    "test": { "command": "npm test", "cwd": "." },
    "free": [{ "command": "node scripts/lint.mjs", "cwd": "." }],
    "paid": [{ "command": "node scripts/e2e.mjs", "cwd": "." }]
  },
  "verify": {
    "surface": "web",
    "seed": "APP_SEED",
    "capture": "node scripts/capture.mjs",
    "captureCwd": ".",
    "widths": [375, 900],
    "themes": ["light", "dark"],
    "notes": "Stop the dev host before the test run."
  },
  "rubrics": { "default": "perception" },
  "docs": {
    "issues": ".scratch",
    "glossary": "GLOSSARY.md",
    "adr": "docs/adr",
    "notes": "docs/notes",
    "rubricAddendum": "docs/agents/hillclimb-addendum.md",
    "contract": "docs/ui-contract.md",
    "artDirection": "docs/ui-art-direction.md"
  },
  "neverCommit": [".env", "*.pem", "*.key", "*.local.json"],
  "packs": ["engineering"]
}
```

## Fields

### `schemaVersion`

Must be `1`.

### `base`

`base.name` must be `drax-ai-workflow`; `base.version` must equal the manifest
version. `base update` rewrites this field, so do not hand-bump it.

### `project`

The project name, used in reports. Required.

### `workflows`

The workflows this project opts into, from `council`, `hillclimb`, `grilling`,
`handoff`, `security`. Optional; omit to enable all.

### `checks`

Required. The floor the hillclimb gate and the working preferences run.

- `build` and `test` are `{ "command": "...", "cwd": "..." }` or `null` for a
  project with no such step.
- `free` and `paid` are arrays of the same object shape.
- `cwd` is project-relative and defaults to `.`.
- A paid check runs only with explicit approval; it is evidence, not a threshold,
  unless the project records otherwise.
- The base never executes a check. It only names it.

### `verify`

How a visual artifact is seeded and captured. Optional.

- `surface`: `web`, `cli`, `api`, `docs` or `none`. `none` selects the
  measurable-metric mode and no seed or capture is required.
- `seed`: the environment variable or command that starts the app with sample data.
- `capture`: the command that takes the screenshots a score cites.
- `captureCwd`: project-relative directory for `capture`.
- `widths`: required for `web`; the viewports a score must check.
- `themes`: required for `web`; a subset of `light`, `dark`.
- `notes`: the project's read-through nuance (a host to stop, a server to start).

### `visualReview`

Binds the independent visual blindspot reviewer the `perception` gate runs beside
the gatekeeper. Optional.

- `model`: a `provider/model` selector, resolved by the blindspot script. It must
  name an image-capable model; a text-only model can only score a description of
  the artifact.
- Omit the block and the pass is skipped, with a note in the gate artifact. It
  never falls back to the gate's own model — two opinions from one lineage are one
  opinion.
- Bind it here, not in `opencode.json`: the reviewer is a script, not an agent.
  Credentials come from that provider's block in `opencode.json`.
- `notes`: free text for a local exception (a routing floor, the probe date).

### `rubrics`

The hillclimb gate's default rubric. Optional; omit for `perception`.

- `default`: a shipped rubric name (`perception`, `usability`, `performance`,
  `completeness`) or a project-relative path to a `.md` file.
- The run can override it with an explicit `Rubric: <name>` in the task or spec.
- `doctor` resolves the name to the file the gatekeeper will read and fails when it
  is missing.
- `docs.rubricAddendum` still extends the selected rubric; it never replaces it.

### `docs`

Project-relative paths the skills read. Optional.

- `issues`: the issue-tracker directory (default `.scratch`).
- `glossary`: the glossary path (default `GLOSSARY.md`).
- `adr`: the ADR directory (default `docs/adr`).
- `notes`: the working notebook directory (default `docs/notes`). Notes are what a
  past session learned the hard way — a library quirk, a version-specific detail, an
  environment trap, a reliable procedure — written for the next agent, not for a human
  reader, and committed so they survive a change of machine. See the managed block's
  "Docs for the next agent".
- `rubricAddendum`: project probes and caps added to the selected hillclimb rubric.
- `contract` and `artDirection`: the design contract the provenance and
  art-direction probes read.

A missing optional doc is a `doctor` warning; a missing `issues` or `adr` is an
error, so create those before the first `doctor` run.

### `neverCommit`

Patterns a commit must not include. A convention the skills cite, not a substitute
for `.gitignore`.

### `packs`

Optional packs to vendor. Each must exist under `packs/<name>` in the base. The
engineering pack adds the third-party engineering skills and installs them into
`.agents/skills/` on demand.

## Rules

- Commands are never executed by the base. A command template's `!` shell blocks
  remain the project's responsibility.
- The seam is the only file `base update` leaves untouched in `.opencode/` besides
  the manifest it regenerates.
- A seam that fails validation makes every workflow stop with the validator's line,
  not a guess.