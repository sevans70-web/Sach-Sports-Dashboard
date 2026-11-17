# Approved corrected R1 — failed live acceptance, rolled back

**R1 is not complete. No further deployment attempted.** The user approved artifact `R1-2026-11-17-e65304c-832d9ab3` from package commit `026c057`. Cloudflare's authenticated manual environment verified archive SHA256 `62fd7f9543cf1a54be9a8ba7e0cb3c5bebbf899f5b9e35e5813ad9593a3fa8a0` and424-file fingerprint `832d9ab38287f57ca12d3caa7297249324c6fbe8c770fb8612022ad9620720e4` before uploading. No recompilation, model/credential/binding change or paid resource was introduced.

## Deployment and rollback

Candidate deployment **`b672510a-7112-4cfc-a207-f71dbcb1e174`**, version `59deb144-942b-450a-a380-c865789a2e88`, activated November17 at10:31:07.568AM Toronto. Manual build `1167a4c9-56a3-47fc-9f49-b0ba5bc4df5a` completed successfully. Original manual commands were restored; the automatic-build exclusion remained unchanged throughout.

Actual production Chromium, with normal clock/TLS verification and no replay, showed **zero NBA Points cards**. The API returned200 with54verified Points quotes and52verified Rebounds quotes, but0fitted forecasts and0public rankings in both markets. Same-candidate official refresh audits reported54/54 and52/52 failed gamelogs, zero observations. This fails the approved eligibility acceptance requirement even though the requests returned200.

Immediate rollback deployment **`4699c3c4-5067-4347-b3b7-9d205fee5085`** activated at10:32:32.710AM Toronto, selecting the verified fallback version `a48c431a-5c3e-4491-8529-38cb20dfa898` at100%. SQLite/KV and every record remained in place. No further candidate upload occurred.

## Verified and incomplete checks

- Candidate NBA/NFL/NHL summary, slate, featured and history API reads returned200. NBA summary1.762s. This is endpoint availability, not full featured-pick qualification or market/browser acceptance.
- Actual candidate NBA browser acceptance failed at Points; the other six NBA tabs, all17NFL tabs, NHL market browser acceptance, mobile candidate acceptance and full resource/latency soak remain **unverified**. Browser page/hydration error arrays were empty before the failed card assertion.
- Rollback browser: NBA Points header25rankings; NHL Shots header25rankings; five cards initially visible for each. Pages returned200 and no page/hydration errors. The fallback retains its known NFL visibility limitation: Passing Yards showed0cards. Rollback is not a claim that all pending dashboard repairs work.
- The required38-market capture and all-sport grading rotations were not completed. Immediate critical rollback takes precedence over waiting; fallback holds dashboard capture/grading while preserving pending state. Do not label a short observation or API200 as scheduled acceptance.
- Follow-up resource/job telemetry query was refused withHTTP403 by Cloudflare despite the integration advertising the accepted observability scope. Earlier source audits were retrieved successfully. No repeated blocked queries, permission bypass or speculative resource pass. Complete memory/subrequest/error acceptance remains open.

## Record and research protection

All **20,468** records retain identical ordered full-row fingerprints before/after:11615history documents,6111original receipts,1473saved picks,1269grades. This includes all20,466originally protected records plus the two previously preserved receipts. No data restore, deletion, historical rewrite or new fabricated pick/grade occurred. The existing verified20,466-record backup remains available and was not replaced.

CW08 keeps deployment `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174`, model `007c02b`. Health:1448receipts,960grades,300cycles,0pending uploads, no storage error. Its code, schedule, model, protocol and storage were not modified. Automatic dashboard builds remain paused.

## Remaining blocker

The per-athlete cooldown fix and the local0/9/9 comparison are retained, but **did not establish production equivalence**. Production now confirms every requested NBA history failed and the candidate had no usable recovered evidence, while the fallback again renders25Points rankings. The exact reason for that remaining production transport/history/cache difference is unresolved. Do not claim the earlier local tests repaired the complete live problem or blindly retry the package. A faithful comparison of the actual production connection and retained-evidence path is required before another release; do not fabricate forecasts or change access controls to fill rankings.

Tracker CW11/R1 remains blocked and V62's prior history is preserved. No row moves to100% completed. This attempt changes release status and evidence only.
