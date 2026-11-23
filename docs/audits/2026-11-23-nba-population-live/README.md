# Approved NBA population diagnostic — actual November 23 results

**The one approved diagnostic deployment succeeded. Current NBA population and supported official-source access are verified; the new branch repairs pass current-data cold recovery. R1 itself is not deployed or complete.** Next work is to freeze the repaired full-R1 candidate and finish its release checks/startup sequence, then request separate approval. No further provider/preview investigation or new subscription is indicated by this evidence.

## Deployment and safeguards

- Exact artifact `NBA-POP-CENSUS-2026-11-23-01e5a84612d9`, complete SHA256 `01e5a84612d9b65745c2ec8c980d85750602e5522c7b0b33b103e0ce133c4561`,11,227-byte patch SHA256 `24285ee5ec901888287c7229eab897a471436dc224f6943f452b1e96e857d302`.
- Existing authenticated manual build `98d9bfaa-7fb0-427c-9077-aaede41be295`, pinned to `f22c93c6e50b155080e013756c07ee1f84d223c9`, verified the full digest twice, including immediately before upload. No full dashboard build; the frozen prebuilt output was reconstructed. One upload, one module differs;750otherfiles/wrapper/assets/config remain unchanged.
- **Deployment `907bf0e9-e512-48d6-8629-ab9b33a68710`, version `9b38d251-9f0a-4d95-b07c-fc7feb6eab93` at100%, 2:19PM Toronto.** Rollback `48e8858a-7326-41ea-9457-532c74ec3337` and compatible emergency fallback `a48c431a-5c3e-4491-8529-38cb20dfa898` were available. No critical new failure; no rollback was necessary.
- Production binding names/types/namespace targets, credentials, compatibility2026-11-06/nodejs_compat,350-subrequest limit, observability and schedules match preflight exactly. Manual commands restored; automatic inclusion still only `__cw08_manual_release_only__`.
- CW08 remains deployment `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174` / version `46e95f99-98f2-4abe-a2b2-0ff24b4f8e4b`, unchanged15-minute schedule. No research tables accessed, no plan upgrade/new service/R2/credentials/public preview.
- No production records were seeded, updated or deleted. Read-only dashboard-source aggregates after collection still show101versions/101pointers,764,248encoded bytes, zero team calendars, latest verified2026-11-17T22:04:46.689002Z; both SELECTs report rows_written0. The diagnostic has no SQL/KV write or capture capability. The verified20,468-record backup/import evidence was reused, not repeated; no new protected-table export or invented current count.

## One bounded actual production collection

**2:21:28–2:22:04PM Toronto:142new diagnostic/source HTTP requests,36.26seconds, one at a time, zero retries, zero403/429/unexpected source failures.** Within160requests/two concurrent/four minutes. No further provider calls were made during analysis/tests. Control-plane deployment/status checks are separate from this source collection.

One bound OWL NBA response supplies **10,138source props,8,239seven-market candidate/matched offers**,11provider fixtures/70books. The other1,899props are outside these seven categories. All8,239positions, original prop IDs, names, provider fixture IDs, books, lines, prices, nulls, flags and timestamps are preserved; stream count/hash/trailer pass. Actual offers SHA256 `5ab46e5642a2acb368a936ddcbeb4fbda12a872cc8ba20beaa51b8a3009e438d`. This is the current N, not a forced historical5,518target. The earlier1,010omitted November22bodies were not reconstructed.

Official Cloudflare requests returned valid scoreboard,10pregame summaries,20rosters,20complete2027team calendars and90missing FINAL censuses. Forty-two existing validated FINAL bodies were reused unchanged. Total **132required FINALs +20fresh calendars,20,694validated per-market observations**,10official current games and353official player/game roster slots. Existing21-day window,48-hour availability lag,15-minute discovery rules and exact model requirements are unchanged. All141official responses passed the existing source validators. No athlete-gamelog probes, alternate identities/hosts or restrictions bypassed. Success on these supported resources does not claim every historical ESPN athlete endpoint is restored.

