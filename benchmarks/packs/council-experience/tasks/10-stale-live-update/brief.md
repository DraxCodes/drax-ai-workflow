# Experience brief — a live update fails

**Question.** What should the pane feel like at 8/10 when a live update fails mid-session?

**Fixed point.** The pane shows a live thread. The poll fails; the last successful update is still visible.

## Constraints (cannot move)

- Stale data is visibly stale; never silently current.
- The reader keeps their place; no layout jump.
- One screen at 375 and 900, light and dark.

## Art direction

Quiet, dense, one accent. Copy is sentence case, no blame.

## Non-goals

An offline queue, automatic retry loops, a reconnect history.