# Experience brief — delete a thread

**Question.** What should the delete confirmation feel like at 8/10?

**Fixed point.** The list row has a delete action. The thread and its local draft are removed. The action is irreversible.

## Constraints (cannot move)

- One confirmation, not two; no modal stack.
- The object is named; cancel is the default and holds focus.
- The copy is sentence case, no "Are you sure?".
- The list updates without a layout jump.

## Art direction

Quiet, dense, one accent. The destructive action is the only red element.

## Non-goals

Undo history, bulk delete, a typed confirmation.