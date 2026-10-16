#!/bin/sh
# Start dashboard immediately, then attempt a one-time streaming backup.
(sleep 45; node .next/standalone/backup-to-drive.mjs >> /dev/stdout 2>&1) &
exec node .next/standalone/server.js
