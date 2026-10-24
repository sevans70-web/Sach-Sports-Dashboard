#!/bin/sh
set -eu
if [ -f server.js ]; then
  exec node scripts/recover-and-start.mjs
elif [ -f .next/standalone/server.js ]; then
  cd .next/standalone
  exec node scripts/recover-and-start.mjs
else
  echo "FATAL: dashboard server.js not found" >&2
  exit 1
fi
