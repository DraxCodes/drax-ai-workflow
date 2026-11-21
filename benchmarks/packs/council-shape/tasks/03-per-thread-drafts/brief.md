# Shape brief — per-thread drafts

**Question.** What is the smallest viable shape for keeping a draft per thread?

**Fixed point.** The composer already saves one page-local draft keyed to the attached thread in `vscode.setState`. A switch currently discards a half-written message.

## Constraints (cannot move)

- Page-local state only; no host-to-page dispatcher; no new dependency.
- One draft per thread; no cross-device sync; no database.
- Restore caret and focus only on a key match.

## Non-goals

Cross-device drafts, draft search, draft sharing.

## Seams

composer render -> page state -> switch.