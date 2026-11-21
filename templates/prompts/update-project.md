Update this project's vendored Drax AI Workflow, then tell me what needs configuring.

1. Clone https://github.com/DraxCodes/drax-ai-workflow into a temp dir
   (or use $env:WORKFLOW_BASE when it is set); call that path <base>.
2. Plan with the base's own CLI, so the release's new requirements are listed:
   node <base>/tools/base.mjs update . --from <base> --check
3. Apply with this project's vendored CLI:
   node .opencode/tools/base.mjs update . --from <base>
   If it refuses on locally modified files, list them and stop. Do not use --force
   without asking me.
4. Run: node .opencode/tools/base.mjs doctor .
   and: node .opencode/tools/base.mjs requirements .
5. Report: old -> new version, files changed, and every unbound or placeholder slot.
6. For each unbound slot, ask me which model to bind — ranked options with modality,
   price and lineage, plus "assign later". Do not bind a model without my answer.
   Probe the model you bound with `base probe <slot> .` and record the result.
7. If the update changed agents, commands or skills, tell me to restart the session.
   Delete the temp clone. Do not commit anything I have not seen.