Data and prices are valid at their original captured window; they are not restamped or presented as currently executable later. The documented decision time is2:22:04.930PM Toronto, after all source receipts. `capture-decision.json` retains the original completion clock precision for reproducibility.

## Every offer and player accounted for

**8,189/8,239raw offers independently join an official current player/fixture; the remaining50are for an off-slate Toronto-November24fixture. Zero unresolved current executable offers or names.** This verifies every raw position, including tail offers and invalid-price offers, not only the selected book or published25cards. Provider player IDs and explicit periods are absent in the known source fields; they were not invented. Official IDs come from the validated rosters/fixtures, while configured canonical categories establish the application's full-game classification. The next-day fixture's validity was not certified or coerced into today's slate.

All353roster slots were evaluated under the unchanged native model in all seven markets: **2,471player/market assessments**. Per market:204models available,50officially unavailable,58uncertain role,25insufficient role history,16missing player/team history. These individually recorded exclusions use complete actual inputs and native availability/model rules; no forecast or probability is invented for them. Lack of a current executable quote is separate from model availability.

| Market | Raw offers | Current official quoted player/fixture pairs | Quote + model available | Native research selections |
|---|---:|---:|---:|---:|
| Points |1,439|121|117|66|
| Rebounds |1,320|119|115|53|
| Assists |1,004|103|99|49|
| Threes |1,255|103|99|61|
| PRA |1,111|104|100|70|
| PR |1,157|115|111|78|
| PA |953|99|95|65|

Totals: **764current official quote pairs /736with model projections /28with truthful model or availability holds**. There are121unique current quoted player/fixture identities. Native research selections442are **not saved picks, public ranking counts, approved bets or evidence of independent betting calibration**. Threshold failures and other native selection reasons are retained per player alongside full forecast/probability output. No model fitting/tuning/OVER balancing or changed selection thresholds. Existing publicTop25policy remains unchanged.

The native normalizer selects866source contracts;52alias duplicates collapse to the same official player/fixture,50off-slate contracts remain excluded. Raw source flags include3,898incomplete/invalid two-sided-price offers and36stale quote timestamps at initial feed observation; flags overlap and are not counts of people. They are not made into EVs. All original quotes and their current model/role lineage are in the compressed position and player censuses.

## Confirmed defects repaired on the branch ONLY

1. **Official Clippers fixture and roster-team names:** ESPN uses `LA Clippers`, while some books supply `Los Angeles Clippers`. Strict name checks dropped valid whole-fixture rows and four explicitly team-tagged offers. Added the exact spelling pair only with official `LAC` abbreviation/canonical name. Lakers, wrong date/opponent, reversed sides and unverified genericLA are still rejected.
2. **Six verified player-name variants:** JaimeJaquezJr4432848/JaimeJaquez; DariusAcuffJr5142620/DariusAcuff; TreyMurphyIII4397688/TreyMurphy; MikelBrownJr5101761/MikelBrown; JabariSmithJr4432639/JabariSmith; DerrickJonesJr3936099/DerrickJones. Aliases require both that official ID and its canonical name. Existing d605e1a aliases remain intact; no fuzzy matches or historical name/key rewrites.
3. **False history exhaustion during cold recovery:** the old guard assumed two subrequests for every distinct source, so128sources falsely exhausted despite all152validated inputs already stored. On the actual complete slate it recovered only16,908/20,694observations and marked107roster players unavailable with zero provider calls. The reader now meters each memoized durable lookup and each necessary live read separately, retaining the **same256operation ceiling and94request reserve under350**. Cache misses/HTTP still both count; background's existing220guard remains unchanged. This changes collection accounting, not model mathematics or freshness.

These fixes are **not in the deployed diagnostic module or active dashboard**. Models, EV formulas, original selections/projections/times, NFL improvements and NHL/CW08 code are unchanged. Raw offers/source timestamps are never overwritten.

