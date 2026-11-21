# Council brief — local transcript search

**Question.** Should transcript search be local, and in which shape?

**Fixed point.** Transcripts are read thread by thread. Search is optional and must not slow the normal read.

## Constraints (cannot move)

- No new dependency, no second store, bounded memory.
- The index is a cache, not a source of truth.
- A result must show the matched line, not just the thread title.

## Non-goals

Cross-folder search, fuzzy matching, a server-side index.

## Trade-offs to settle

In-memory index vs an on-disk index vs an external service; build lazily vs on every tick.