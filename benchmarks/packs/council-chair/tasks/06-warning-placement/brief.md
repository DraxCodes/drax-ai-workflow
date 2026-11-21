# Council brief — connection warning placement

**Question.** Where does a persistent connection warning live: a topbar strip, a body banner, or a toast?

**Fixed point.** The pane has a fixed header and a scrollable body. A connection warning must be visible for as long as the connection is degraded.

## Constraints (cannot move)

- Always visible while degraded; no dismissal that hides the state.
- No layout jump when the warning appears or clears.
- One accent; no modal.

## Non-goals

A history of disconnects, per-thread warnings, a retry queue.

## Trade-offs to settle

Topbar strip vs body banner vs toast; fixed chrome vs the reader's eye line; one region vs two.