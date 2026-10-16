#!/bin/sh
set -eu
npm run build
cp -r public .next/standalone/
mkdir -p .next/standalone/.next .next/standalone/scripts
cp -r .next/static .next/standalone/.next/static
cp scripts/backup-to-drive.mjs .next/standalone/scripts/backup-to-drive.mjs
cp scripts/launch-backup-safe.sh .next/standalone/launch-backup-safe.sh
test -f .next/standalone/server.js
test -f .next/standalone/scripts/backup-to-drive.mjs
test -f .next/standalone/launch-backup-safe.sh
echo "BACKUP_PACKAGE_OK: launcher and Google Drive backup script bundled"
