#!/bin/sh
# Starts as root only long enough to give the data folder to PUID:PGID
# (Unraid convention: 99:100 = nobody:users), then drops privileges.
set -e
PUID="${PUID:-99}"
PGID="${PGID:-100}"
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown -R "$PUID:$PGID" "$DATA_DIR" || echo "[entrypoint] warning: could not chown $DATA_DIR"
  export HOME=/tmp
  exec su-exec "$PUID:$PGID" "$@"
fi
exec "$@"
