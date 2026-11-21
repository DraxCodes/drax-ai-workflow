# Council brief — thread summary cache

**Question.** Should the pane cache thread summaries between ticks, and in which shape?

**Fixed point.** The pane reads a folder-scoped list on every change tick. The read is the expensive part; the list is small.

## Constraints (cannot move)

- No new dependency, no second store, bounded memory.
- A stale row must be visibly stale, never silently presented as current.
- No persistence across restarts; no cross-folder cache.
- One read path. The cache is an optimisation, not a source of truth.

## Non-goals

Offline mode, cross-device sync, a server-side cache.

## Trade-offs to settle

In-memory map vs JSON file vs SQLite; invalidation on the change tick vs a TTL; memory bound vs hit rate.