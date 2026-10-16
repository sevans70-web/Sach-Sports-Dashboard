#!/bin/sh
# Keep the dashboard as the foreground process; report backup errors separately.
if [ -f server.js ]; then
  SERVER=server.js
  BACKUP=scripts/backup-to-drive.mjs
elif [ -f .next/standalone/server.js ]; then
  SERVER=.next/standalone/server.js
  BACKUP=.next/standalone/scripts/backup-to-drive.mjs
else
  echo "FATAL: dashboard server.js not found" >&2
  exit 1
fi
(
  sleep 90
  if [ -f "$BACKUP" ]; then
    echo "BACKUP_START"
    node "$BACKUP"
    echo "BACKUP_EXIT_CODE=$?"
  else
    echo "BACKUP_FAILED: packaged script missing at $BACKUP" >&2
  fi
) &
exec node "$SERVER"
