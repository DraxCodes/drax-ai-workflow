# User API

`server.js` is an Express user API behind a load balancer. The gateway authenticates
the caller and authorizes the requested user id before the request reaches this
service. Every request carries an `Authorization` header and an `x-request-id`.
Logs go to a shared observability platform that many engineers can query.

The slice is self-contained; `db` and `logger` are trusted modules. The user record
includes credential fields.

Review the slice for security defects a reviewer should block or flag before
release. Report only findings you can support from the code.