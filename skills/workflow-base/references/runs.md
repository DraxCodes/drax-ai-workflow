# Run and evidence ledger

The ledger is an append-only JSONL file of what the workflow actually ran: a
benchmark, a visual review, a hillclimb gate, a council, a security audit, a
probe or a docs check. It is the evidence behind a claim, not a second spec.

## Where

```
.scratch/runs/runs.jsonl       one JSON object per line; later events fold by id
.scratch/runs/export.json      optional folded export
```

`.scratch/` is local and is normally gitignored. Commit a specific export or a
curated evidence directory if a decision needs to travel with the repo; do not
commit the whole ledger by accident.

## Commands

```sh
# Start a gated or paid run.
node .opencode/tools/base.mjs run start \
  --kind hillclimb --task "perception pass on the settings page" \
  --rubric perception --models <provider/model>

# Finish it with the real verdict and the evidence the gate used.
node .opencode/tools/base.mjs run finish <id> --status passed \
  --verdict SHIP --score 8 --cost-usd 0.12 \
  --evidence .scratch/shots/settings.png

# Record a complete record written by another tool.
node .opencode/tools/base.mjs run record --file .scratch/runs/council.json

node .opencode/tools/base.mjs run list
node .opencode/tools/base.mjs run show <id>
node .opencode/tools/base.mjs run summary
node .opencode/tools/base.mjs run export --out .scratch/runs/export.json
```

`--json` prints the record or list as JSON. `base benchmark run` and the visual
review write their own records; the agent records the prompt-driven runs
(hillclimb, council, security) with `run start` and `run finish`.

## What a record carries

- `kind`, `status`, `startedAt`, `endedAt`
- `base` version and commit, `project`, `task`, `commit`
- `models`, `rubric`, `protocol`, `pack`
- `verdict`, `scores`, `usage` (tokens, cost, latency)
- `evidence`: path, SHA-256 and kind for each artifact
- `notes`, `operator`

The schema is `schema/run.schema.json`.

## Rules

- Record **paid or gated** work, not every edit. A benchmark, a hillclimb gate,
  a council, a security audit and a visual review earn a record; a one-line fix
  does not.
- Record the real result. A failed or skipped run is a record, not an omission.
- Hash the evidence; a screenshot or transcript without a hash can be replaced
  silently.
- Never put a secret in a record. Reference where it lives.
- The ledger is local evidence. Durable decisions still go to ADRs, requirements
  to the spec, domain terms to the glossary, and tool facts to `docs/notes`.

## Data layering

1. **Source of truth** — git-tracked Markdown/JSON (specs, ADRs, notes, seam,
   manifest).
2. **Immutable evidence** — JSONL run records and their hashed artifacts under
   `.scratch/runs/`.
3. **Index** — optional, rebuildable. SQLite is not used today; if a query
   volume ever justifies it, it indexes the records and never replaces them.
4. **Telemetry** — the same JSONL, read by `run summary`.

The rule is the memory boundary applied to state: a database may remember, but
the repo must be the record.