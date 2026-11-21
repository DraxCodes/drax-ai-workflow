# Experience brief — a thread is loading

**Question.** What should the loading state feel like at 8/10 while a thread is read?

**Fixed point.** The pane has switched to a thread; the read is in flight. The header keeps the thread title, status and path.

## Constraints (cannot move)

- One screen, 375 and 900, light and dark.
- No fake progress; no spinner-only state; no layout jump when content arrives.
- The user can still see which thread is loading and can switch away.

## Art direction

Quiet, dense, one accent. Copy is sentence case.

## Non-goals

A skeleton for every row, optimistic rendering, a progress bar.