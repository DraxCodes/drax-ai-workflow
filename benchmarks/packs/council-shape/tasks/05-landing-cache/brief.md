# Shape brief — landing-page cache

**Question.** What is the smallest viable cache for the landing page's project metadata?

**Fixed point.** The landing page reads project metadata through one data module on each request.

## Constraints (cannot move)

- No new dependency, no second store, bounded memory.
- One data path; the cache is an optimisation, not a source of truth.
- A stale read must be visible, never silently presented as current.

## Non-goals

Persistence across restarts, cross-device cache, a server-side cache.

## Seams

request -> data module -> render.