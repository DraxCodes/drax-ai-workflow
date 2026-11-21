# Shape brief — test-results table

**Question.** What is the smallest viable shape for a table of test results on a project page?

**Fixed point.** The project page already has a table style and one data module. The view must work at 375 and 900.

## Constraints (cannot move)

- Reuse the existing table styles; no grid dependency.
- One data path; no new dependency.
- The page must not scroll horizontally at 375.

## Non-goals

Sorting, filtering, export, a chart.

## Seams

data read -> table render -> page.