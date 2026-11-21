---
name: domain-modeling
description: Record the project's domain language and decisions as terms and ADRs. Use when a term is ambiguous, a decision will outlive the task, or an existing ADR is contradicted.
---

# Domain modeling

The project's domain docs are the memory a fresh session can read: a glossary for
the words, ADRs for the decisions. This skill creates and updates them lazily —
when a term or decision actually needs settling, not as an up-front scaffold.

## Before exploring

Read the paths the seam names:

- the glossary (`docs.glossary`, default `GLOSSARY.md`);
- `GLOSSARY-MAP.md` at the root, if present, for per-context glossaries;
- the ADRs that touch the area (`docs.adr`, default `docs/adr/`);
- context-scoped ADRs under `src/<context>/docs/adr/` in a multi-context repo.

If a file does not exist, proceed silently. Create it when the first real term or
decision arrives.

## A glossary entry

```md
## Order

A customer's intent to buy one or more items.

**Not:** purchase, basket, cart.
```

- One term per entry, defined in the project's own words.
- Name the synonyms the project avoids; that is what stops drift.
- Use the term in issue titles, refactor proposals, hypotheses and test names.
- If the concept you need is missing, either you are inventing language the
  project does not use (reconsider) or there is a real gap (add the entry).

## An ADR

Use `templates/docs/adr.md` as the shape: status, context, decision, options,
why, consequences. Write it when the decision will outlive the task, when it is
expensive to reverse, or when a future session would otherwise re-litigate it.

- Status is `proposed`, `accepted`, `superseded` (name the successor),
  `deprecated` or `rejected`.
- A superseded ADR stays; link forward. Never rewrite history.
- A decision that is still moving is not an ADR yet; keep it in the spec or the
  map's Decisions so far.

## Conflicts

If your output contradicts an existing ADR, surface it explicitly instead of
silently overriding:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because…_

## What not to record here

- A tool or environment fact: that is a `docs/notes` entry.
- A requirement or accepted scope: that is the spec.
- Exploration, dead ends or the current thread: that is session memory; it does
  not belong in the domain docs.
- A local memory tool's contents: an index is not a source of truth.

## Finish

Update the glossary or ADR, then report the exact path and the one-sentence change.
Do not start implementing the decision in the same step.