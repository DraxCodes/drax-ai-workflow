# Attachment browser

`server.js` is an Express service used by authenticated staff. `/files/:name`
serves attachments from the upload directory. `/public/:name` serves a fixed set of
brand assets and is also reachable without a session.

The upload directory is on the same volume as the application. The slice is
self-contained.

Review the slice for security defects a reviewer should block or flag before
release. Report only findings you can support from the code.