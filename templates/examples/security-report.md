# Security lens — session check

**Verdict:** CONCERNS
**Slice:** `a1b2c3d..d4e5f6a`, `src/auth/session.js` and its test
**Tests:** `npm test` — pass (42 tests)

## Secrets / exposure

None in the diff. No credential, token or personal data; the error path does not
echo the session object.

## Findings

1. **Major — `src/auth/session.js:7`** — `user.role = "admin"` assigns instead of
   compares, so every authenticated user passes the admin branch. Exploit: a
   member calls `DELETE /users/:id` for another user. Fix: `===`, plus a negative
   test.
2. **Minor — `src/auth/session.js:4`** — the function trusts `session.user`
   without checking that the session is active. Fix: reject a revoked session
   before the role check.

## Routing

- Finding 1 → `task-orchestrator` (fix and add the negative test).
- Finding 2 → `plan-architect` (decide whether revocation belongs in this slice).

## Confidence

High for finding 1; medium for finding 2 until the session lifecycle is read.

## Not checked

- The session store and its revocation path (outside the brief).
- Dependency versions (no lockfile change in the diff).