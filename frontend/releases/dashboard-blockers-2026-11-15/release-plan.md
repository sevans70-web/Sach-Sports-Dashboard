# Controlled dashboard release — approval required

Candidate identity is pinned in manifest.json. Do not reuse either withdrawn candidate. The preparation command checks the frozen archive and canonical bundle digest and has no upload mode.

## Approved scope to request

Upload and manually activate only the new frozen candidate for `sach-sports-cloudflare-test`, built from source commit `1167c46f5d77d73429d681be232c0bebdfa509ed`. Preserve existing dashboard KV, credentials, schedules and SQLite Durable Object namespace `fc70a55e49c84d28bacc562a8d5cfb62`. There are no new namespaces, migrations, hosting changes or model replacements. Keep the Cloudflare automatic-build branch filter paused. Do not upload or modify `sach-cw08-nhl-shadow`.

User approval of earlier releases does not authorize this artifact. Request fresh approval after preparing and checking it.

## Before upload

1. Confirm remote branch and source ancestry, the exact archive SHA-256 and bundle digest, production configuration and all test results. Run `node scripts/prepare-dashboard-retry-release.mjs --dry-run --blockers` from frontend. No rebuild is required during activation.
2. Read back the current deployment and available compatible fallback version `a48c431a-5c3e-4491-8529-38cb20dfa898`. Current fallback deployment is `6e6fab80-41c8-433c-bcf9-79a2e4dd5aee`. Verify its archived digest using the existing fallback preparation/check script in a separate temporary output; do not replace the candidate output while deploying it.
3. Verify existing namespace, SQLite export and KV identities, no migrations, unchanged paused dashboard build filter, unchanged research deployment and */15 research schedule. Read-only CW08 health must be ready; receipt counts cannot decrease. Stop on any unexpected release check.

## Activate and verify

Use the existing authorized Cloudflare account/manual environment to upload the frozen prebuilt dashboard artifact. Do not request, copy or expose tokens. Record new version and deployment IDs. Do not change any resources or bindings outside the pinned dashboard configuration.

- Perform actual browser and API checks across all 17 NFL tabs. Cold capture must reach source collection rather than only returning retained KV boards. If optional official history is denied, record the denial/cooldown and complete legitimate quote-only capture without invented forecasts or picks. Existing original forecasts remain protected.
- Check all seven NBA markets, including repeated cold and concurrent PR/PRA requests and a failed refresh. Require no memory-limit failures, repeated stalls or hydration errors. Check signed positive/negative/zero EV where valid evidence exists, and explicit unavailable/stale explanations otherwise. Never force any count or fabricate a display fixture in production.
- Check NHL Shots, Points, Assists and Saves, original started-game predictions and historical selections. A clearly explained existing model-validation hold is not a missing feed. Verify real eligible counts against the API at the same decision time, rather than hardcoding replay counts.
- Observe live scheduled processing: NBA, NFL and NHL lanes must independently advance phase/cursor, checkpoint completed inputs or finish capture. Verify one cold NFL rank-to-originals-to-done path, no retry-starvation, no 350-subrequest-limit failures, no overwritten/duplicate evidence and normal grading. Three repeating nonprogress attempts or unchecked write/readback failures fail the gate.
- Check featured cards, saved history, schedule/game/pick counts, browser errors and request latency. Read back CW08 health, unchanged deployment/schedule and nondecreasing evidence counts. Verify dashboard automatic builds remain paused.

## Rollback / completion

Immediately activate verified compatible fallback version `a48c431a-5c3e-4491-8529-38cb20dfa898` on any critical live failure; stop and report before further changes. Preserve all existing/new predictions, grades, quote receipts, source cache/checkpoints and SQLite namespace. Fallback holds dashboard jobs; do not delete queues, reservations or evidence. Never modify CW08 to roll back the dashboard.

Commit and push deployment and live verification evidence afterward. Completion remains conditional on all live gates. ESPN access itself is not guaranteed: denied histories must remain unavailable until legitimately accessible, with no host-swapping or access-control bypass. Do not mark a row complete solely from replay or unit-test results.
