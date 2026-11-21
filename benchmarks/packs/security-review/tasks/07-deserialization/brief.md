# Session import

`app.py` is a Flask service that imports state from another internal tool. The
`/import/*` endpoints accept a request body from a trusted operator UI, but the
body is user-controlled and may be replayed by an attacker who reaches the service.

The slice is self-contained: all parsing happens in this file.

Review the slice for security defects a reviewer should block or flag before
release. Report only findings you can support from the code.