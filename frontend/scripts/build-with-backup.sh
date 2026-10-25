#!/bin/sh
set -eu
npm run build
cp -r public .next/standalone/
mkdir -p .next/standalone/.next .next/standalone/scripts
cp -r .next/static .next/standalone/.next/static
cp scripts/drive-auth.mjs scripts/backup-to-drive.mjs scripts/history-cloud.mjs scripts/retention-policy.mjs scripts/retention-cleanup.mjs scripts/recover-and-start.mjs scripts/storage-inventory.mjs .next/standalone/scripts/
cp scripts/launch-backup-safe.sh .next/standalone/launch-backup-safe.sh
test -f .next/standalone/server.js
test -f .next/standalone/scripts/backup-to-drive.mjs
test -f .next/standalone/launch-backup-safe.sh
echo "BACKUP_PACKAGE_OK: launcher and Google Drive backup script bundled"
