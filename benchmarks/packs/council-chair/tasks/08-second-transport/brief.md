# Council brief — a second transport for live updates

**Question.** A proposal would add a second transport so the pane can receive live updates. Should the council accept it?

**Fixed point.** The pane already talks to one transport and one child process. Live updates are a goal, not a fixed requirement.

## Constraints (cannot move)

- One transport; no second process, no second session.
- The identity proof must run on every mutation.
- No new dependency.

## Non-goals

Streaming every event, a websocket protocol, a background daemon.

## Trade-offs to settle

A second transport vs polling the existing transport vs no live updates; freshness vs one path.