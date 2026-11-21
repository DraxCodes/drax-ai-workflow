# Ops service

`server.js` is an Express operations service. `/health` is public; `/debug/env`
and `/debug/config` are reachable from the public ingress in staging because the
platform team uses them during incidents. The service runs with the production
environment, including database and storage credentials.

The slice is self-contained.

Review the slice for security defects a reviewer should block or flag before
release. Report only findings you can support from the code.