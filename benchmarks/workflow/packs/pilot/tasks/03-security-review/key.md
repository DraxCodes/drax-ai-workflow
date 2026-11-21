# Key — 03 session check

## Expected finding

`session.js` uses assignment instead of comparison:

```js
if (user.role = "admin") return true;
```

That assigns `"admin"` to `user.role` and evaluates truthy for every user, so any
authenticated user is treated as an admin. It is a privilege-escalation bypass.

The fix is `user.role === "admin"`, with a test that a non-admin is rejected and a
test that an admin is accepted. A reviewer should also note that the function
returns `true` for any role that happens to be truthy if the comparison is fixed
incorrectly (for example `user.role` alone).

## Secondary observations

- The function trusts `session.user` without checking that the session is active.
- There is no negative test for a missing role.
- The test suite never exercises a non-admin, which is why the bug shipped.

These are real but lower severity; a review that only lists them and misses the
assignment is below 8.

## Scoring anchors

- **4 correctness** — names the assignment, explains the bypass, gives the fix, and
  requires a negative test.
- **3** — names the assignment and fix but not the exploit or the missing test.
- **2** — says "use ===" without locating it, or only lists generic concerns.
- **0–1** — says the code is safe, or rewrites the module.

## Common wrong turns

- Reporting "missing input validation" without reading the condition.
- Treating `user.role = "admin"` as a typo with no security impact.
- Editing the file instead of reporting the finding.