# Shape brief — move the project store to SQLite

**Question.** What is the smallest viable shape for moving the project store from JSON to SQLite?

**Fixed point.** The project store is one JSON file read by one data module. SQLite is already available in the runtime.

## Constraints (cannot move)

- Dual-read during migration; one-step rollback; no downtime.
- One storage seam; no second source of truth.
- No new dependency.

## Non-goals

Cross-device sync, compression, a second database.

## Seams

data module -> JSON read -> SQLite read -> render.