# Council — Import a CSV or paste it?

**Status:** recommendation, awaiting the user's choice
**Fixed point:** `v1.4.0`, `src/import/`

## Brief

A first-time user has a 5,000-row CSV. Should the import run in the browser, in a
worker, or on the server? The trade-off is privacy and immediate feedback against
operational cost and large-file limits.

- Must work offline for a local-only project.
- Must not upload the file by default.
- Must fail visibly on a malformed row.

## Seats

- **Shape** — browser parse is the smallest reversible step; it needs a worker for
  files over ~2 MB. Server import adds an upload endpoint and a retention decision.
- **Experience** — the felt read is "I can see the first rows before I commit". A
  server round-trip loses that unless it previews locally first.
- **Risk** — a browser parser is untrusted input in the user's tab; it needs a
  size cap, a row cap and a clear error. A server import needs auth, a virus scan
  and a deletion policy.

## Recommendation

Start with browser preview plus a worker; keep the server path out until a file is
too large to parse locally. **Dissent:** the shape seat would accept a server-only
import if the product is already cloud-only. The risk seat agrees only with an
explicit retention policy.

## Questions only the user can answer

1. Is a 5,000-row file the common case, or a 50,000-row one?
2. May a file leave the machine at all?
3. Is a failed import recoverable by re-uploading, or must it resume?