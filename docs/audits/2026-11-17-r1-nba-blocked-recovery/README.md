# NBA production403 / recovery blockers — November17

**Code repairs and Chromium trust checks verified. R1 remains blocked: production does not contain sufficient durable current NBA inputs. No release prepared, deployment attempted or production data imported.** Base `17813dc` and all earlier repairs are preserved.

## Actual production evidence, now read directly

The withdrawn candidate logged HTTP403 for `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/<id>/gamelog?season=2027`:56player discoveries failed,0observations. Rebounds had54verified quotes but0forecasts/HTTP503. This is not an OWL pricing or EV arithmetic failure.

Read-only Data Studio SQL against the existing **dashboard-only** `capture:nba` object confirms:

- `nba_history_versions` and `nba_history_checks` do not exist there: no complete validated durable source collection succeeded before rollback.
- Only five operational cached summary URLs remain (401909980–401909984), all expired; no cached athlete-discovery source. These raw JSON caches are not a complete semantically validated player/team/opponent input set, and cannot establish current discovery coverage. No forecasts were reconstructed from them.
- Assists/Threes each made three `rank` attempts with0source checkpoints/0checkpoint bytes/no last-checkpoint time, then entered **blocked** state. The old implementation did not retry forever; its third-attempt blocking was real. Earlier abbreviated phase logs omitted progress and request-source details.
- Initial usage20/4 was well below220. This failure was job-wide refusal propagation, not subrequest exhaustion.

All inspected SQL has `rows_written:0`; no CW08 namespace or research tables were accessed. `production-nba-store-*.json` retains the native query results. The second diagnostic batch contains a qualified-column typo in its second query; its first cache inventory succeeded. The subsequent corrected read verifies both blocked states and5total/0unexpired sources. No mutation or retry of a denied feed was involved.

The old background403 does **not** identify its exact URL: `failureDetails:null` and no denied-source receipt were persisted. We cannot truthfully assert that this specific refusal was the completed-season statistics URL rather than another nonoptional source. The exact old guard reproduced with `statistics/byathlete?season=2026` aborts even after its caller catches the optional baseline error. The request-count sequence matches that optional path, but correlation is not an upstream trace. New diagnostics record the refused origin/path/status, without arbitrary query strings or credentials.

## Smallest application repairs

1. NBA's already optional completed-season `/statistics/byathlete` and individual `/summary?event=<numeric>`403 responses are recorded per exact URL, cooled down and returned as **403**, without setting the whole capture phase to paused. Their callers may continue only with independently valid inputs. This never turns denied data into success, changes identity/hosts, softens scoreboards, or bypasses429/provider limits. NFL/CBB policies remain unchanged.
2. Complete semantically validated FINAL censuses are read before HTTP in background as well as foreground. An operational TTL cannot force a denied refetch ahead of a valid stored FINAL. Original source time, hash and successful-check time are retained; no claim of a fresh official recheck. The original15-minute discovery requirement,48-hour result lag, complete two-team census validation and existing model calculations remain unchanged. A failed or expired discovery still abstains.
3. Known NBA missing-history responses now block capture on the first attempt with verified-quote count and required-evidence diagnostics. Unhandled NBA401/403 also blocks immediately. The budget wrapper preserves this blocked signal through cancellation normalization. Other bounded retries/checkpoint recovery remain intact.
4. Deferred-job logs now include state/progress; source failures include sanitized endpoint/status. A denominator of0source-cache writes is not automatically starvation: successful phase advancement and immutable reservation/pick writes are also measurable progress.

## Focused verification —42passed,0failed; TypeScript0

