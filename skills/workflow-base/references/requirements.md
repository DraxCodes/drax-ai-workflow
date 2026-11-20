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
- Probe the model with one one-token call; record the date and result in the artifact
  or in `visualReview.notes`. A listed model can still fail to route.
- Never claim a model works because it is in the catalogue.

## Benchmark hook

Not shipped yet. When the base ships benchmark data it is a base-owned file, hashed
with the release, so every project that updates gets the same evidence. Each record
carries the model, the task id, the protocol version, the sample count, the date and
the harness that produced it. Nothing writes back from a project to the base yet; a
human carries findings home.