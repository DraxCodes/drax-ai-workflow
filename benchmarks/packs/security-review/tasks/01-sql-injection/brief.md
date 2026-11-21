# Inventory search

`server.js` is a public Express service for a small inventory database. `/items`
and `/search` are reachable from the internet. `/users` is reachable only through
the internal admin gateway, which forwards JSON bodies unchanged.

The database is SQLite. The slice is self-contained: all relevant code is in the
file.

Review the slice for security defects a reviewer should block or flag before
release. Report only findings you can support from the code.