---
description: Track a multi-session effort as a map plus one ticket per unit of work
agent: task-orchestrator
argument-hint: "plan <effort> | next | status"
---

Run the `wayfinder` workflow for the request below.

Request: $ARGUMENTS

Read `.opencode/workflow.json` first, then work in the seam's issue directory
(default `.scratch/`).

- If the request starts with **plan**, create or update `<effort>/map.md` from the
  spec: Notes, Decisions so far, Fog. Create tickets only for questions that can be
  answered now; leave the rest in Fog.
- If the request starts with **next** or is empty, read the map and list the
  frontier (open, unblocked, unclaimed, lowest number first). Claim the first
  ticket, do its work, append the answer, set `Status: resolved`, and update the
  map's Decisions so far. Stop after one ticket.
- If the request starts with **status**, print the map's decisions, the frontier
  and the blocked tickets with what blocks them. Change nothing.

Rules:

- Claim before touching code; a claim is a write scope.
- Never run two claimed tickets that write the same files.
- Link to the spec, ADRs and commits; do not copy them into the map.
- If the effort is small enough for one session, say so and suggest `/checkpoint`
  instead of creating a map.