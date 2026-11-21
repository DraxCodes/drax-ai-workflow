# Key — 02 signup spec

## Expected gaps

A strong review catches at least these, in roughly this order:

1. **Duplicate email** — the spec never says what happens when the address already
   exists. Is it rejected, merged, or allowed with a verification flow? This is a
   failure path, not an edge case.
2. **Password policy** — no minimum, no breach check, no reset path. The data
   lifecycle (store, rotate, delete) is undecided.
3. **Verification expiry** — the email link has no lifetime, resend rule or
   invalidation after a password change.
4. **Rate limiting / abuse** — no limit on signups or verification emails, so the
   endpoint is a spam vector.
5. **Permissions and roles** — the spec creates an account but never says who can
   invite, disable or delete one.
6. **Observability** — no event for signup success/failure or verification, so the
   team cannot answer "how many users are stuck?"
7. **Data retention / deletion** — no account deletion or data export path.
8. **Non-goals** — the spec does not say whether SSO, social login or invitations
   are out of scope.

A review that lists only "add validation" or "consider security" is below 8: it
names a category, not an obligation.

## Scoring anchors

- **4 correctness** — at least five of the eight gaps, each with a concrete decision.
- **3** — three or four gaps, or the right gaps without a decision.
- **2** — one or two gaps, or a generic security/validation checklist.
- **0–1** — rewrites the spec, or misses duplicate email entirely.

## Common wrong turns

- Treating the spec's happy path as the whole feature.
- Asking for a full design document instead of naming the undecided obligations.
- Listing "error handling" without the specific error.