-31source-policy, admission, cancellation, all-sport capture/grading/restart, immutable-record and denial checks passed: `focused-final.log`.
-5workerd recovery/durability checks passed: `recovery-final.log`. The new test uses all115checksummed actual November17source responses and the real captured Rebounds/Assists/Threes quotes at their frozen valid clock. No market board is cached; complete validated source inputs alone restore **25rows in each market**, with exact projection/probability/EV parity against the same captured-source reference.
-With sourceHTTP403 and unchanged durable inputs, all three local capture jobs advance `rank`→`originals`→`picks`→`publish`→`done`, reserving/storing25legitimate quote receipts per market. Qualifying selections remain model-defined (Rebounds22/Assists18/Threes20). The optional baseline is requested once, then its exact denial is cooled down. Local test ledgers only; these are not production picks or live acceptance.
-An empty source store reproduces missing evidence and blocks after one attempt with explicit requirements; another alarm makes no new denied request and changes no saved rows. A stale FINAL unit test recovers without HTTP or restamping; expired discovery/cancellation/semantic-truncation tests remain enforced.
-6NBA/college refresh regressions passed; TypeScript exits0with no diagnostics. A transport reconnect interrupted an earlier type-check session; its empty log was not counted as a pass. Only that remaining check was resumed; completed runtime results were reused.

This is not a new full regression run or compiled production-release certification. The real forecast/model/job code executes in isolated workerd; current odds/rosters arrive as explicitly captured test inputs. Its forecast clock is the original snapshot, not today's current prices. No model artifact, original forecast, probability formula, EV formula or historical selection was modified. Original local markers/source checks and unrelated sport stores remain unchanged.

## Chromium — authorized trust configuration fixed

The managed CA fingerprint already matched the certificate chain and NSS trust listing. Adding the same CA again could not fix the problem. Netlog showed an untrusted path while the execution sandbox allowed only read access to the NSS directory; Chromium's NSS initialization requires read/write access.

Granting the test command read/write access to existing `/home/agent/.pki/nssdb` through the normal execution permission mechanism restored certificate validation. The same browser/profile/proxy and existing trust entries then loaded the actual active fallback dashboard: desktopHTTP200/1.297s, mobile-sizeHTTP200/0.763s. Netlog reports a valid certificate path. No certificate-check disabling, replacement CA, HOME reassignment, credential transfer or provider-access workaround.

Reusable `frontend/scripts/check-chromium-trust.py` checks the existing DB's read/write accessibility before browser launch and reports an explicit environment blocker if missing. Execute it with the same narrow authorized filesystem permission. These actual navigations verify TLS/page access to the **active fallback**, not the withdrawn or repaired candidate's market/browser acceptance.

## Exact remaining data requirement

The latest actual candidate's NBA source access failed and its durable store is empty. This task does not establish that current Cloudflare ESPN access has resumed, and does not repeatedly retry the denied endpoints.

For every eligible current player/season, obtain a legitimate complete regular-season discovery response within15minutes of use, and the discovered recent21-day eligible FINAL censuses (with the unchanged48-hour lag). Each census must include exact player/team/opponent/game/season IDs and time/home-away; starter/DNP participation; minutes, points/rebounds/assists/threes, FGA/FTA/turnovers and reconciled team totals; and the full opposing census needed for possessions, duration and allowed-stat context. Existing model minimums include at least five team and five opponent fixtures plus its player workload/role checks. Current fixture identity/home-away and exact fresh two-sided sportsbook quotes are still required separately.

The previously captured November17archive supplies real older censuses and discovery bodies, but its discovery timestamps are no longer fresh. Five expired raw summaries and stored aggregate season averages cannot fill the gaps. Restored legitimate Worker source access, or an independently authorized supported collection/import of complete provenance-preserved inputs, is required; **no import is performed or presumed approved here**. No new paid service is recommended.

R1/CW11/V62 remain open/blocked; no100%closure or deployment approval request. Production fallback `b1ef6404`/version`a48c431a`, paused build filter, existing backups/records and CW08 remain unchanged. Next resolve the legitimate fresh discovery/census supply and verify it without guessing missing fields; do not start another general repair or private-preview cycle.
