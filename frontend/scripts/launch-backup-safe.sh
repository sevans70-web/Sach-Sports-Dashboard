#!/bin/sh
# The dashboard is the foreground process; backup failures must not stop it.
# Use repository source paths, not .next/standalone paths that may be absent.
(
  sleep 90
  echo "BACKUP_START: starting Railway volume upload"
  node /app/scripts/backup-to-drive.mjs
  code=$?
  echo "BACKUP_EXIT_CODE=$code"
) &
exec node /app/.next/standalone/server.js
