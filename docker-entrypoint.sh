#!/bin/sh
set -e
# Fix ownership of the data volume, then drop privileges to PUID:PGID.
if [ "$(id -u)" = "0" ]; then
  chown -R "${PUID:-99}:${PGID:-100}" /data 2>/dev/null || true
  exec su-exec "${PUID:-99}:${PGID:-100}" "$@"
fi
exec "$@"
