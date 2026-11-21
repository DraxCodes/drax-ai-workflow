# Council brief — switching threads

**Question.** Where does switching threads live in the pane, and what may a list row tell the host?

**Fixed point.** The pane already has a fixed header, a folder-scoped thread-list port, and a page-local composer. The palette and the reopen path share one attach function.

## Constraints (cannot move)

- Nothing crosses host-to-page. A row may select a thread, not dispatch a behaviour the host has not fixed.
- One attach path. A switch re-runs the same identity proof and refusal as every other attach.
- No new dependency, no second process, no second session.
- A held run is voided with a sentence, never silently.

## Non-goals

Creating, renaming or archiving threads; cross-thread approvals; search, filter or pinning; a second webview.

## Trade-offs to settle

Topbar picker vs in-pane list vs palette command; the draft is kept per thread; a held run is voided on switch.