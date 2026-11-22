# R1 readiness — November 22, 2026

**NO-GO for requesting another full R1 deployment yet.** Two small application defects are repaired and tested on the working branch; the backup gap is closed. The remaining preapproval evidence gap is the **current full-slate, pre-limit player/history census and its cold recovery**. The approved bounded diagnostic cannot establish this for unseen players. Actual full-R1 browser, capture and grading acceptance follows a separately authorized release; it has not passed and must not be described as a predeployment simulation pass.

Base: `1c567c1`, `cloudflare-compatibility-test`. Reused [November 22 live diagnostic](../2026-11-22-nba-diagnostic-live/README.md): all seven NBA feeds HTTP200, 350 same-response card checks, independent model/probability/EV checks. **No repeat of that card audit, historical import, full regression suite, private-preview investigation or deployment.** These saved odds are evidence at their original clock, not current executable prices.

## Fixed: exact NBA sportsbook-name joins

The retained seven official games contain **246 player/game roster slots**. Across seven bounded raw market samples, **46 offer occurrences** failed the existing exact-name join because of three verified aliases:

| Official player / ESPN ID | Book name | Official game |
|---|---|---|
| Josh Giddey / 4871145 | Joshua Giddey | 401910032 |
| Alex Sarr / 5160992 | Alexandre Sarr | 401910031 |
| Cameron Johnson / 3138196 | Cam Johnson | 401910032 |

`nbaRosterNameKeys` indexes these aliases only when **both official roster ID and canonical name agree**. Historical name normalization is unchanged. A quote still needs the unique official fixture, correct away/home sides, original date/time tolerance and roster-team match. Original prop IDs, lines, prices, periods and timestamps are not rewritten. Quotes resolving to the same official player/game deduplicate under the existing rule. This recovers legitimate quote identity, not 46 extra players or guaranteed forecasts. Under the unchanged main-line/freshness/price checks, the retained sample has 89/89/71/74/71/87/67 distinct joined player/fixture quotes for Points/Rebounds/Assists/Threes/PRA/PR/PA. These are sample quote counts, **not predicted live ranking counts**.

The actual seven-market source replay verifies all 46 previously unmatched raw occurrences now join; wrong IDs/names, unrelated teams, wrong date/opponent and duplicated official fixtures remain protected. See `nba-alias-coverage-proof.json`, `nba-alias-targeted.log` and `frontend/tests/nba-roster-aliases.test.mjs`.

## Coverage: legitimate holds versus unknowns

`nba-coverage-summary.json` accounts for every pre-limit candidate in the reused production counters: **173 per market, 172 Threes**. There are 30–39 role-history/role-uncertainty holds and 36–51 source/player-team-history holds by market. These are existing model safeguards; unavailable probabilities/EV must remain unavailable. The counters cannot identify individual unobserved players or prove their exclusion is correct. The 25-row public cap is applied after eligibility; it is not evidence that exactly 25 players are eligible.

The approved raw diagnostic returned 4,508 of 5,518 offers, explicitly omitting **1,010**. The complete official roster has 246 slots, but a roster slot alone does not establish a current sportsbook market or model eligibility. The compressed `nba-observed-population.json.gz` preserves all 246 × seven observed slot states, with unknown hold reasons explicitly null. It must not be used to invent missing inputs.

For the **complete retained November 21 34-player cohort**, the actual seven unchanged models each produce 19 available / 15 held forecasts. Every hold is individually identified in `held-cohort-audit.json`: five insufficient role histories, four uncertain roles, five reported unavailable, one missing player/team history. These are truthful outcomes from complete captured inputs at their original clock, not all-player November 22 live acceptance. Two analysis-harness assertions were corrected to use Toronto dates and the application's existing accent normalization; neither required an additional application fix.

**Remaining required evidence:** a complete current pre-limit census linking every roster/quote candidate to its exact official identity, source-history freshness and selection/hold reason, with cold-restart readback for those actual inputs. The current approved capped diagnostic does not expose this. Expanding production diagnostic code would require separate approval; no such expansion was uploaded. Do not reopen provider/preview investigations or force all roster players into models to fill this gap. Missing explicit upstream player/period fields alone do not negate independently verified official joins and canonical full-game categories; they are recorded provenance limitations, not demands for fabricated fields or a new subscription.

## NBA cold recovery and progress

Six focused tests pass using the actual source-recovery modules, local **workerd + SQLite Durable Object**, captured legitimate sources and original observation clocks. They cover seven-market input/projection/probability/EV parity, expiry, semantic rejection, cancellation, restart, source403 and uncached Rebounds/Assists/Threes recovery. The current 34-player source test uses a deliberately tighter **45-request allowance** inside the 350-subrequest/30,000ms CPU runtime: phases use **42 / 42 / 26 requests**, successful source pointers advance **0 → 6 → 21**, persistent denial receipts **21 → 34**, then an entire Worker restart recovers 2,982 observations with **zero provider calls and zero foreground writes**. Missing source evidence blocks explicitly rather than repeatedly retrying without progress. Existing picks/markers and the NFL/NHL lanes remain unchanged.

This clears the scoped recorded-condition cold/restart test gate. It does **not** prove current full-slate Cloudflare egress or current production cold recovery; no production source data was seeded or restamped for the test.

## Fixed: NFL date-scoping and duplicate schedule work

The reused live trace reported `NFL schedule incomplete (1/5 dates unavailable)`. The route requested all five Thursday–Monday scoreboards, even for an explicitly selected day, and called schedule discovery twice before generating a cold board. An unrelated date denial could therefore block valid current-day quotes/rankings.

