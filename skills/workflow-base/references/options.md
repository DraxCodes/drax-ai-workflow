# Options brief — discovery before a stack or library choice

An options brief is the short, dated survey that comes **before** a stack,
skeleton, library or language choice. It is an input to `/start-project` and to
`/council`, not a fifth seat and not a vote. The user decides value and variety;
the brief makes the choice visible.

Use it for:

- a new project skeleton;
- a new subsystem, dependency or transport;
- a choice with more than one credible option;
- anything expensive to reverse.

Skip it for a rename, a one-line fix, or a stack the user has already fixed.

## What the brief must contain

One decision, 2–4 options, one page:

- **Boring default** — the existing stack, or the most familiar low-risk option.
- **Modern default** — the current well-adopted option that improves the work.
  "Modern" means maintained, documented, compatible and accessible, not merely
  new.
- **Wildcard** — a credible option the user may not know: a different UI library,
  admin panel, database, framework or language/runtime. Include it whenever the
  constraints allow. If no credible wildcard exists, say why.
- **Custom / minimal** — build it yourself or add no dependency.

If the last two projects used the same stack, the brief **must include a
non-React/non-shadcn option** and say why repeating the stack is still right, or
why this project is the deliberate change.

If the user names something to try — Rust, Go, Elixir, Svelte, a new admin panel,
a new database — include it as a real option and price it. Do not talk them out
of it; show the cost and the fit.

### Layers, not one choice

A new project may need separate rows rather than one "stack":

- runtime / language;
- web framework;
- UI / component layer;
- admin surface;
- data store and migrations;
- auth;
- deployment.

Brief only the layers the decision actually touches. For a new project, brief all
of them. For a feature, brief one.

A UI kit is not an admin panel. If the project has an admin surface, name a real
admin option and its language fit; do not assume the component library covers
tables, filters, forms, permissions and audit history.

A language wildcard is a **stack**, not a language swap. If the user wants Rust,
name the web framework, template/UI layer, admin path, database access, auth and
deployment, and say what is missing. Price the gaps; a language is not a drop-in.

## Finding the wildcard

The point of the brief is to surface options the user does not already know:

- ask the user for names they have heard and want considered;
- search the registry, official docs, GitHub topics and release notes for the
  category, sorted by recent activity and adoption;
- look at "alternatives to X", awesome lists, framework showcases and recent
  release posts;
- include one option outside the current stack/language when the constraints
  allow;
- if a candidate cannot be verified, put it under **Worth watching** with a date
  and the trigger to revisit, not in the default recommendation.

New is not the same as better. A new library still needs maintenance, adoption,
docs, license, accessibility and an exit plan.

## Discovery protocol

Do not write the brief from memory alone.

1. **Read the project.** `AGENTS.md`, the seam, the spec, the first milestone, the
   existing stack, and the budget/deadline/privacy constraints.
2. **Ask the user two questions.** Is learning or variety a goal for this
   project? Is there a stack or library to avoid repeating?
3. **Read the portfolio note.** If `~/.config/drax/portfolio.md` exists, read the
   last few stacks. The brief must state "same as recent" or "deliberate change"
   and why. If it does not exist, ask; after approval, append one line.
4. **Search live sources.** Official docs, package registries (npm, crates.io,
   PyPI, Packagist, pub.dev), release notes and changelogs, the project's
   repository, accessibility docs and the license. Use web search/fetch or the
   browser when available. Check the last release, cadence, open issues,
   adoption, SSR/runtime fit, theming, bundle/runtime cost and migration path.
5. **Date every claim.** "Last release 2026-10", "checked 2026-11-22", "not
   verified". A model's memory is not a source; a library released last month may
   not be in it.
6. **If there is no live access**, mark the brief `unverified`, list what you
   would check, and ask for a probe. Never present stale memory as current.
7. **Time-box it.** 30–60 minutes, 2–4 options, one or two decisions. A brief
   that delays the first milestone for a week is a failed brief.

## The comparison table

| Column | What it answers |
| --- | --- |
| Option | What are the credible choices? |
| Useful for the first milestone | Which one ships the smallest useful thing? |
| Beautiful / design fit | Can it deliver the art direction without fighting it? |
| Modern / maintained | Last release, cadence, docs, adoption, license, accessibility, SSR/runtime fit |
| Cost | Bundle/runtime, build, learning, migration, operations |
| Reversible? | How do we change our mind, and at what cost? |
| Verdict | Pick / reject / worth watching |

Do not collapse these into one score. A new library can be modern and still wrong
for this milestone; a boring library can be the right beautiful choice.

## Recommendation

End with:

- **Default:** "Choose X unless you say otherwise."
- **Why not the boring default:** one line.
- **Why not the wildcard:** one line.
- **What would change my mind:** the condition that flips the default.
- **Worth watching:** new options not chosen, with a date and a trigger to
  revisit. This is where an exciting but unproven library belongs.

If the user wants to learn something, the wildcard can be the default; say what
the learning budget is and what the exit looks like. If the project is
production/long-lived, the boring default usually wins; say so.

## Beautiful is tested, not asserted

For a UI choice, use the council's **one throwaway visual probe**:

- two static fragments, same content, differing only in the component system;
- screenshots at 375 and 900, light and dark;
- chosen by eye, with the reason written down;
- deleted after the decision; never committed.

The experience seat judges the probe; the user decides. No artifact, no score.

## Where it lives

- Write the brief beside the spec or council record, for example
  `.scratch/<feature>/options.md`.
- Link it from the spec and the council file.
- The chosen option and the dissent go in the spec/council; the brief stays as
  the evidence.
- A stack brief is stale after about 90 days; a feature-library brief after about
  180. Re-check before reusing it.

## Portfolio note

Optional machine-local file:

```md
# Recent stacks

- 2026-11 personal-website — Fastify + TypeScript + SQLite, server-rendered
- 2026-10 DraxLink — VS Code extension + TypeScript
```

The brief reads it; after the user approves a stack, append one line. The point
is not to force variety, but to make repetition a visible choice. If the last two
projects are React + shadcn, a third needs a reason.

## Anti-patterns

- "React + shadcn because that is what we know", with no portfolio check.
- A new library recommended without a source, date or maintenance check.
- A ten-option survey that delays the first milestone.
- The shape seat rejecting the modern option solely because it adds a dependency;
  it must price the dependency.
- Treating "beautiful" as a synonym for "new".
- Forcing one stack across every project. Variety is a user value.
- A wildcard with no exit plan. If it is new, say how we back out.

## Template

```md
# Options brief — <decision>

Date:
Project:
First milestone:
Constraints:
User values: learning / variety / speed / budget / none
Portfolio: last stacks; same as recent or deliberate change, and why

| Option | Useful for M1 | Design fit | Modern / maintained | Cost | Reversible | Verdict |
| --- | --- | --- | --- | --- | --- | --- |

Default:
Why not the boring default:
Why not the wildcard:
What would change my mind:
Worth watching:
Sources checked (date):
Confidence: verified / partly verified / unverified
```