---
name: Council
description: Deliberate a large feature before building it — diverge on credible options, critique them, and settle the experience thesis and value trade-offs that the hillclimb gate will later score against
---

# Council

A council is the **divergence** phase for a large feature. It answers three questions the
hillclimb loop cannot:

- should we build this at all, and in which shape;
- what must it *feel* like at 8/10;
- which trade-off do we accept — speed for polish, a click for safety, a dependency for
  reach.

Hillclimb answers "is it built well enough?". Security answers "is it safe?". The user
answers "is it worth it?". A council never decides value on the user's behalf.

## When to convene

Convene when **at least two of these six** hold:

1. a new user-facing surface (screen, panel, card, flow);
2. a new subsystem, protocol, dependency or transport;
3. it crosses a seam (run, session, stream, storage);
4. it is expensive to reverse once shipped;
5. more than one design is credible, not merely possible;
6. the user asks for a council.

Small work skips it. When skipping, say why in one line. A council costs cents; a wrong
shape costs a rebuild, so err toward convening on ambiguous work and never on a rename.

## How often

A council runs **once per decision**, not once per feature build and never per iteration.

- **Once, at the start** of a large feature: the brief, the rounds, the artifact.
- **Again only if the decision materially changed** — the fixed point moved, a constraint was
  invalidated, or the build proved the chosen shape wrong. That is a new brief and a new
  dated section in the same `council.md`, not a re-litigation of the old one.
- **Not during implementation.** "Is it good enough?" belongs to the hillclimb gate, which
  runs on the cheap seats and repeats every iteration. A council that re-runs each time a
  component changes is an expensive linter, not a council.
- **One contested question mid-build** does not need a full council: load this skill for a
  single round with two or three seats. That is what the skill is for.

So the realistic budget for a large feature is one full council (cents) plus, occasionally,
one short single-question round. Against a single hillclimb iteration that drives real
opencode runs, that is noise. The expensive event is building the wrong shape, which is what
the council exists to prevent.

## Roles

The council adds no agents. It reuses the four that already exist, each as a **lens**, and
each is read-only.

| Seat | Agent | Lens | Delivers |
| --- | --- | --- | --- |
| Chair | `task-orchestrator` | owns the brief, the options brief, rounds, triage and record | one proposal, the options table, the recommendation, the dissent |
| Shape | `plan-architect` | simplest viable shape within each option, seams, reversibility | one proposal and what it defers; a dependency is a cost to price, not an automatic rejection |
| Experience | `quality-gatekeeper` | the felt read, through the rubric's probes; judges the visual probe when two UI options are close | one proposal and the experience thesis |
| Risk | `security-auditor` | abuse, exposure, failure modes, local-only posture; supply chain and license for each option | one proposal or a constraints-first position, plus the red-team list |

The chair proposes its own option first, so it is not only a switchboard.

## Seat models

Seats run on the agents' configured models, so the project decides the mix in
`opencode.json`. Aim for at least two model lineages across the four seats. A reasonable
*starting* mix is the cheapest reliable model on chair and shape (aggregation and
structure), the strongest taste judgement on experience, and the bluntest model on risk —
but that is a hypothesis about the lenses, not a finding. The project's own `AGENTS.md` may
name a measured mix; use it when it does.

**Verify, do not assume.** A provider can list a model and still fail the request (a
routing floor, a retired version, a market that moved). Run `base probe <slot> .` before
changing a seat — or a one-token call when the provider cannot be probed — and record the
result and fallback in the artifact. `doctor` warns when the bound council seats share one
model lineage. Model diversity is a hypothesis, not a guarantee; a better brief beats a
better model.

**Seat by evidence, not by tier.** When two models are candidates for a seat, give both the
same real change, blind, and read the findings and scores they return. The seat goes to the
cheapest model whose findings survive verification: a cheap model that reproduces the catch
keeps the seat, and an expensive one that misses it loses it, whatever its list price. Price
decides between models that find the same things — never instead of evidence.

**Match the model to the lens's work shape.** A read-heavy, write-light lens (gate, audit)
wants a low input price and a long context; a lens that writes long prose wants a cheap
output price. A per-token price says nothing until you know how many tokens go in, so price
the brief, not the model.

**Write the fallback down.** If the agent config has no fallback key, the fallback is a
rule in the project's `AGENTS.md`: which model replaces which, why, and when to restore it.
Probing a candidate is one call with a one-line brief — cheaper than discovering the failure
mid-task.

**Routability is per request, not per catalogue.** A model that routes at one hour can fail
the next: resale markets move, and a discount floor the provider enforces can leave a
listed model with no seller. Read the failure message, not the status code — "no sellers
meet the floor" arrives looking like a transport problem and stops a commit just as
effectively as a 404. Probe immediately before you rely on a seat, not when you chose it.

**Two seats on one lineage are one opinion.** The second seat exists to catch what the first
missed, and a shared model family shares its blind spots. When routability forces the gate
onto the auditor's lineage, say so in the artifact and check that seat's finding against the
lens that *did not* write the code. Restore the split seat when the market clears.

**Modality decides a perceptual seat.** A gate that scores screenshots needs a model whose
input modality includes images; a text-only model can only score a description of the
artifact, which is not the artifact. Confirm the modality in the catalogue before seating
a perceptual lens, and do not spend a frontier-model exception to read a screenshot a
cheaper vision model can read directly.

## The brief

The chair writes one brief and every seat receives it verbatim. It must contain:

