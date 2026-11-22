---
description: Turn a new project idea into an approved first spec before any code
agent: task-orchestrator
---

Read `AGENTS.md` and `.opencode/workflow.json`. Confirm the seam's checks, the doc
paths and the packs before you ask anything.

Idea: $ARGUMENTS

If the idea does not already answer them, ask for:

1. the purpose in one paragraph;
2. the first milestone — the smallest thing worth shipping;
3. the non-negotiables: hosting, privacy, budget, deadline, and any stack the
   user has already fixed;
4. explicit non-goals.

## Options before the stack

Read `skills/workflow-base/references/options.md`. If the stack is not already
fixed, do not ask the user to name a framework or UI library from memory. Prepare
a one-page options brief first:

- ask whether learning or variety is a goal, and whether any stack should be
  avoided;
- read `~/.config/drax/portfolio.md` if it exists;
- search live sources for current options and date every claim;
- include the boring default, the modern default, one wildcard (a different UI
  library, admin panel, database, framework or language/runtime) when the
  constraints allow, and a custom/minimal option;
- if the last projects used React + shadcn, include a non-React/non-shadcn option
  and say why repeating is still right, or why this project is the deliberate
  change;
- if the user names something to try, such as Rust, include it as a real option
  and price the learning and maintenance cost;
- end with a default, why not the boring default, why not the wildcard, and what
  would change your mind.

Write it to `.scratch/<slug>/options.md`, show it, and ask the user to choose or
accept the default. If the stack is already fixed, record it and brief only the
layers still open. If live sources are unavailable, mark the brief `unverified`
and ask for a probe; do not present memory as current.

The chosen stack is recorded in the spec. After approval, append one line to
`~/.config/drax/portfolio.md` if the user agrees. Do not install, scaffold or
write app code while preparing the brief.

Then:

- If at least two council triggers hold, say which two in one line and stop for
  approval to run `/council`. The options brief is an input to that council. Do
  not implement.
- Otherwise write a spec in the seam's issue directory (`docs.issues`, default
  `.scratch/<slug>/spec.md`). Follow the `workflow-base` issue-tracker format. It
  must contain: goal, non-goals, the chosen stack and a link to the options
  brief, the seam's floor, the evidence that counts as done, the experience
  thesis if a council ran, and the first three tasks.
- Do not scaffold the stack, install dependencies, or write app code. Stop and ask
  me to approve the spec.

After approval, start task 1 and prove it with the seam's checks. If the effort
has more than one blocking question or will span more than one session, propose
`/wayfinder plan <effort>` before starting; if it is a single work item, use
`/checkpoint` at the end of each session.