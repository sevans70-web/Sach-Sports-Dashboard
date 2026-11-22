# Authorized NBA diagnostic deployment — November22,2026

**The diagnostic-only release passed live acceptance for its approved scope. OWL access works for all seven requested NBA markets, and the published NBA rows pass independent identity/model/EV checks. R1 remains Blocked.** No full R1 release or new model was deployed.

## Deployment and safeguards

- Artifact `NBA-ODDS-DIAG-2026-11-21-cae200070535`; full inventory/config SHA256 `cae200070535f2b0286266964dc29a6b6610a2ec08b77aef3426a2b33c3acc20`; delta SHA256 `bc8c69baddce01bac2c5c3988c05149d1a8b7b5150f458f394f6780187dfc899`.
- Existing authenticated Cloudflare manual build `913bc182-976e-49a9-b353-8adb4fd9aae5` pinned to package commit `85e3dbf3b8792d94610bffb58c342defbba1c8e8`. Frozen reconstruction/checksum verified locally, in the manual build and again immediately before upload. No application compilation. Exactly one upload.
- Deployment **`5f930400-3285-4177-b1d8-ed5307374566`**, version **`48e8858a-7326-41ea-9457-532c74ec3337`**, at **12:44:14PM Toronto** (`2026-11-22T17:44:14.008529Z`),100% traffic. Build stopped successfully. Compatible fallback version `a48c431a-5c3e-4491-8529-38cb20dfa898` remains available. No critical new failure occurred; rollback was not required.
- Only `namespace-fallback.js` and the new diagnostic module differ from the verified fallback. Other749 raw files, models, assets, held queue/schedule behavior and configuration retain the approved fallback. All pending R1/UI/source repairs on the branch are excluded from this upload.
- Post-upload binding names/types/namespace targets, secrets' binding names, `2026-11-06`/`nodejs_compat`,350-subrequest limit, observability and dashboard schedules match preflight exactly. No credentials were read/transferred or rotated.
- Original manual build/deploy commands restored. Automatic-build inclusion stayed only `__cw08_manual_release_only__`. CW08 deployment `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174`, version `46e95f99-98f2-4abe-a2b2-0ff24b4f8e4b` and15-minute schedule remain unchanged. Research tables were not accessed.
- No explicit production record write, table migration, import, restore, deletion or new protected-inventory query. The101-game import was not repeated. Backup manifest+three objects remain available at unchanged metadata; prior verified hashes/restore reused. The known20,466backup versus last verified20,468protected-record gap (two original receipts) remains open; no new inventory/hash pass is claimed.

## Actual current odds and rankings

Each diagnostic market was read once at12:45PM Toronto. Results refer to their original captured window; these saved receipts must not be restamped or treated as current prices after the normal15-minute freshness cutoff. All seven returned HTTP200, no-store, in **0.106–1.549seconds**. Original raw responses, times, IDs, prices and SHA256 hashes are retained. They describe seven current NBA fixtures, independently joined to seven official games. Provider start times are consistently10minutes later than the official schedule; both original times are preserved, not silently made equal.

| Market | Live cards desktop / mobile | EV available per final25-row snapshot | Returned / omitted source offers |
| --- | --- | --- | --- |
| Points | 25 /25 | 25 | 773 /204 |
| Rebounds | 25 /25 | 25 | 742 /165 |
| Assists | 25 /25 | 24 | 621 /59 |
| Threes | 25 /25 | 25 | 661 /147 |
| PRA | 25 /25 | 25 | 610 /127 |
| PR | 25 /25 | 25 | 600 /184 |
| PA | 25 /25 | 25 | 501 /124 |

**No requested market returned zero published rankings.** All25published cards in each category were checked through the bottom of the list. This is the published25-row ranking set, not a claim that every player in the full upstream population has a valid model or is published.

The diagnostic preserves4,508offers from5,518market-matched offers before its approved per-book bounds: **1,010offers omitted explicitly**. There are **1,746incomplete or invalid two-sided American-price offers**; these are not eligible invented EVs. Every returned offer has its source prop ID, but none supplies an explicit scalar provider player ID or period in the diagnostic's known source fields. No absent ID or period was generated. Provider fixture IDs are source identifiers, not official ESPN numeric IDs.

Independent identity checks use current official roster/player/team records for both teams in each of seven games, obtained from the existing read-only Cloudflare game-detail route (all seven HTTP200,0.172–0.374seconds) and official slate (HTTP200,0.260seconds). All published player/game/team IDs and names match those records. Existing canonical category handling labels these row markets full-game; **explicit upstream period fields remain unverified**. Independent official joins establish the row identities without pretending the provider supplied missing IDs.

## Independent model, probability, EV and card verification

