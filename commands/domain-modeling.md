---
description: Record a domain term or decision in the glossary or an ADR
agent: task-orchestrator
argument-hint: "[term or decision to settle]"
---

Follow the `domain-modeling` skill for the term or decision below.

Input: $ARGUMENTS

1. Read the seam and the domain docs it names (glossary, `GLOSSARY-MAP.md` if
   present, relevant ADRs).
2. Decide which artifact the input belongs in:
   - a domain term → the glossary;
   - a decision that will outlive the task → a new or updated ADR;
   - a requirement → the spec;
   - a tool or environment fact → `docs/notes`;
   - exploration or a current thread → no artifact.
3. If it is a term, add one entry with a definition and the synonyms the project
   avoids. If it is a decision, use `templates/docs/adr.md`, number it after the
   highest existing ADR, and set a valid `Status:`.
4. If it contradicts an existing ADR, say so and link both; do not silently
   override.
5. Do not implement the decision in this step. Report the path and the change.