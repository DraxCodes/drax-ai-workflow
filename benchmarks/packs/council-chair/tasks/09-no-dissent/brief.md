# Council brief — a unanimous cache proposal

**Question.** All four seats propose the same in-memory cache. Should the chair record dissent or rejected options that no seat raised?

**Fixed point.** The cache is in-memory, bounded, and invalidated by the change tick. The council has no disagreement on this decision.

## Constraints (cannot move)

- In-memory only; no new dependency, no second store.
- The cache is an optimisation, not a source of truth.
- A stale row must be visibly stale.

## Non-goals

Persistence, cross-folder cache, a server-side cache.

## Trade-offs to settle

The council has already settled the trade-off. The chair's job is to record the proposal and not invent a debate.