## Focused current-data recovery evidence

- **Three new regression cases pass**, plus the extended LAC-team assertion retest: exact player IDs/canonical names; LACfixture/roster guards; real353-slot missing-cache/recorded403contract cannot exceed256total lookup/live operations and reports explicit unavailable evidence. TypeScript exit0/zero diagnostics; diffcheck clean. No old passing/full suite,350card audit, historical import or backup work repeated.
- **Actual local workerd/SQLite cold replay:** populate an isolated store from the legitimate152source records with original observation times, discard the entire Worker, prohibit all network, then use the shipping source reader. After repair **20,694/20,694observations, all152source references, zero unavailable players, zero provider calls**, exact input SHA256 `4f2640237494f996d84a9e9d52dc71f1b85e3ec31acd7047460400aec568ef35`; durable pointers/times unchanged. About5seconds in this local350-subrequest/30,000ms CPU test. This is compiled current-data recovery, **not an actual production R1 cold pass**.
- **Initial production-shaped warmup rehearsal:** local101FINALs/zero calendars, current captured official bodies, and deliberately simulated prior athlete403responses. Five serialized220-budget phases advance durable denial/source checkpoints across Worker restarts; complete211pointers (101original +110new operational sources), all20,694observations and zero unavailable players. Another restart needs zero provider calls. All101original pointers/hashes/times remain unchanged. This operational test uses simulated ingestion-check times at the fixed test clock; it is not a current provider-failure claim or replacement research receipt. The separate original-timestamp cold test above proves source-input parity. Production was not warmed or written.

## Actual browser and release limits

Before/after actual Chromium desktop1440/mobile390, TLS verification on: NBA/NFL/NHL pagesHTTP200, no hydration/page errors or overflow. First displayed market counts remain **NBA25/NFL0/NHL25 on both views**. NFLzero is pre-existing and not a new diagnostic regression or a certified healthy17-tab pass. NBAfirst-market smoke navigation13.25s before/13.39s after desktop; mobile9.52s/13.33s. These include loading/waits and are not an improved performance claim or heap measurement. No350-card re-audit. The known NSSpermission issue was resolved using the prior narrow existing trust-database permission; no TLS disabling/CA changes/credential bypass.

**Remaining R1 work:** freeze the combined candidate containing these unshipped repairs and finish the remaining compiled full-route/resource/concurrency release checks, including the startup sequence before serving a cold slate. The production store deliberately still has101FINALs/zero calendars because this approval allowed no data writes. Separately authorized R1 startup must refresh and checkpoint operational evidence before claiming ready current predictions; do not import or restamp these now-old calendars. Then obtain full-R1 approval and complete actual NBA7/NFL17/NHL6browser, complete capture/grading rotations, resource and protected-record acceptance. The diagnostic did not activate held jobs or prove those live gates.

No current NBA provider-access or full-population mystery remains in this captured window. R1/CW11/V62 stay open until the remaining release/live gates pass; no broad repair row moved to100%completed. No new paid source or repeated import is recommended.

## Reproduce offline

Verify `evidence-files.json`/`source-files.json`, extract `current-sources.tar.gz` into a local capture folder, then run from `frontend`:

```sh
node scripts/audit-current-nba-population.mjs CAPTURE_FOLDER NEW_ANALYSIS_FOLDER
node scripts/audit-nba-raw-offer-identities.mjs CAPTURE_FOLDER NEW_ANALYSIS_FOLDER
node scripts/verify-current-nba-cold.mjs tests/fixtures/nba-population-sources-2026-11-23.json.gz NEW_LOCAL_STATE fixed
```

Optional `baseline` in the last command compiles exact f22c93c source to reproduce the128-source failure. All these tools are offline; cold replay refuses every outbound request and uses only local SQLite. Initial warmup evidence/script explicitly distinguishes simulated HTTP/cache check times from the archived original production source receipts. `current-sources.tar.gz` holds only the approved public sports evidence, not protected pick tables or credentials.
