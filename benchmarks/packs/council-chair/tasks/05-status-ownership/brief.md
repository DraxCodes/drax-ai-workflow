# Council brief — thread status ownership

**Question.** Should the host or the transport own thread status?

**Fixed point.** Status is currently decoded from the transport and rendered verbatim. The pane gets it on every tick.

## Constraints (cannot move)

- One source of truth; no duplicated status.
- Status is rendered verbatim, never mapped to a friendlier word.
- No second transport and no second session.

## Non-goals

A status history, a notification feed, a cross-thread status bar.

## Trade-offs to settle

Host owns status vs transport owns status vs both keep a copy; decode at the seam vs at the renderer.