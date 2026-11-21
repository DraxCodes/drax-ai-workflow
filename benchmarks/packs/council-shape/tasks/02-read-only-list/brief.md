# Shape brief — read-only thread list

**Question.** What is the smallest viable shape to expose a read-only thread list to the pane?

**Fixed point.** `transport.listThreads({folder})` already returns folder-scoped summaries; the pane already has a page-local selection model. The attach path is one function.

## Constraints (cannot move)

- Reuse the existing port; no second transport; no new store; no background poller.
- The list is folder-scoped and subagent-free.
- A row may select a thread, not dispatch a behaviour.

## Non-goals

Server-side search, pagination beyond the current limit, cross-folder lists.

## Seams

port -> transport -> host -> page render.