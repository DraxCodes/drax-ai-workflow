# Decision records

| ADR | Status | Decision |
| --- | --- | --- |
| [0001](0001-vendored-base.md) | accepted | Vendor the workflow base into each project. |
| [0002](0002-copilot-bridge.md) | superseded by 0004 | Generate a `.github/` bridge for VS Code Copilot Chat. |
| [0003](0003-named-rubrics.md) | accepted | Use one named rubric per hillclimb run. |
| [0004](0004-opencode-only.md) | accepted | Target OpenCode only. |
| [0005](0005-data-layering.md) | accepted | Git text is the source of truth; JSONL is evidence; SQLite is only a rebuildable index. |

Status is one of `proposed`, `accepted`, `superseded` (name the successor),
`deprecated` or `rejected`. The numbered filename is `NNNN-slug.md`.