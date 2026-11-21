# Image proxy

`server.js` is an Express image proxy. `/proxy` accepts a URL from a signed-in user
and returns the response body. `/avatar/:id` serves a fixed CDN avatar.

The service runs in a private subnet that can reach the internal network and the
cloud metadata endpoint. The slice is self-contained.

Review the slice for security defects a reviewer should block or flag before
release. Report only findings you can support from the code.