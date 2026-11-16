# R1 actual production acceptance — failed and rolled back

The user approved this controlled release. R1 is **not complete** and must not be deployed again without resolving the failed acceptance gate and obtaining new approval. CW11/V62 remain open; no completed checklist item is reopened or moved.

## Release identity and preflight

- Git checkout: `54836edd7b766ce2e10b09a702e51d9fce42aa0e`, `cloudflare-compatibility-test`.
- Frozen application: source `2bf33d6f9bfc0a57aaa42b7346ebcce65422680a`, repairs through `600bd5d22811ddf17be9684b0cab2a86ed22d7ed`.
- Archive SHA256 `f6bf43437e726879c89cf1ef274d061d0e0736d2e918e8cd1410b92c426f9b54`; bundle fingerprint `d7714dc0cac2f05950a0eed9b7bd7a9aebd82893465c25635f4dbe8907f4f71b`, 424 files. Cloudflare verified both before uploading. No application recompilation.
- Existing namespace, KV, secret bindings, 350-request limit and compatible fallback verified. No new resource, migration, credentials or plan change.
- Existing Drive completion manifest `1Gl1quPVMBo5ELLFKBIAuQEOkHqqQRKZf` and three backup objects remain available. Manifest SHA256 `80765c6ba9187d4c5c0f639889a72c04ec9cbfa14fd55e1d28f49585afd31a6b`; all20,466 source records still matched the verified restore at preflight.
- Fresh dashboard-bound NFL/NHL quotes and the production NBA page shell passed preflight. **Preflight did not prove cold NBA ranking eligibility**; this is a gap to close before another attempt.

The first manual environment run stopped before upload because its shallow checkout lacked the source commit required by the ancestry check. Fetching Git history allowed the original check to pass; no ancestry/hash check was removed or weakened. The successful manual build was `5a8bf49a-4eae-4da9-8e11-fd47afcf01ae`. Temporary manual command changes were restored; the automatic-build exclusion remained unchanged throughout.

## Deployment and immediate fallback

Candidate deployment **`f2f5c908-4d8a-420a-918d-6a0e02e0b2b9`**, version `a8e46b4c-3f72-431b-9155-459bfb1f8704`, activated November16 at12:11:50.886PM Toronto (17:11:50.886UTC).

Actual production Chromium failed NBA Points acceptance: HTTP200 rankings response, but **zero rendered eligible cards** and an explicit no-complete-evidence notice. The acceptance runner did not substitute replay data, change the clock, ignore TLS errors or relax the assertion.

Fallback deployment **`a43f9bf6-bdb6-4e45-a5b0-7d1b2881cfcb`** activated at12:13:53.982PM Toronto, selecting existing version `a48c431a-5c3e-4491-8529-38cb20dfa898` at100%. The same SQLite/KV and old/new evidence were retained. No further candidate was attempted.

## Actual candidate observations

- NBA/NFL/NHL summary, slate, featured and Yesterday-history API reads returned200. Summary/slate counts agreed:13NBA,14NFL,13NHL for their returned scope. Incomplete coverage remains explicit; these are not assertions of a fully populated current-only slate. NBA summary1.619s, NFL0.819s, NHL0.787s. The earlier NBA summary503 did not recur in these observed requests.
- All17NFL tabs rendered their API displayable count. Five QB tabs:2each; receiving/receptions:15each; rushing/rush+receiving:6each; anytime/firstTD:25each; sacks:2; solo/combined tackles:9each; Q1passing/receiving/rushing:2/5/2. Most forecasts remain unavailable because official history is denied; sacks and some Q1 rows had fitted evidence. No missing EV was invented.
- NHL Shots25, Points25, Assists0, Goals0, Blocks0, Saves0. Zero-count notices were visible. Two NHL refreshes took1.101s/1.575s without disappearance. Saves had1verified quote but insufficient same-season/team appearances for that candidate;8other candidates lacked a quote. Goals/Assists/Blocks safeguards remain unchanged. Zero does not establish a repaired model or a provider-wide outage.
- No browser page/hydration errors occurred before the eligibility failure. All-seven NBA EV, mobile candidate, full featured-card qualification, warm-p95 and all-sport final-grade acceptance remain incomplete.

## Confirmed failure evidence and remaining diagnosis

Candidate request IDs `62e5d556d817cb1078b32ad56bb622ef` and `60470881daceba215b2b251e629f6554` logged HTTP403 at `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/:id/gamelog`. Their basketball audits reported102/106 requested players,102/106 gamelog failures and zero recovered observations. This is a real production source restriction, not the old unsupported-redirect exception or evidence of memory exhaustion.

After rollback, fallback API reads returned25 Points,25 Rebounds and25 PR rows with available EV. The fallback browser showed25NBA Points rankings and24NHL Shots rankings (five initially visible cards each); the fallback's known NFL Passing Yards visibility limitation remains (zero cards). Pages returned200 with no page/hydration errors. **Rollback restores the verified compatible fallback, not a claim that every outstanding repair now works.**

The exact reason the frozen candidate's cold/denied-history path lost eligibility while the fallback retained usable fitted evidence remains unresolved. Compare authenticated durable/cached history, source-refresh failure behavior and the exact compiled artifacts before changing providers or trying another release. Do not assume the403 alone explains that difference; do not weaken EV/history safeguards to force rows.

## Scheduled processing, resources and integrity

The real scheduled tick enqueued NFL anytimeTD/firstTD and NBA replay. Both NFL jobs advanced rank→originals→picks→publish→done despite ESPN403. Maximum observed phase budget36/220, max4 active sources; persistent cooldown/cache checkpoints were logged. Each job saved1new original receipt and0picks. NBA replay reached done. This is **partial scheduled acceptance**, not all38markets/all3grading sports. Critical rollback takes precedence over waiting for rotation completion; fallback holds capture/grading alarms and preserves their state.

No memory/CPU/subrequest-exhaustion or unsupported-redirect log matched the short candidate window. This does not replace full resource/soak acceptance. Featured-publication stacks were also observed; the compiled stack maps to the existing read-only history write guard. Publication acceptance remains open; do not enable generic shared-history writes to suppress the guard.

All pre-release11615history/6109originals/1473picks/1269grades retain exact ordered full-row fingerprints after rollback. Originals now6111; other counts unchanged. Both newNFL receipts precede kickoff; zero future quote timestamps. Zero duplicate original/pick/grade identities. No historical record was overwritten or removed.

CW08 retains deployment `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174`, version `46e95f99-98f2-4abe-a2b2-0ff24b4f8e4b`, */15 schedule. Health read:974receipts,871grades,211completed cycles,0pending uploads,0late anchors, no storage error. Its model/protocol/data were not changed.

## Next release gates

1. Isolate and repair cold NBA eligibility/history recovery using the same real403 conditions and exact retained fallback comparison, without fabricating probabilities.
2. Add a live preflight of eligible NBA ranking/EV evidence, not only the page shell or summary. Resolve featured-publication acceptance within the existing write boundary.
3. Freeze and rehearse the corrected artifact; obtain new approval. Then complete actual desktop/mobile all-market acceptance and the full capture/grading rotation, integrity and resource checks.

Prior832regression/19compiled checks remain historical frozen-rehearsal evidence, not a new production pass. This attempt changes documentation/evidence only; it does not rebuild or alter application/model code. No tracker row moves to100% completed.
