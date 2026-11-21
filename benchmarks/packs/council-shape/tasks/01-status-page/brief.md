# Shape brief — project status page

**Question.** What is the smallest viable shape for a public status page per project?

**Fixed point.** The site already has one page renderer, one read route and one data module. Deployment is Docker Compose behind a proxy; the app does not handle TLS.

## Constraints (cannot move)

- No new dependency; one data path; no client-side fetch loop.
- The page must render from the same renderer as the rest of the site.
- Read-only; no auth; no analytics.

## Non-goals

Live updates, comments, per-project auth, a second data store.

## Seams

route -> data read -> renderer -> HTML.