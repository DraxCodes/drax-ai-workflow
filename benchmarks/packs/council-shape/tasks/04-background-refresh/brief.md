# Shape brief — refresh project status hourly

**Question.** What is the smallest viable shape for refreshing project status about once an hour?

**Fixed point.** The site renders on request. It already has one background interval for cache expiry, and one data module.

## Constraints (cannot move)

- No daemon, no second process, no new dependency.
- One data path; the refresh must be idempotent.
- The page must still render if the refresh is late.

## Non-goals

Real-time updates, a job queue, a separate worker.

## Seams

request -> data read -> render.