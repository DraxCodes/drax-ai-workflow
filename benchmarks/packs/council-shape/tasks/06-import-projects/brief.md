# Shape brief — import projects

**Question.** What is the smallest viable shape for importing projects from a JSON file?

**Fixed point.** Projects are managed from one admin page. There is one data module and one project store.

## Constraints (cannot move)

- A one-shot import, not a watcher or a daemon.
- One data path; no second store; no new dependency.
- The admin reviews before the import is committed.

## Non-goals

Continuous sync, an external API, a scheduled import.

## Seams

admin action -> data module -> store.