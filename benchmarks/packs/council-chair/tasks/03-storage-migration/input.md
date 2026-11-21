# Seat proposals

**Shape.** Option C, an adapter layer over the existing store, with the chunked backend behind it. The adapter isolates the format and can serve both shapes.

**Experience.** Option A, dual-write/dual-read, because a thread must never render blank during migration.

**Risk.** Option A, with a single migration flag and a one-step rollback. Option B, a big-bang rewrite, cannot be rolled back and risks data loss.

**Chair.** Option A. Keep the flag until every thread is read through the chunked path.

**Dissent.** Risk insists on a one-step rollback. Experience insists on no blank transcript. Shape prefers the adapter because it avoids a second source of truth.