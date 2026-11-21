# Seat proposals

**Shape.** Option A, an in-memory map keyed by folder and thread, invalidated by the change tick and bounded to the last N folders. No new store.

**Experience.** Option A. A cached row must not flash a stale status; if the tick cannot confirm, show the row as stale.

**Risk.** Option B, a JSON file under `.scratch`, because a restart should not lose the cache. Option A must bound memory and never serve a stale row silently.

**Chair.** Option A. The cache is an optimisation; persistence is a separate decision.

**Dissent.** Risk wants persistence across restarts. Experience wants a visible stale read. Shape warns that a second store is a defect.