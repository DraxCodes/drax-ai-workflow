# Workflow regression protocol

A model benchmark asks which model fills a slot. A **workflow** benchmark asks a
different question: on a fixed pack of representative tasks, does a change to the
base produce a better outcome, at what cost, and with what failure modes? It is
evidence for a base release, not a leaderboard.

## What ships

```
benchmarks/workflow/
  protocol.md
  packs/<id>/
    pack.json
    tasks/<NN-slug>/
      task.md        the brief shown to the agent
      key.md         the expected outcome; never shown to the agent
      input/         the files the task starts from
```

A pack names its protocol, version, task list and measured floor. A task is one
unit of work with a known-good outcome; `key.md` is the scoring anchor, not a
second brief.

## A run

1. Start from the task's `input/` in a clean project that carries the base version
   under test. Do not show `key.md` to the agent.
2. Run the workflow the task names — a fix, a spec review, a security review — with
   the same model set, budget and time limit for every candidate base version.
3. Score blind against `key.md` with the rubric below. The scorer reads the
   transcript, the diff and the evidence, never the agent's own claim.
4. Record the run with the ledger:

```sh
node .opencode/tools/base.mjs run start \
  --kind workflow --task 01-bug-fix \
  --protocol workflow-pilot-v1 --pack pilot \
  --models <provider/model>

node .opencode/tools/base.mjs run finish <id> --status passed \
  --verdict SHIP --score 8 --cost-usd 0.42 \
  --evidence .scratch/workflow/01-bug-fix/transcript.md
```

## Scoring

| Dimension | 0–4 | What earns the top |
| --- | --- | --- |
| Correctness | 0–4 | The outcome matches the key; no regression; the named obligation is actually met. |
| Evidence | 0–2 | The real command output, diff or screenshots; anything not run is labelled. |
| Scope | 0–2 | The change stays in the brief; no drive-by refactor, no unrelated file. |
| Cost | 0–2 | Within the declared budget; no unnecessary whole-tree read. |

Total is 0–10. **8 ships**; below 8 names the specific flaw to fix. A score without
the evidence its dimension names is void.

For a spec or security task, use the base's selected rubric as the anchor and map
its level definitions onto the same 0–10 total. Do not invent a friendlier scale.

## Pilot vs measured

- **Pilot** — three tasks. It can justify one more run, never a permanent claim.
- **Measured** — at least ten distinct tasks with no failed task, and at least two
  samples for a close call between base versions. Fewer is a pilot.

A changed task fixture changes the pack version; a changed scoring rule changes the
protocol version. Records from different versions never rank together.

## What it does not do

- It does not run an agent automatically. The run is agent-driven; the ledger and
  the scoring sheet keep it comparable.
- It does not replace the model benchmark. A model benchmark picks a seat; this
  protocol checks whether the workflow around that seat improved.
- It does not score a base change from a single task. One task is an anecdote.
- It does not hide a failure. A timeout, a malformed answer or a skipped check is a
  failed task, recorded as one.