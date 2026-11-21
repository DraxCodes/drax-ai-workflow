# 0003 — Named hillclimb rubrics

**Status:** accepted (2026-11-17)
**Context:** the hillclimb gate shipped one 1–10 rubric built for visual and
human-perception work. Backend objectives, API/CLI usability, and "what did this
spec fail to decide?" had no honest gate: they were scored through a UI-shaped
scale, and a measurable metric was explicitly *not* a threshold. The baseline has
to support more than beauty.

## Decision

The hillclimb gate is **one named rubric per run**, chosen before the first score:

1. An explicit `Rubric: <name>` in the task or spec wins.
2. Otherwise the seam's `rubrics.default`.
3. Otherwise `perception`.

Four rubrics ship in `skills/hillclimb/references/rubrics/`:

| Rubric | Artifact | What changes |
| --- | --- | --- |
| `perception` | UI, UX, visual surfaces, copy, rendered docs | Probes and anchors are visual; evidence is seed + shots + read-through |
| `usability` | API, CLI, errors, logs, config, docs | Probes are first-use, error recovery and naming; evidence is a transcript |
| `performance` | latency, throughput, memory, size, build time, cost | Levels are measured against a budget table declared before measuring |
| `completeness` | a spec, proposal, architecture choice, built feature | Levels are coverage of a filled obligation inventory |

What stays shared across every rubric:

- The seam's `checks` are the floor; a red floor cannot score 8 and cannot ship.
- Scores are whole numbers; 8 ships unless a 10 was demanded; 8–9 with a 10
  demanded gets at most two attempts.
- Two consecutive iterations without a higher score stop the run.
- A score without the evidence its rubric names is void and treated as below 8.
- Each rubric carries its own anti-inflation rules.

`references/hillclimb-rubric.md` is reduced to a compatibility pointer at
`rubrics/perception.md`. A project may ship its own rubric file and set
`rubrics.default` to a path; `doctor` resolves the name and fails when it is
missing.

## Options considered

| Option | Shape | Verdict |
| --- | --- | --- |
| **A. Named rubric files, chosen per run (chosen)** | A rubric library plus a seam default and a per-run override | Chosen |
| B. One rubric plus an addendum that may replace it | The addendum can define a whole alternate scale | Rejected |
| C. Per-run rubric composed inline from a decision guide | No shipped files; the scale is rebuilt each run | Rejected |

## Why A

- Different artifacts need different gates; a project can be UI-heavy and still run
  a `performance` hillclimb on its build, or a `completeness` hillclimb on a spec.
- The scale is written down once, so scores are comparable across runs and
  reviewers. Option C rebuilds it each time and drifts.
- `completeness` makes "did I miss anything?" a first-class, repeatable gate instead
  of a vague review.
- The seam default lets a backend-only project stop restating `Rubric:` on every
  run without forcing that choice on a mixed project.

## Why not B

An addendum that can replace the scale makes the gate project-local and invisible
in review: two projects' "8"s would mean different things. The addendum is kept as
an extension point — probes and caps — so the floor and level anchors stay shared.
It cannot lower the floor or weaken a level.

## Why not C

A rubric reconstructed from a short guide is unreproducible: the same artifact can
score differently on a second run because the levels were re-derived. A durable
gate needs a file the reviewer reads and quotes, the same way `perception` was
quoted.

## Consequences

- The run must record the rubric alongside the target; a rubric chosen after seeing
  the result is invalid.
- `performance` adds a real precondition: the budget table precedes the first
  measurement. A moving target is void.
- `completeness` can score a spec with no build or test; the floor is then the
  checks that exist, and "no build/test in this project" is stated rather than
  implied green.
- New rubrics are a base release (a new file), but a project can add a local file
  and point `rubrics.default` at it without waiting.