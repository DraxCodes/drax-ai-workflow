# Admin authentication

`auth.js` is the authentication module for an internal admin API. `authenticate` is
the only gate in front of `/admin`; partner services call `/keys` with an API key.
Tokens are issued by the same service with `JWT_SECRET`.

The slice is self-contained. `jsonwebtoken` is the standard library; the helper
functions in it behave as documented.

Review the slice for security defects a reviewer should block or flag before
release. Report only findings you can support from the code.