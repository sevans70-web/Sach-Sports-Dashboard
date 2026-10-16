#!/bin/sh
# Keep the dashboard in the foreground and isolate backup failures.
(
  sleep 90
  echo "BACKUP_START"
  node .next/standalone/scripts/backup-to-drive.mjs
  echo "BACKUP_EXIT_CODE=$?"
) &
exec node .next/standalone/server.js
