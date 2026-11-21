---
name: wayfinder
description: Track a multi-session effort as a map plus one ticket per unit of work. Use when the work is too large for one sitting, has blocking questions, or needs a durable frontier another session can pick up.
---

# Wayfinder

Wayfinder is the base's file-based work ledger. It is for an effort that outlives
one session but is still small enough to read: a map of where the effort is
going, one ticket per unit of work, and a frontier of what is unblocked and
unclaimed.

It is not a database and not a second spec. The map points at the spec, ADRs and
commits; it does not restate them.

## Layout

Use the seam's issue directory (`docs.issues`, default `.scratch/`):

```
<effort>/
  map.md                 the effort state: notes, decisions so far, fog
  issues/
    01-<slug>.md         one ticket per unit of work
    02-<slug>.md
```

The spec lives beside the map as `spec.md`. A ticket that needs a decision links
to the ADR or spec section instead of copying it.

## The map

`map.md` has three sections and no more:

- **Notes** — the goal in one paragraph and the constraints that shape it.
- **Decisions so far** — one line per settled decision, with a link. This is the
  index a fresh session reads first.
- **Fog** — what is still unknown. A fog line is not a ticket until it can be
  stated as a question with an answer someone can write.

## A ticket

```md
# 03 — Can the cache-key path avoid a second read?

Type: research | prototype | grilling | task
Status: open | claimed | resolved
Blocked by: 01, 02

<The question or the change. One unit of work.>

## Answer

<Appended on resolve: the conclusion and the evidence.>
```

- `Status: open` is available; `claimed` means someone is working it; `resolved`
  means the answer is written.
- `Blocked by` names ticket numbers. A ticket is unblocked when every file it
  names is `resolved`.
- A ticket is one unit of work, not one file and not one commit.

## Operations

1. **Plan.** Read the spec and existing map. Fill Notes and Fog. Create tickets
   only for questions that can be answered now; leave the rest in Fog.
2. **Frontier.** List tickets that are open, unblocked and unclaimed, lowest
   number first. That is the next work.
3. **Claim.** Set `Status: claimed` and save before touching code. A claim is a
   write scope: no one else works that ticket.
4. **Work.** Do the smallest change that answers the ticket. Keep commits atomic.
5. **Resolve.** Append `## Answer` with the conclusion and evidence, set
   `Status: resolved`, then append one line to the map's Decisions so far.
6. **Split.** If the answer opens a new question, create a ticket; if it settles
   one, update the map and remove the fog line.
7. **Close.** When the frontier is empty and Fog has no question that can be
   stated, the effort is done. Write the handoff and stop.

## Rules

- Read the map and the frontier first, not every ticket body. The cost of the
  effort is the context you load.
- Never claim two tickets that write the same files. Parallel work needs
  non-overlapping write scopes.
- A ticket is not done until its answer is written down; a green test is evidence,
  not the conclusion.
- The map is for this effort. Durable decisions go to ADRs, requirements to the
  spec, and tool facts to `docs/notes`.
- If the effort is small enough for one session, skip the map; use `/checkpoint`
  instead.

## Relationship to the other artifacts

| Artifact | Scope | Lifetime |
| --- | --- | --- |
| `spec.md` | what must be true | durable |
| `map.md` | where the effort is now | until the effort closes |
| ticket | one unit of work | until resolved |
| `status.md` | one work item's resume state | until the item ends |
| handoff | the next session's starting prompt | temporary |

A local memory tool is none of these. It may index them; it is never the record.