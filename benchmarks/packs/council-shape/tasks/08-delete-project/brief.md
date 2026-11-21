# Shape brief — delete a project

**Question.** What is the smallest viable shape for deleting a project?

**Fixed point.** Projects are listed on one admin page and stored in one project store. The action is irreversible unless a recovery path exists.

## Constraints (cannot move)

- One confirmation, not two.
- Soft delete or archive; no hard delete without recovery.
- One store; no new dependency.

## Non-goals

Undo history, bulk delete, a typed confirmation.

## Seams

admin render -> store write -> list render.