- the question, in one sentence;
- the fixed point (commit) and the constraints that cannot move;
- non-goals — what is explicitly out of scope;
- what evidence would settle the decision;
- an options brief for any stack, skeleton, library or language choice, per
  `workflow-base/references/options.md`; it names the boring default, the modern
  default, a wildcard and a minimal option, with dated sources;
- the trade-off rows each seat must take a position on;
- the seat brief and output limit.

A vague brief produces generic advice from every model. If the brief cannot name the
trade-off, stop and sharpen it with the user first.

## The options brief

A stack, skeleton, library or language choice is a council decision when it is
expensive to reverse or more than one design is credible. It is not a fifth seat;
it is an input the chair attaches to the brief.

The brief follows `workflow-base/references/options.md` and contains:

- a **boring default**, a **modern default**, a **wildcard** and a **custom/minimal**
  option;
- a **portfolio check**: what the last projects used, whether this repeats that
  stack deliberately, and why. If the last projects were React + shadcn, a
  non-React/non-shadcn option is required unless the constraints rule it out;
- the wildcard the user may not know: a different UI library, admin panel,
  database, framework or language/runtime. If the user names something to try, such
  as Rust, price it as a real option;
- dated sources. If live sources are unavailable, mark it `unverified` and ask for
  a probe; never present memory as current;
- a default, why not the boring default, why not the wildcard, and what would
  change the chair's mind.

The **shape** seat evaluates the smallest viable shape *inside each option*. It
must price a dependency, not reject an option because it has one. The
**experience** seat may use the one throwaway visual probe to compare two UI
options. The **risk** seat checks supply chain, license, maintenance and exposure
for each option. The chair recommends a default and records the user's choice and
dissent. The council does not decide value or variety for the user.

## Rounds

1. **Independent proposals.** Launch all seats in parallel with the same brief. No seat sees
   another's output. Each returns at most 400 words: shape, why, cost, risk, and what would
   change its mind. The experience seat also drafts the experience thesis.
2. **Cross-critique.** Each seat red-teams the others' proposals. The experience seat states
   what evidence would earn an 8 — it does **not** score, because no artifact exists yet. The
   risk seat names the top failure mode.
3. **One revision, maximum.** Only when two options are within a hair. Never a third round;
   escalate the split to the user instead.

No voting. The chair triages, recommends, and records dissent.

## The experience thesis

One short paragraph: what this must feel like at 8/10, in observable terms. Not adjectives.
Name the three-second read, the first-run path, the copy voice, one moment that should feel
good, and the friction to avoid — concretely, such as "options cap at three with a `more`
row", "focus lands on the first option", "the card is one line wider than an answer".

The experience seat drafts it from the project docs named by the seam
(`docs.artDirection` and `docs.contract`, when they exist) and the rubric in the
`hillclimb` skill. The council critiques it.

**It travels forward.** The chosen thesis is written into the spec, and the hillclimb gate
later scores the built artifact against this thesis *and* the rubric, so the intent is not
re-invented after the fact.

## The value trade-off register

The council must take a position on the trade-offs, not shrug. One row per trade:

| Trade | What it buys | What it costs | Who feels it | Reversible? | Position | Strongest counter-argument |
| --- | --- | --- | --- | --- | --- | --- |

Every row ends in a recommendation **and** the strongest case against it. "It depends" is
not an answer; if the council genuinely cannot settle a row, it is a question for the user,
listed as one.

## Subjective evidence

Some questions cannot be settled in prose — "does this look good?", "is the prettier version
worth the cost?". The council may spend **one throwaway visual probe** per feature:

- two static fragments, same content, differing only in the decision under test (plain HTML,
  or a seeded project page);
- screenshotted at 375 and 900, light and dark;
- chosen by eye and written up with the reason;
- **then deleted.** Never committed, never cited as a deliverable.

Cap it at one screen. If the probe does not settle the question, it goes to the user.

## Output

Write one file, in the seam's issue directory (default
`.scratch/<feature>/council.md`):

1. Question, constraints, non-goals.
2. Options brief, linked, when the decision touches a stack, library or language.
3. Proposals — one per seat, unedited.
4. Critiques.
5. Experience thesis.
6. Value trade-off register.
7. Options table — option, shape, cost, risk, reversibility, what it buys.
8. Recommendation, with dissent recorded and rejected options named.
9. Thread-split proposal — lanes with non-overlapping write scopes and their dependencies.
10. Decision — filled in by the user, with the date.

The spec links this file, so the debate is not re-litigated later.

## Hand-off

1. The user decides, or amends.
2. `plan-architect` turns the choice and the experience thesis into the spec and plan.
3. Build. If the feature is quality-sensitive, run the `hillclimb` loop against the thesis.
4. `/code-review`, then one logical commit.

## Rules

- No code, no prototype beyond the single probe, no implementation plan during the council.
  Deliberation and building do not share a phase.
- Every seat is read-only. The chair makes no edits during a council either.
- The experience seat never scores an artifact that does not exist. A score without an
  artifact is void.
- Record dissent verbatim. An option that lost for a good reason is more useful next year
  than a consensus that hid the disagreement.
- Keep cost proportional: a council is cents, but a council on a rename is waste.
- No stack-by-default. A stack or library recommendation must show the options brief,
  the portfolio check, and at least one credible alternative when the constraints allow.
  The user decides value and variety.
- Never commit the probe, the seeded data, or the key of a field test.