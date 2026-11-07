#!/bin/sh
# Ensure named volume /data is writable by the non-root node user, then drop privileges.
set -eu
mkdir -p /data/cache /data/management
if [ "$(id -u)" = "0" ]; then
  chown -R node:node /data || true
  exec su-exec node node src/index.js
fi
exec node src/index.js
