# Account service

`app.py` is a small Flask account service. `/register` stores a password digest and
`/reset` creates a reset token. `/compare` demonstrates the token comparison used
by another endpoint.

The slice is self-contained. `secrets` and `hashlib` are the standard library.

Review the slice for security defects a reviewer should block or flag before
release. Report only findings you can support from the code.