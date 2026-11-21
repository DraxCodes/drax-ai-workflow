# Invoice API

`server.js` is an Express API for a multi-tenant invoicing product. Every request
passes through `requireUser`, which sets `req.user` to the authenticated account.
Invoices belong to a tenant, and a user may only see invoices for their own tenant.

The slice is self-contained: the data access is mocked in `./db.js`, and the
authentication middleware is trusted.

Review the slice for security defects a reviewer should block or flag before
release. Report only findings you can support from the code.