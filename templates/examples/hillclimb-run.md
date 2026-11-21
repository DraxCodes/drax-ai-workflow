# Hillclimb — Settings page density

**Rubric:** perception
**Target:** 8
**Floor:** `npm run build`, `npm test`, `npm run lint`
**Run:** `2026-11-21T10:14:00Z` · base `0.7.0` · `a1b2c3d`

## Baseline

Score **5/10 — usable but crowded**. Three flaws, in order:

1. The save action sits below the fold at 375 px.
2. The destructive reset is the same weight as save.
3. The section headings do not survive a dark theme.

## Evidence

- Shots: 375/900 px, light/dark, from the seam's seed and capture.
- Read-through: first-run and keyboard-only.
- Blindspot: `findings.glm.json` + `merged.json`, one reviewer-only finding accepted.

## Iterations

| # | Change | Score | Verdict | Evidence |
| --- | --- | --- | --- | --- |
| 1 | Sticky save bar | 6 | KEEP | shots/375-light.png |
| 2 | Reset moved to a menu | 7 | KEEP | shots/375-dark.png |
| 3 | Heading contrast token | 8 | SHIP | shots/900-dark.png |

## Final

**SHIP 8/10.** The save action is reachable at 375 px, reset is no longer adjacent
to save, and the headings meet contrast in both themes. The next level (9) would
need a density pass on the advanced section, which is out of scope.

**Ledger:** `base run finish <id> --status passed --verdict SHIP --score 8`.