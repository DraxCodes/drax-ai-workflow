# 0005 — Layer durable knowledge, evidence and indexes

**Status:** accepted (2026-11-21)
**Context:** the base now records benchmark, hillclimb, council, security,
visual-review and probe runs. That raises the question every local tool eventually
faces: should the state live in a database? SQLite would make queries easy, but it
would also make the record opaque in review, hard to merge, tied to one machine and
dependent on a native or experimental runtime.

## Decision

Keep four layers, and never let a lower layer become the source of truth:

1. **Source of truth** — git-tracked Markdown and JSON: the seam, the manifest,
   `AGENTS.md`, specs, ADRs, glossary entries and `docs/notes`. Human-reviewable,
   mergeable and portable.
2. **Immutable evidence** — JSONL run records and their hashed artifacts under
   `.scratch/runs/`. Append-only; later events fold by `id`. The schema is
   `schema/run.schema.json`.
3. **Index** — optional and rebuildable. SQLite is not used today. If query volume
   or data size ever justifies it, it indexes layers 1 and 2 and can be deleted and
   rebuilt without losing a fact.
4. **Telemetry** — the same JSONL, read by `base run summary` and `base run export`.

The rule is the memory boundary applied to state: a database may remember, but the
repo must be the record.

## Options considered

| Option | Shape | Verdict |
| --- | --- | --- |
| A. Git text + JSONL evidence, optional index (chosen) | Markdown/JSON for knowledge, append-only JSONL for runs, SQLite only as a rebuildable index | Chosen |
| B. SQLite as the source of truth | One local database for docs, runs and memory | Rejected |
| C. Markdown only | Every run written as a Markdown file | Rejected for run data; kept for knowledge |
| D. A hosted store | A service or cloud database | Rejected |

## Why A

- **Review.** A run record is a line in a diff; a database page is not.
- **Portability.** A fresh machine can read the repo and the JSONL export without a
  migration.
- **Recovery.** A corrupt index is deleted; a corrupt database with the only copy of
  a decision is a loss.
- **Dependencies.** The base supports Node >= 20 and has no runtime dependencies.
  `node:sqlite` needs Node 22+; `better-sqlite3` needs a native build; a WASM build
  adds size. None is justified by the current volume.
- **Eject.** A project can leave the base without leaving a binary store behind.
- **Auditability.** Appending a final event keeps the started event; a mutable row
  loses the history that made the verdict.

## Why not B

A local database is excellent at high-volume, multi-dimensional queries and poor at
review, merge and portability. The base's durable knowledge is exactly the kind that
must survive a machine change and be readable by a teammate. Putting it in SQLite
would solve a query problem by creating a trust problem.

## Why not C

Markdown is the right shape for a note or an ADR and the wrong shape for hundreds of
run events with scores, costs and hashes. Rewriting one file per run also produces a
diff per run, which is noise. JSONL is the append-only middle ground.

## Consequences

- `.scratch/` is local and normally gitignored. A decision that must travel with the
  repo gets a curated export or an ADR; the whole ledger is not committed by
  accident.
- A future SQLite index must be rebuildable from the JSONL and the repo. It must
  never be the only home for a record.
- The run record schema is versioned (`schemaVersion: 1`); a changed shape is a new
  version, not a silent rewrite.
- `base run export` is the supported escape hatch to a portable JSON file.
- If the volume ever justifies SQLite, that is a new ADR with its own migration and
  deletion story, not a quiet optimization.

## References

- `skills/workflow-base/references/runs.md` — the ledger and the layering.
- `schema/run.schema.json` — the record shape.
- `benchmarks/protocol.md` — how a benchmark record is produced.
- `docs/adr/0001-vendored-base.md` — the same bias toward reviewable, pinned files.