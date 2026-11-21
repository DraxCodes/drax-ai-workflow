# Council brief — command palette

**Question.** The user asks for a command palette for all pane actions. Which shape satisfies that without duplicating the current menus?

**Fixed point.** The pane has a small set of actions in the header and row menus. The user wants them reachable from the keyboard.

## Constraints (cannot move)

- One command surface; no second list of actions to maintain.
- Every command must have the same behaviour as the visible control.
- No new dependency, no second process.

## Non-goals

A plugin command registry, user-defined commands, a global command palette for the whole editor.

## Trade-offs to settle

Extend the existing palette vs a new pane command list vs keep only the current menus.