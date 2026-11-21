# Diagnostic-only approval request — not an R1 release

Status: **prepared offline; NOT authorized or deployed**. The user requires separate approval for any production upload. Current fallback cannot serve the complete seven-market sample. No public preview, credential transfer or additional infrastructure is needed.

- Exact artifact: `NBA-ODDS-DIAG-2026-11-21-cae200070535`.
- Full inventory/config SHA-256: `cae200070535f2b0286266964dc29a6b6610a2ec08b77aef3426a2b33c3acc20`.
- Delta archive SHA-256: `bc8c69baddce01bac2c5c3988c05149d1a8b7b5150f458f394f6780187dfc899` (7,770 bytes).
- Worker: `sach-sports-cloudflare-test` in the existing account.
- Compatible rollback version: `a48c431a-5c3e-4491-8529-38cb20dfa898`; current deployment observed `b1ef6404-fd00-4312-857c-c50013bb64a2`.

## What approval would permit

One controlled manual upload of these two frozen modules over the exact verified fallback: its fetch wrapper and the new bounded diagnostic module. The other 749 raw files, assets, Worker configuration, bindings, limits, queue class and held schedules remain unchanged. This excludes all pending R1/UI/model changes. The endpoint uses only the existing OWL binding and fixed NBA provider URL. It performs no database writes, imports or migrations and has no access to CW08 tables.

Only GET `/api/market-coverage?sport=nba&mode=feed-sample` is intercepted. `market` is one of `points,rebounds,assists,threes_made,pts_rebs_asts,pts_rebs,pts_asts`; `limit` is 1–25 per returned book. Bounds: 30 fixtures, 12 books per fixture; truncation is explicit. Existing provider caching coalesces reads for one minute. Original source IDs, periods, timestamps, lines and prices are exposed only if actually supplied; missing evidence is counted. No roster ID mapping or forecasting is inferred. Errors are sanitized; responses are no-store. Ordinary dashboard requests are delegated to the original fallback.

## Before an approved upload

1. Reconfirm active version/deployment above, build filter `__cw08_manual_release_only__`, original bindings/config and unchanged CW08 version. Stop on unexpected changes.
2. Restore the exact frozen output locally with `node scripts/prepare-nba-odds-diagnostic.mjs --prepare-frozen NEW_OUTPUT`. This verifies the original fallback archive, delta checksum, paths and complete inventory digest without compiling or deploying.
3. Confirm the existing rollback version remains selectable and existing backups remain available. The previously documented backup covers 20,466 of 20,468 protected records; this diagnostic does not repair that two-receipt gap or change records. If a new protected inventory check is required, use only the previously authorized scoped read-only procedure.
4. Use the existing authenticated Cloudflare manual prebuilt deployment environment; never transfer secrets, enable public previews, unpause automatic builds or upload R1. Keep/restore its manual build command configuration as prescribed by the existing controlled-release procedure. Stop if existing permissions do not support the exact frozen upload.

## Live acceptance and rollback

1. Record deployment/version IDs and timestamps. Check ordinary NBA/NFL/NHL dashboard/API availability against the pre-upload baseline, plus actual desktop/mobile browser errors. This is diagnostic acceptance, not R1 acceptance.
2. Make one bounded read per supported market (`limit=25`) using the existing Worker. Preserve raw sanitized responses and hashes, response status, duration, fixture/time/book/ID/period/price completeness and explicit truncation. Do not repeatedly retry blocked provider requests.
3. Independently join current official roster/game identities and current quotes before claiming eligible current predictions or EV. A source success alone does not establish model input sufficiency. Missing IDs, stale quotes, partial coverage and legitimate forecast holds remain blockers, not invented values.
4. Confirm automatic builds, held dashboard schedules and CW08 remain unchanged. Do not invoke historical-data write APIs or capture jobs.
5. On any critical availability, security, unintended write or compatibility failure, immediately restore `a48c431a-5c3e-4491-8529-38cb20dfa898` at 100%, verify original requests and record the failure. No database rollback is needed because the diagnostic writes none.

The prepared code passes local compiled workerd seven-market readback and wrapper delegation/held-schedule contracts; this is not a live provider or production acceptance pass. After successful authorized activation, current quote/identity evidence and full candidate validation are still required before requesting a separate R1 release.
