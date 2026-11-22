# Model benchmark protocol

A benchmark is evidence for a model slot, not a leaderboard. It answers one
question: on a fixed, representative task pack, which model finds the defects that
matter, at what cost, and what does a second model add?

## Versions

- A **protocol** is the prompt shape, the output schema, the scoring rules and the
  promotion rule. Change any of them and the protocol version changes.
- A **pack** is the tasks, their files and their exhaustive keys. Change a fixture
  and the pack version changes; the pack hash travels with every record so two
  contents with the same version cannot silently rank together.
- A record names both. Old records stay readable; they do not rank against a new
  protocol and they are never overwritten.

## What ships

`benchmarks/records.json` is base-owned and hash-managed with the release, so every
project that updates gets the same evidence. A run writes a fragment under its
output directory. In a base checkout, an explicit
`benchmark promote <run-dir>` merges it; the command refuses in a project, so
nothing writes back from a project to the base automatically.

Task packs ship too, under `benchmarks/packs/<id>/`. A project may run a local pack
with `--pack <dir>` for a pilot, but only base packs produce evidence that ranks in
the base's recommendations.

## A run

1. Pick a slot and a pack. The pack names the slot and the minimum task count.
2. Pick models explicitly, as base model ids. A variant selector (`#low`, `#medium`,
   `#high`) is refused: the API receives the base model, so a variant record would
   claim something the run did not test.
3. Declare prices and a budget. A real run refuses without both.
4. Every model runs every task blind: the brief and the files, never the key.
5. One call per task per sample, `temperature: 0`, a fixed `max_tokens`. The runner
   accepts `--samples` from 1 to 5; two or more samples give high confidence.
   `samples`, `max_tokens`, `retries` and `temperature` are recorded and
   group the evidence.
6. A malformed or failed answer is a failed task, not a repaired one. The answer
   must be one JSON object: a code fence or prose prefix fails. The model is
   incomplete until the task is re-run.
7. The run stops at the budget. Completed records are kept; unrun tasks are not
   invented. Failed and retried calls are charged from their usage block; when the
   provider omits usage, the worst-case reservation is held against the cap.

## Scoring

A finding catches a key defect when it is in the same file and within `lineWindow`
lines of the key range. Every eligible pair is ranked globally by line distance and
assigned one-to-one; an earlier loose defect cannot steal a later exact match. The
kind is a calibration label, not a gate: a wrong-but-reasonable kind still catches
the defect and is counted as a **kind mismatch**. Unmatched findings are false
positives.

- **Catch (weighted recall)** — blocker 8, major 4, minor 2, nit 1, divided by the
  key's total weight.
- **Precision** — for a task with key defects, caught / (caught + false positives);
  no findings scores 0. For a safe task (no key defects), no findings scores 1 and
  each finding scores 0. The aggregate is a micro-average over tasks.
- **Severity mismatch** — a caught pair two or more severity levels apart.
- **Kind mismatch** — a caught pair whose kind labels differ; the location is right,
  the taxonomy is not.
- **Agreement** — Jaccard over caught key ids against a named reference model, on the
  tasks both actually scored.
- **Unique catch** — key ids this model caught and the reference missed. This is the
  question a second seat exists to answer.
- **Cost** — tokens from the provider's usage block times the declared list price,
  including failed and retried attempts. An invoice is the truth; the record says
  `null` when the price is unknown.
- **Cost per unique catch** — total cost divided by the key ids this model caught and
  the reference missed. It answers the seat question — what does the second opinion
  cost? — better than a raw token bill. `null` when there is no reference or no unique
  catch.
- **Failed tasks** — distinct tasks with at least one failed record. Failed records are
  visible and charged; they are not silently dropped.

## Council seat protocol (`council-seat-v1`)

The security pack measures a reviewer against file/line keys. A council seat needs a
different task: a short brief plus a fixed input slice, a strict JSON answer, and an
exhaustive key of weighted criteria. `council-seat-v1` covers `council.chair`,
`council.shape` and `council.experience`; the visual blindspot stays a pilot until a
`kind: "visual"` pack is implemented.

- A council pack declares `kind: "council"` and a `seat`. A task has a `brief.md`, an
  `input.md` (the proposals or context) and a `key.json`; it has no code files.
