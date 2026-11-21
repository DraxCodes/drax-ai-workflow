---
name: checkpoint
description: Write a one-page status file for the current work item so a compaction, restart, or fresh session can resume without re-deriving the state.
---

# Checkpoint

A checkpoint is the smallest durable resume state for one work item. It is not a
handoff (which starts a new session), not a spec (which states requirements) and
not a map (which tracks a multi-ticket effort). It answers one question: if this
session ended now, what would the next one need to continue?

## Where

Write `status.md` beside the spec in the work item's directory under the seam's
issue directory:

```
.scratch/<work-item>/
  spec.md
  status.md
```

If there is no work-item directory, use the slug from the spec or branch and
create one. Do not write `status.md` at the repository root.

## The shape

```md
# Status — <work item>

Updated: <date and time>
Branch: <branch> @ <commit>
Working tree: <clean, or what is uncommitted>

## Done

- <outcome, with a link to the commit or file>

## Doing

<The current file, command or question. One paragraph.>

## Next

1. <The first action>

## Blocked

- <What blocks it and who can unblock it>

## Decisions

- <decision> — <why> — <link to ADR or spec section>

## Files

- `<path>` — <what changed>

## Verification

- `<command>` — <pass/fail/not run and the observed result>

## Open questions

- <only questions a person can answer>
```

## Rules

- One page. If it grows, the detail belongs in the spec, an ADR or a note.
- Update at milestones: a completed task, a settled decision, a handoff, or before
  a compaction. Do not update it every turn.
- Record what was **not run** as plainly as what passed.
- Link to the spec, ADRs, notes and commits; do not restate them.
- A checkpoint is temporary. When the work item ends, write the handoff and
  promote the durable facts; do not leave the checkpoint as the only record.