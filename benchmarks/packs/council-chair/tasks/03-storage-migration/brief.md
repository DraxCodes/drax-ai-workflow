# Council brief — transcript storage migration

**Question.** How should the transcript store move from one JSON blob per thread to chunked files?

**Fixed point.** The current store is one JSON blob per thread. The pane reads a whole thread; the watch appends new parts.

## Constraints (cannot move)

- Dual-read during migration; rollback in one step; no data loss; no downtime.
- One storage seam; no second source of truth.
- The reader must never show a blank transcript while a thread is migrating.

## Non-goals

Cross-device sync, compression, a new database.

## Trade-offs to settle

Dual-write/dual-read vs a big-bang rewrite vs an adapter layer; a migration flag vs a per-thread marker.