#!/bin/sh
# Keep the dashboard as foreground process; backup failures do not stop it.
(
  sleep 90
  echo "BACKUP_START: starting Railway volume upload"
  node scripts/backup-to-drive.mjs
  code=$?
  echo "BACKUP_EXIT_CODE=$code"
) &
exec node .next/standalone/server.js
