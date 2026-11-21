# Model slots and recommendations

The base names no model. It names the slots a project must bind, what each slot is
for, and what kind of model it needs. The project binds them. Measurements may name
models; they never select one.

## Where a slot binds

| Kind | Binding |
| --- | --- |
| `agent` | `opencode.json` → `agents.<id>.model` |
| `seam` | `.opencode/workflow.json` → `visualReview.model` |

The blindspot reviewer is the only `seam` slot today: it is a script, not an agent.
`base requirements .` prints every slot, its state and its exact key; `--json` gives
the same report to a script.

## The three states

- **bound** — a selector is present.
- **placeholder** — `<provider/model>`; treated as unbound until replaced.
- **unbound** — nothing is bound. An agent slot silently inherits the root model; the
  blindspot slot is skipped and the artifact records why.

Never bind a model without the user's answer. Never fill an unbound slot with another
seat's model — lineage diversity is the point of the second seat, and a shared family
shares its blind spots.

## Lineage diversity

The four council seats and the visual blindspot are independent opinions only when they
span more than one model family. A slot with `lineageDiversity: true` is part of that
check. `doctor` warns when every bound council seat shares one family, and when
`hillclimb.blindspot` shares a family with `council.experience` (the gate). Lineage is the
model family — `claude`, `gpt`, `gemini`, `glm`, `deepseek`, `qwen` and so on — not the
provider: two providers serving one family still share its blind spots. The warning is
advisory; a project may have a deliberate reason, but it should be visible.

## How to recommend

Filter first: modality (a screenshot seat needs `image` input), context, priced work
shape, and whether the provider routes today. Then rank by tier:

1. **Measured** — the base's benchmark records, when a release ships them. The task
   protocol version and date travel with the number; stale evidence is down-ranked,
   and a changed protocol is a new record, never an overwrite.
2. **Asserted** — the user's standing choice, in `AGENTS.md` outside the managed
   block or in `~/.config/drax/bootstrap.json`.
3. **Derived** — a heuristic over the providers the project declares: modality,
   input/output price, context, declared variants, status, lineage.

Ordering is by evidence, always. A pin does not jump the queue; it preselects, and its
rank is shown beside it. If the pin is not top-ranked, say so in the option text:
"your pin; ranked 3rd on catch rate, last tested 4 months ago".

## The ask

Use the question tool: one question, two to four options, always including
"assign later". Each option names the model, the provider, why it sits there, and what
it costs.

> **hillclimb.blindspot needs an image-capable model. Which should I bind?**
> - **GLM 5.3 Flash — surplus** *(Recommended)* — vision probe passed; $0.04/$0.08 per
>   M; different lineage from the chair
> - **Claude Sonnet — surplus** — vision-capable, stronger taste read, ~40× the price,
>   no measured catch rate
> - **Assign later** — skip the blindspot pass and note it in the artifact

In a harness without the question tool, print the same list and wait for a numbered
answer.

## After binding

- Write the selector to the slot's key. For the seam slot, keep `visualReview.notes`
  for a local exception such as a routing floor.
- Probe the model with `node .opencode/tools/base.mjs probe <slot> .`; record the date
  and result in the artifact or in `visualReview.notes`. The probe checks text, JSON,
  tool calling and — when the slot needs it — image input; `--full` adds a long-context
  needle. A listed model can still fail to route, so a one-token call remains the
  fallback when the provider has no price or no OpenAI-compatible endpoint.
- Never claim a model works because it is in the catalogue.

## Benchmark evidence

The base ships benchmark records and packs, hashed with the release, so every
project that updates gets the same evidence. Each record carries the model, the task
id, the protocol version, the sample count, the date and the harness that produced
it. Nothing writes back from a project to the base yet; a human carries findings
home.

Read the ranking before writing the ask:

```sh
node .opencode/tools/base.mjs benchmark report --slot council.risk
```

The first shipped pack is `security-review` (ten code slices, protocol
`security-review-v1`) for `council.risk`. The council-seat packs
(`council-chair`, `council-shape`, `council-experience`) use protocol
`council-seat-v1`: a brief, a fixed input slice and an exhaustive criteria key.
They ship with ten tasks at pack version 2; a smaller local pack is a pilot.
`visual-project-list` uses `visual-review-v1` for `hillclimb.blindspot`: a brief
and screenshots with a key of visual defects by shot and region. It is a one-task
pilot today; ten visual tasks are needed before the blindspot can be measured. A
model is **measured**
only after at least ten distinct tasks with no failed task; fewer is a **pilot**,
which may justify one more run but never a permanent assignment. A measured row is
`medium` confidence with one sample; `high` needs repeated samples, and the runner
currently refuses `--samples 2`, so `high` is unavailable. A pilot is `low`.
Evidence older than 180 days is stale and ranks below fresh measured evidence.
Unique catch, agreement and cost per unique catch need a `--reference-model`; without
one the table still ranks catch, precision, false positives, cost and latency.

A paid run is explicit:

```sh
node .opencode/tools/benchmark.mjs run \
  --models <provider/model>,<provider/model> \
  --budget-usd 1 --reference-model <provider/model> \
  --prices prices.json --out .scratch/benchmarks/<date>
```

It refuses without a budget, without a declared price for every model, or when a
candidate is outside the `--price-band` (default 2× input or output) around the
reference. Preflight prints the worst-case estimate; the run stops at the cap.
`--dry-run` makes no call. A run writes a record fragment under `--out`; in a base
checkout, `benchmark promote <run-dir>` merges it at release time, after reviewing
the diff. The command refuses in a project, so evidence flows one way.

The protocol and task-pack shape are in the base's `benchmarks/protocol.md`; the
command details are in its usage text. The visual pack is deferred until the image
quota allows it; the same protocol and scoring rules apply.