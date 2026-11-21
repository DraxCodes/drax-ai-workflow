Set up this folder with Drax AI Workflow, then start the project.

1. Clone https://github.com/DraxCodes/drax-ai-workflow into a temp dir
   (or use $env:WORKFLOW_BASE when it is set); call that path <base>.
2. Run:
   node <base>/tools/base.mjs new . --project <name> --preset checks-web --config
   (use --preset checks-none with --build/--test/--surface for a non-web stack)
3. Optional engineering skills:
   node .opencode/tools/base.mjs pack install engineering .
4. Run: node .opencode/tools/base.mjs requirements .
   If a slot is unbound or still a placeholder, ask me which model to bind — ranked
   options with modality, price and lineage, plus "assign later". Do not bind one
   without my answer. Probe the model you bound with `base probe <slot> .`.
5. If this folder is not a git repo, run git init, add the stack's .gitignore
   (include .scratch/ for local specs and benchmark runs) and commit the baseline.
   Delete the temp clone.
6. Do not write app code yet. Tell me to restart the session so the new agents,
   skills and commands load, then run /start-project <my idea>.