# Shape brief — settings page

**Question.** What is the smallest viable shape for a settings page for the site title and accent colour?

**Fixed point.** The site has one page renderer, one config file and one admin page.

## Constraints (cannot move)

- Reuse the existing renderer and config file.
- No database, no settings service, no new dependency.
- One admin; no per-user settings.

## Non-goals

Multi-user settings, themes beyond the accent, a settings API.

## Seams

admin render -> config read/write -> page render.