- **175/175row observations per viewport** (350total): official player/team/game identity, exact forecast/quote binding, original source/decision timing and model group pass. Input-receipt SHA256 hashes, decision times and snapshot IDs also pass350/350. All rows retain actual pregame times and the existing48-hour history lag.
- A separate Python implementation loads the existing checksummed model snapshot and joint-combination artifacts, then recomputes projections, expected workload, calibrated count distributions and OVER/UNDER/push probabilities from the **actual production input vectors**. All350row observations match. No refitting, tuning or substitute statistics. This verifies model execution and pricing, **not independent statistical calibration or completeness of all underlying historical observations**.
- Both side-specific EVs independently match `P(win) × American-odds profit − P(loss)`, with push return0. **174available API EVs per viewport** match exactly (348total). Positive and negative values display correctly. No exact zero EV occurred in this live window; exact-zero display remains covered by reused regression evidence.
- The one unavailable EV is legitimate: **Anthony Black, Assists, projection5.5, line5.5**. It moves from rank25 in the first pass to rank22/rank21 in later desktop/mobile refreshes. The card states **AT LINE** and explains why no direction/EV is displayed. It is not a missing-value bug, and no direction was forced.
- **350/350same-response desktop/mobile card checks pass**: player, category, opponent, projection, line, displayed direction and signed EV or accurate unavailable explanation, including every list's bottom cards. No horizontal overflow or hydration/page errors.
- Source prices and forecasts naturally changed between sequential reads. The first retained175-row snapshot has173exact prop/game/player/line/price matches to the diagnostic and two later price updates with the same identities. Later captures also have updated lines/prices under the same provider prop ID; that ID alone is not an immutable quote. Original line/price/time evidence is retained separately. A verification-harness comparison initially mixed desktop cards with a later mobile response; corrected per-viewport captures pass350/350. The original cross-snapshot result is retained in the archive and is **not** classified as an application failure.
- These outputs remain **research forecasts**, with betting validation withheld. Archived heuristic confidence is not used as an invented model probability. The pending branch confidence-card improvements and other R1 changes are not part of the diagnostic release; expanded supporting-history calls were suppressed for read-only acceptance, so their availability was not certified by this test.

## Browser, resource and background observations

Actual Chromium desktop1440px/mobile390px, Toronto timezone and TLS checks enabled: NBA/NFL/NHL pagesHTTP200 before and after, no page/hydration errors. The known local NSS initialization permission was restored using the previously verified narrow read/write permission to the existing `/home/agent/.pki/nssdb`; no TLS disabling, new CA, proxy/identity change or repeated certificate investigation. Auxiliary history/write APIs were blocked in the browser harness; actual ranking/schedule/summary responses were used, not replayed.

Before/after counts on the selected slate remain NBA Points25, NHL Shots14, NFL passing0. **The NFL zero is pre-existing, not a new regression and not a healthy all-NFL acceptance pass.** Other NFL/NHL market coverage was not re-certified by this NBA diagnostic task.

The first post-release pass through all seven NBA categories and all cards took39.2s desktop/33.6s mobile **in total**, including sequential clicks/waits; these are not initial-page loading measurements. Subsequent NBA-only card passes took37.0s/31.8s. Diagnostic request latency is reported separately above. This does not close the broader dashboard-performance checklist.

Cloudflare12:44–12:57PM observation:532`ok` outcomes, one`canceled`, max CPU4,604ms/max wall10,521ms; no exception, memory-limit or subrequest-limit outcomes in this window. This is bounded observation, not a full resource soak or direct heap measurement. Provider HTTP403 spans, supplemental401 and NFL incomplete-schedule/internal503 warnings remain visible; they are not falsely described as fixed because the OWL diagnostic works. Existing alarm and2-minute cron logs continue reporting `fallback_verified_before_capture_activation`: dashboard capture/grading remain held as before, not silently enabled by the diagnostic.

## Remaining blockers and next action

1. **NBA OWL seven-market access and published-row arithmetic gate are cleared for this captured window.** No new subscription is indicated. Missing explicit raw player IDs/period fields, incomplete offers and bounded sample truncation still limit proof of the full upstream population; official roster joins recover legitimate row identity. Preserve these distinctions.
2. Whole-universe forecast coverage remains incomplete. Current API diagnostics still report players withheld for unavailable recent official history, uncertain role, insufficient role/opponent/team evidence or unavailable quotes. Do not force those players into rankings. The25-row public boards do not prove all eligible upstream players have been audited.
3. R1 still needs production-equivalent cold/restart/recovery coverage using current validated inputs, clearing relevant NFL/source and backup gaps, plus a separately approved full-R1 attempt and actual browser/capture/grading/record-preservation acceptance. The held background rotation is not a pass.
4. Pending application/UI fixes remain on `cloudflare-compatibility-test`; no additional application defect was established requiring an unauthorized second upload in this task. Existing betting-model calibration limits remain; current research math is not a deployment approval for a new prediction model.

Reused unchanged-source regression: **892passed, zero failed,17optional skips; TypeScript zero diagnostics** from434f1db. No broad rerun or new application build. Fresh evidence is the actual deployment, seven provider responses, official readbacks,350independent row observations/receipt hashes and350same-response card checks.

Issue129 and the completion tracker record the result. **R1/CW11/V62 remain Blocked; no whole repair row moved to100% completed.** The diagnostic release itself is operational and passed its scope, not another proposed deployment awaiting approval.

`result.json` and the raw-response hashes in `evidence-manifest.json` summarize the checks. `evidence.tar.gz` preserves original public source/ranking/roster responses, per-viewport snapshots, local independent verification scripts and non-sensitive deployment/safety metadata. No API credentials or request-signature headers are included.