- The output is one JSON object for the seat. Chair: `options`, `recommendation`,
  `dissent`, `rejected`. Shape: `shape`, `newFiles`, `newDependencies`, `seams`,
  `deferred`, `reversible`, `why`, `whatWouldChangeMyMind`. Experience: `thesis`
  (five observable markers), `evidence`, `nonGoals`.
- A key is a list of weighted `criteria`; each criterion names a path, a match
  operator and an accepted value. `forbidden` entries are false claims; `claims` can
  reject an invented option id or a new dependency. The key is never in the prompt.
- **Catch** is weighted criteria met divided by total weight. **Precision** is met
  criteria over met plus false claims and invented claims. A schema error is a
  failed task, not a miss.
- The measured floor is still ten distinct tasks with no failed task. A three-task
  pilot pack is valid but is a **pilot**, not measured. One sample gives `medium`
  confidence; two or more samples give `high`.
- Report with `--protocol council-seat-v1 --slot council.chair` (or shape or
  experience). Unique catch and cost per unique catch compare criterion ids against
  the reference model, the same way the security protocol compares key ids.

## Visual protocol (`visual-review-v1`)

The blindspot seat needs an image task, not a code slice. A visual pack declares
`kind: "visual"` and `slot: "hillclimb.blindspot"`. A task is a brief plus one or
more shots; the key lists visual defects with a shot id, a region description, a
kind (`defect`, `observation` or `question`) and a severity.

- The model receives the brief and the images, never the key. It returns strict
  JSON: `{"findings":[{shot,region,kind,observed,expected,condition,severity,confidence,evidence}]}`.
- A finding catches a key defect when it is on the same shot and its region
  covers the keyed terms at or above the pack's `regionThreshold` (default 0.6).
  Coverage is directional, so a detailed but correct region still matches a short
  key. Pairing is one-to-one and greedy, as in the code pack.
- Unmatched findings are false positives; unmatched key defects are misses.
  Severity weighting, kind mismatches and precision work as in the code pack.
- Image input is charged at a conservative 1,500 tokens per shot in the preflight
  estimate; the provider usage block is the authority at run time.
- The measured floor is still ten distinct tasks with no failed task. The shipped
  `visual-project-list` pack is now **ten tasks and 130 keyed defects**. The
  measured run completed 10/10 when one retry per task was allowed, at 60% catch /
  66% precision and 40 false claims; a second model with a valid review is still
  needed to contest the seat. A retry group is recorded separately from a no-retry
  group and never ranks with it.
- Report with `--protocol visual-review-v1 --slot hillclimb.blindspot`.

## Promotion

A model is **measured** for a slot only when it has at least ten distinct scored
tasks and no failed tasks. A pack may set a lower `minTasks` for a pilot, but the
measured floor never drops below ten. Otherwise it is a **pilot**: it can justify
one more run, never a permanent assignment.

Within measured evidence, **confidence** is `medium` with one sample; `high` needs
repeated samples. A pilot or
incomplete group is `low`. A high-confidence row would be a repeated measurement,
not a larger task pack. A close ranking between medium rows says to repeat the run
before moving the seat.

Evidence is grouped by protocol, pack, pack version, pack hash, `max_tokens` and
`retries`; different groups never rank in one table. The group is **stale** when its
oldest scored task is older than 180 days, not merely its newest. A pin still
preselects; the ranking still shows where it sits.

## Cost discipline

Benchmarks are paid work. The harness defaults to refusing spend:

- `--models` is an explicit list; `--budget-usd` is a cap. The runner reserves the
  conservative worst case for the whole retry budget before a task; a provider that
  reports more usage than the reservation can still overshoot one call, and the run
  stops immediately after it.
- Every model needs a price from `opencode.json` or `--prices`.
- `--price-band` (default 2×) refuses a candidate priced far above the reference
  model instead of silently dropping it.
- Preflight prints the worst-case estimate (an approximation from prompt length) and
  refuses when it exceeds the budget.
- Default retries are zero; every retry and every failed answer is charged.
- `--dry-run` resolves and prints the plan without a network call; it does not need
  a bound reference or a price, and it reports what is unknown.

The first run should be ten short tasks, one sample, and two or three models in the
same price band as the incumbent.