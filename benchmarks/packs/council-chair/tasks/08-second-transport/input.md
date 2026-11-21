# Seat proposals

**Shape.** Option C, no live updates in this rung. The existing poll is enough for the current tick, and a second transport is a new subsystem.

**Experience.** Option B, poll the existing transport more often. Freshness improves without a second path.

**Risk.** Option A, a second transport, because a dedicated stream would avoid the poll cost. Risk also warns that a second process doubles the surface and the failure modes.

**Chair.** Option B. Poll the existing transport; do not add a second path.

**Dissent.** Shape wants no live updates at all. Risk is tempted by the stream but names its cost. Experience wants lower latency.