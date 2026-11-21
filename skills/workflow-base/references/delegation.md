# Delegation brief and report contract

A subagent starts with no context. The brief is the whole cost of the delegation:
what you point it at is what it reads. A good brief is a slice, a claim and an
output shape; a bad brief is a repository tour.

## The brief

Use this shape for `plan-architect`, `quality-gatekeeper`, `security-auditor` and
every council seat.

```md
## Objective

One sentence: the decision, artifact or change this delegation must produce.

## Fixed point

<commit, tag or branch> and the exact paths. Never "the repo".

## Read

- <path or diff> — why it matters
- <test or spec> — the obligation it proves

## Do not read

- <dependency tree, generated files, unrelated modules> — and why

## Claims

- <A specific claim to confirm or refute, with the evidence that would settle it.>
- <Another claim.>

## Output

<The report contract below, plus any seat-specific section.>

## Budget

<A token, cost or time ceiling. If the brief would exceed it, stop and say so
before reading further.>
```

### Rules

- **A slice, not a tree.** Name the commit range and paths. "Audit the repo" is a
  defect in the brief; the subagent should name the slice it will read instead.
- **Claims, not dependencies.** "X rejects before any DB write — confirm or
  refute" is complete. Asking a subagent to verify a library sends it through
  `node_modules`, which is where the expensive runs go.
- **Findings, not confirmation.** "Is this safe?" produces a checklist; "treat
  this as an authentication bypass and decide whether it is contained" produces a
  finding.
- **One scope per brief.** A plan, a score and an audit are three delegations.
- **State the cost of a big read** in one line before starting it.
- **Escalate the finding, not the diff.** Send the finding to a stronger model,
  not the diff it came from.
- **The subagent may widen its read**, but only after naming the question the
  slice could not answer. A widening with no named question is a defect in the
  brief.

## The report

Every seat returns the same envelope; the seat-specific section follows it.

```md
## Verdict

<PASS | CONCERNS | SHIP | KEEP | STOP | REVERT | ASK | PLAN>

## Evidence

<What was read or run, with the command and the observed result. Say what was
not run.>

## Findings

- <severity> — <file:line or artifact> — <what is wrong> — <the concrete fix>

## Routing

- <finding> → <task-orchestrator | plan-architect | the person>

## Confidence

<high | medium | low> — <what would raise it>

## Not checked

- <path, claim or check outside the brief>
```

### Seat-specific additions

| Seat | Adds |
| --- | --- |
| `plan-architect` | Rubric, target, evidence plan, baseline flaws, floor, ordered iterations, stop conditions. |
| `quality-gatekeeper` | Rubric, score `n/10 — level`, why not higher, drift, blindspot disposition, recommendation. |
| `security-auditor` | Tests, secrets/exposure, security findings, routing, the best-practice source and date checked. |
| Council seat | The independent option or critique, the trade-off it accepts, and the evidence that would settle it. |

## What a brief is not

- A request to agree with a proposal. Convert it to claims first.
- A substitute for the spec, ADR or rubric. Link them; do not paste a second
  copy.
- A reason to read the whole tree. The cost follows the context, not the number
  of steps.
- A place for secrets. Reference where a value lives; never paste it.