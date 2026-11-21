---
description: Write a one-page status file for the current work item so a restart can resume
agent: task-orchestrator
argument-hint: "[what the next session should focus on]"
---

Write or refresh the checkpoint for the current work item, following the
`checkpoint` skill exactly.

Focus for the next session: $ARGUMENTS

1. Read the seam (`.opencode/workflow.json`) and the current spec or issue.
2. Run `git status` and record the real branch, commit and working-tree state.
3. Write `status.md` beside the spec under the seam's issue directory, using the
   skill's shape: Done, Doing, Next, Blocked, Decisions, Files, Verification,
   Open questions.
4. Link to the spec, ADRs, notes and commits; do not copy them.
5. If a durable fact is not yet in its artifact, promote it first: an ADR for a
   decision, the spec for a requirement, the glossary for a term, `docs/notes` for
   a tool fact.
6. Reply with the absolute path to `status.md` and a one-paragraph summary. Do not
   start new work.