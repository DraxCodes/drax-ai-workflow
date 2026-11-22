# Optional self-contained image. The compose file bind-mounts ./public instead,
# so an update is `node site/build.mjs` with no image rebuild.
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY public /usr/share/nginx/html