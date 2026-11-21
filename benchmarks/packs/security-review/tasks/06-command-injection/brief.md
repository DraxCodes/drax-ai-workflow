# Image converter

`app.py` is a small Flask service for an internal media library. `/convert` accepts
an uploaded image and returns a JPEG. `/inspect` returns whether ImageMagick can
identify the upload.

The service runs as an unprivileged user with access to the upload directory. The
slice is self-contained.

Review the slice for security defects a reviewer should block or flag before
release. Report only findings you can support from the code.