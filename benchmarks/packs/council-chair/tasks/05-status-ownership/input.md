# Seat proposals

**Shape.** Option A, the host owns status and passes one value to the page. The transport returns the raw word; the host stores it once.

**Experience.** Option A. One value means no flicker between a transport word and a host word, and the page renders exactly what the host received.

**Risk.** Option B, the transport owns status, because it is closest to the runtime and cannot drift from it. The host must not invent a fallback word.

**Chair.** Option A. The host already owns the session; status is one more field on that record.

**Dissent.** Risk wants the transport to stay authoritative. Shape warns that keeping a copy in both places is the defect to avoid.