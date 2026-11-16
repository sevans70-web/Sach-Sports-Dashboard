# Approved recovered release — failed live acceptance and rolled back

The approved package `fe2f058` (frozen source `7a2c442`) was uploaded through the existing authenticated Cloudflare manual build environment. Build `bd510169-8d3f-4c42-8037-4c1ef8702815` verified the exact approved bundle digest `31302af418fa34c141220edbd9b73f0c4c7015fc7284c68e0eeb9c89de415c03`, unpacked the prebuilt artifact and succeeded. No application recompilation, new resource, migration, credential change or hosting change occurred.

- Candidate deployment: `79d6b9b0-8014-451a-bd3d-f732bbe15888`; version `9cdbd746-b0d2-47a8-aed8-41775bb1fbed`, 04:31:15 UTC November 16 (11:31 PM Toronto November 15).
- Critical live failure: NBA `/api/dashboard-summary?sport=nba&scope=current` returned HTTP 503 at 04:33:39.624 UTC.
- Immediate compatible fallback: deployment `4e8f8721-6e0a-4836-b877-9446a0f360d0`, version `a48c431a-5c3e-4491-8529-38cb20dfa898`, active from 04:34:08.795 UTC. Same dashboard SQLite namespace and KV retained. The candidate is withdrawn; its unchanged archive remains for audit, and preparation now rejects it.

## Confirmed blocker

Request `e32464f8d1de08d4d44bb59aa63f622e` is a candidate-version Worker invocation with response 503, outcome `ok`, CPU 28 ms and wall time 30 ms. Its correlated logs repeatedly report: `Invalid redirect value, must be one of "follow" or "manual" ("error" won't be implemented since it does not make sense at the edge; use "manual" and check the response status code).`

The shared foreground official-source wrapper in `frontend/lib/official-history-source.ts` forces `redirect:'error'`. The background request-budget wrapper forces `manual`, explaining why background capture tests and actual job recovery can pass while a cold foreground schedule/summary fails. Source discovery confirms this unsupported redirect option in the shipping wrapper. This is a confirmed Worker compatibility defect; do not attribute this 503 to OWL authentication or memory exhaustion. No memory, hard subrequest, CPU-limit or `job_subrequest_budget` matches were found in the retained candidate-window query. That bounded negative result is not a long-term memory certification.

Required correction before another release: use supported manual redirect handling while continuing to reject unexpected redirects, then add a truly cold foreground official-source/schedule/summary runtime case. Existing compiled-runtime coverage exercised background capture and retained foreground boards; it did not establish this cold foreground gate. Do not retry or deploy this withdrawn artifact.

## Actual production browser evidence

Chromium reached the real production site with TLS verification enabled, the managed proxy configured and the existing browser NSS trust store accessible. No replay, frozen clock, ignored certificate errors, provider-key copy or Cloudflare security change was used. The earlier certificate block was local browser configuration, and was resolved before activation.

The five checked NFL tabs each displayed 24 saved cards: passing yards, passing touchdowns, interceptions, QB rushing yards and pass+rush yards. Their visible missing-forecast/EV reasons matched the response. No page or hydration errors were recorded during this partial run. Settled time-block groups are intentionally collapsed: an initial harness assertion counted only mounted cards; expanding the real controls exposed the 24 cards and the corrected harness retained strict API/DOM equality. This harness issue was not treated as an application defect.

The critical summary failure stopped acceptance before all 17 NFL tabs, NBA seven-market EV/PR, NHL four-market browser/reload, featured/history/schedule counts and long-running resource gates could finish. They are **not certified** by API or replay evidence. Before stopping, separate live APIs showed two fresh upcoming NFL QB rows (one fitted projection, one baseline; zero qualifying EV), and NHL current Shots with 25 verified quote rows /21 displayable rows. These are API observations, not completed browser acceptance. Browser timings for the five NFL tabs were approximately 3.7–6.1 seconds, including real final-group expansion.

After rollback, real browser NBA/NFL/NHL pages again returned 200 without page/hydration errors. Fallback NBA PR returned 23 rows, NFL schedule returned 14 games and NBA summary returned 200/17 games. This confirms rollback availability, not repair completion or a guarantee that the older fallback is free of its known issues.

## Capture, receipts and history

All 17 previously pending NFL jobs completed during the candidate window; the passing job retained 40 source checkpoints. Maximum measured per-phase request use in this lane was 32 against the 220 job guard. The pending NHL first-goal job resumed from its preserved sources and completed, retaining 46 source checkpoints; its measured phase use reached 70. Neither result fabricates a missing eligible pick. NBA capture and all-sport grading independence were not observed to completion before rollback.

Fifty new NFL original receipts were saved at 04:32:50–51 UTC and survive rollback. Read-only SQL verifies all 50 were captured before kickoff, with zero future quote timestamps; no new betting selections or grades were created after the fixed cutoff. All 18 predeployment historical checksum groups match exactly at cutoff `2026-11-16T04:28:00Z`; protected older history is checked separately by date. Duplicate original, pick and grade keys are zero. No evidence, namespace, pick, grade or historical document was deleted or overwritten by rollback.

CW08 stayed on deployment `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174`, unchanged version and `*/15` schedule. Read-only status is healthy: 938 receipts, 781 grades, 161 completed cycles, zero pending uploads, no storage error and no source cooldown. No frozen model or protocol change, production promotion or evidence rewrite occurred.

## Tests, tracker and next step

The predeployment results remain 824 passing regression tests, one optional diagnostic skipped, zero TypeScript diagnostics, successful production build, six compiled-runtime checks and approved-artifact dry-run. They did not prevent this new live failure and are not completion evidence. Seven focused audit/quarantine tests pass after withdrawal, including refusal to prepare this candidate again. No application repair for the redirect defect has been deployed or claimed in this release.

Google Sheets tracker: CW11 remains in Repair checklist, now Blocked with the release/rollback evidence; Verification log V62 records the failed acceptance. No rows moved to 100% completed because the combined repair did not satisfy its live gates. Earlier completed CW05/CW06 rows remain intact. Sheet cell values and validation were read back; native rendered sheet layout was not verified in this environment.

Automatic dashboard builds remain paused (`__cw08_manual_release_only__`); original build/deploy commands were restored after creating the pinned manual build. Next action is to correct the supported foreground fetch behavior and verify the exact cold summary path in workerd before preparing a new artifact for approval. **The repair is not ready for another deployment or 100% completion.**
