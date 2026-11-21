# Council brief — an admin metadata endpoint

**Question.** Should a new admin endpoint expose project metadata, and with what posture?

**Fixed point.** The site is local-only behind a proxy. There is no user auth in v1. Project metadata includes paths, stack names and status, but no secrets.

## Constraints (cannot move)

- Local-only posture; no new auth system in this rung.
- No secrets, tokens or environment values in the response.
- One data path; no second store.

## Non-goals

Multi-user auth, a public API, write operations.

## Trade-offs to settle

A public read-only endpoint vs an authenticated endpoint vs no endpoint; convenience vs exposure.