The candidate passes the validated selected day to `getEspnNflSchedule`, fetching that whole date once and reusing it. Whole-week callers retain the strict five-date completeness guard; failed weeks never become successful zero/partial schedules. Invalid dates fail before HTTP. No access-control bypass, new identity, credential change or repeated denied-endpoint probing.

An exact `1c567c1` compiled-source baseline reproduces a selected-day503 with 11 valid current-day games plus one unrelated-date403. Corrected compiled workerd returns the same 11 official IDs with **one request and zero unrelated-date requests**. The real public source was fetched once, HTTP200/0.285s. One existing production weekly-slate read was HTTP200/0.844s with **13 weekly games** (different valid scope); this is not a candidate deployment or proof every history endpoint now works. Receipts and raw-source fixture hashes are retained. All 17 NFL display/market contracts and all-sport schedule guards pass in the 25-test focused group.

The reused passing-yard response has **23 valid quote rows / 16 fitted projections**. Existing branch visibility repairs display all 23 at the captured clock. All EVs remain unavailable for explicit probability validation/history reasons; 16 fail price-probability validation. This is recorded candidate display evidence, not a live candidate browser pass or permission to change NFL calibration. Supplemental SportsGameOdds401 is optional while authorized primary quotes are available; it is not independently a hard R1 blocker. Preserve unsupported Q1/first-TD and missing-history explanations.

## Backup gap CLOSED — no production writes

The user-authorized read-only comparison proves the older 20,466-record backup matches production except for **two original NFL receipts**. Canonical full-row hashes before and after the operation are unchanged:

| Dataset | Records | Canonical inventory |
|---|---:|---|
| History documents | 11,615 | 6e7f1c27dddcbabe945d374b6efd2e4f |
| Original receipts | 6,111 | 33d1173b71b0fe2f35aaf0b314a22836 |
| Saved picks | 1,473 | 656e60d2cb9dc59db003de6754cf09cb |
| Grades | 1,269 | 0e21950e276648be18bce04e2c468e33 |

Added a new **two-receipt delta** and **completion manifest** to the existing `Sach Sports - Railway Backup` Google Drive folder owned by `sachsportsplatform@gmail.com`; the folder name is historical, hosting remains Cloudflare. Nothing was overwritten. Both remote files were downloaded and compared byte-for-byte/SHA256. The isolated local restore combines the unchanged base with the delta and contains **20,468 records**, matching all four production inventories. All 20,466 old full row payloads remain byte-identical; duplicate identities are rejected; SQLite integrity is `ok`. Existing production records, timestamps, backups and sharing remain unchanged. No CW08 tables were accessed. Private receipt bodies and local databases are excluded from Git.

- [New complete manifest](https://drive.google.com/file/d/1lPS2RRr2hwyrz4s21wZgX8e0hzBRi9KE/view), SHA256 `cfea0a1386720861866117a3720f1789f1179be3a5151d9fbd41ccf520a67175`, 2,692 bytes.
- [New delta](https://drive.google.com/file/d/1Ri51JKy7XNdZzcKvNTVn7hnVChiRF4di/view), SHA256 `86d10721e11ce67313d2e5a0aaa5c45e5986edf783db118f7dafacf3da7693ee`, 4,169 bytes.
- `backup-completion-manifest.json` records the immutable base/part IDs and isolated restore procedure; `backup-local-verification.json`, `delta-readback-proof.json`, `backup-complete-proof.json` prove counts/readback. **Restore authorization is local only; this is not permission to import into production.**

## Verification and safety

- **39 targeted checks passed / zero failed**: six NBA durable/source runtime, eight NBA alias/fixture/market, 25 NFL/all-sport schedule/display contracts. One additional compiled withdrawn-baseline test successfully reproduces the failure; it is not a production pass.
- TypeScript: **zero diagnostics**, exit0 after both application changes. `git diff --check` clean.
- Reuse 892 passed / zero failed / 17 optional skips from the prior unchanged-source full regression; **not rerun or claimed as a new full-suite pass for these changes**.
- Read-only metadata at **2:32:48 PM Toronto**: dashboard deployment `5f930400-3285-4177-b1d8-ed5307374566`, version `48e8858a-7326-41ea-9457-532c74ec3337` at100%; compatible fallback version `a48c431a-5c3e-4491-8529-38cb20dfa898` remains listed. Automatic build filter still only `__cw08_manual_release_only__`.
- CW08 remains deployment `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174` / version `46e95f99-98f2-4abe-a2b2-0ff24b4f8e4b`, unchanged 15-minute schedule. No research-table reads/writes, credentials, bindings, schedules or production code changed in this task. This metadata check is not a new CW08 collection-health test.

### Only unresolved R1 gates

1. **Before another approval request:** current untruncated player-level coverage/history census and current full-slate cold evidence. The observed alias defect is fixed; unobserved missing-history/role holds cannot yet all be classified as legitimate or defective.
2. **After separate full-R1 approval:** actual desktop/mobile NBA7/NFL17/NHL6 acceptance, foreground/background resource/error observation, protected-inventory comparison, complete bounded capture and official-grading rotations. The fallback intentionally holds dashboard capture/grading; held jobs are neither a new defect nor a pass. Previously verified compiled/resource/fallback evidence is reused, and the fresh candidate must be frozen/preflighted once the current-data gate is satisfied.

Do not retain the closed backup gap, a blanket OWL-access failure, optional supplemental401, or statistical model tuning as generic infrastructure release blockers. NHL calibration remains CW08's independent frozen research scope. No R1/CW11/V62 row moved to100% completed. Issue129 and the tracker preserve prior history and append these outcomes.
