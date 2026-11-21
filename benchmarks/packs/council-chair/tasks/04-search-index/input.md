# Seat proposals

**Shape.** Option A, an in-memory index built lazily per folder and bounded to the last N threads. No new store.

**Experience.** Option A. A result must show the matched line; a stale index must not hide a new match.

**Risk.** Option B, an on-disk index under `.scratch`, because rebuilding after a restart is expensive. It can leak transcript content, so it needs a clear local-only note. Option A must bound memory.

**Chair.** Option A. Search is an optimisation over the reads the pane already does.

**Dissent.** Risk wants persistence across restarts. Experience wants stale results to be visible. Shape warns that an on-disk index is a second store.