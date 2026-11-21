# Seat proposals

**Shape.** Option C, no endpoint. The admin page can read the same data module in-process; an endpoint adds a public surface for no user benefit.

**Experience.** Option A, a public read-only endpoint. It is simple and the data is not secret.

**Risk.** Option B, an authenticated endpoint. Metadata still reveals paths and stack names, so a public endpoint widens the exposure. Auth is a new subsystem, so risk would accept C.

**Chair.** Option B, or C if auth is out of scope.

**Dissent.** Risk rejects the public endpoint. Shape prefers no endpoint. Experience wants the simple read-only path.