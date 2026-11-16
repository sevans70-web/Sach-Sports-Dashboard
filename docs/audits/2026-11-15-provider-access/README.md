# NFL/NHL provider access recommendation — November 15, 2026

> Current correction: the owner confirms **Rookie, active through December 15, 2026**. Both merged props routes are included. No upgrade or new subscription is recommended. See [active Rookie findings](active-rookie/README.md) and the updated [unsent support draft](owl-support-request.txt). Earlier conditional pricing below is historical analysis, not the current recommendation.

Application/recovery code remains `616cf96`. This investigation used read-only Cloudflare telemetry, binding **names/types**, repository configuration, connected email search and public provider documentation. No blocked sports-data endpoint was retried, no key was requested/read/copied, no account or provider was changed, and nothing was deployed. No application files changed; another development/test cycle is not represented as a solution to account access.

## Confirmed failures and affected markets

`confirmed-403-endpoints.json` lists all NFL/NHL-related 403 endpoint families found in the reviewed retained telemetry:

| Provider | Confirmed endpoint | Effect |
| --- | --- | --- |
| Owls Insight | `https://api.owlsinsight.com/api/v1/nfl/props` | Fresh consolidated odds for all 17 active NFL tabs |
| Owls Insight | `https://api.owlsinsight.com/api/v1/nhl/props` | All six NHL prop markets and first-goal book prices; also CW08 pregame quotes |
| ESPN | `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/:id/gamelog` | Per-player past game evidence; fresh projections/confidence/EV when not already retained |
| ESPN | `https://site.web.api.espn.com/apis/search/v2` | Player identity resolution; not a price feed |
| ESPN | `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary` | Game box-score/live/final detail |
| ESPN | `https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/summary` | Same summary service on its other host |

These are observed failures, not a claim that every endpoint or every request failed. Cloudflare traces are sampled, and broad queries can apply further sampling. Narrow queries establish the endpoints; observed span counts include duplicates and are not billable-request totals. Query strings and credential values were excluded from saved evidence. No NFL scoreboard/roster 403 was established in the reviewed set. NHL official API 429s are separate from OWL's denial.

All 17 active NFL markets share the blocked merged odds feed: Passing Yards, Passing TDs, Passing Interceptions, QB Rushing Yards, Passing + Rushing Yards, Rushing Yards, Receiving Yards, Receptions, Rushing + Receiving Yards, Anytime TD, First TD, Sacks, Solo Tackles, Tackles + Assists, Q1 Passing Yards, Q1 Receiving Yards and Q1 Rushing Yards. This means new quote availability is affected, not that every retained card disappears or every category has a fitted predictive model. First-scorer/unsupported markets must retain their explicit limitations.

NHL: Shots on Goal, Points, Goals, Assists, Blocked Shots, Goalie Saves, plus First Goal scorer. Goals/Assists model-validation holds remain even after quotes recover. Schedule, roster and history services have different inputs; a props denial must not be presented as a zero-game slate.

SportsGameOdds `https://api.sportsgameodds.com/v2/events` returned **401**, not a confirmed 403. Its `x-api-key` header name matches the provider documentation. The configured binding exists, but that does not establish a valid, current key or paid entitlement.

## Authentication, entitlement and rate limits

OWL documents 401 for missing/invalid/revoked keys; 403 for a valid key without permitted access (insufficient tier, inactive paid account/ended trial/unpaid subscription, or deactivated key); 429 for request/concurrency/monthly quota limits. Our Bearer header matches its contract. The documented interpretation points to entitlement/account state, but existing traces do not preserve the denial body's `requiredTier` or an upstream WAF explanation. Do not assert the precise account reason from status alone.

ESPN's public endpoints use no application subscription credentials. OWL or SportsGameOdds payment cannot authorize ESPN. Cloud egress/automated-request restrictions are possible, but the specific ESPN rejection rule was not established; host switching, proxies and browser impersonation are not proposed recoveries.

NHL official roster/history **429s** indicate throttling, not an OWL subscription issue. CW08's transport already applies its frozen retry/cooldown behavior. A paid odds upgrade does not remove NHL's own limits.

## Subscription verification: what is known and missing

Cloudflare reports existing `OWLS_INSIGHT_API_KEY` and `SPORTSGAMEODDS_API_KEY` secret bindings on the dashboard; research has its existing OWL binding. Neither exposes the subscription nor proves the two Workers use identical key values. No `THE_ODDS_API_KEY` or `ODDS_API_KEY` binding is configured on the dashboard; repository fallback code is not an active paid integration.

The connected email account returned no messages for OWL/Owls Insight, SportsGameOdds or The Odds API, including subscription/invoice/access searches. No authenticated OWL/SGO billing portal is available through this session's tools; there is no callable shared-browser interaction tool for inspecting a signed-in subscription. Therefore **the actual tier, billing status, key activation and account linkage remain unverified**. The owner was asked for the non-secret OWL Billing plan/status only; no answer is assumed.

Conditional resolution: an active OWL Rookie or higher should already permit the merged props endpoints; restoring correct paid-account/key entitlement should need no plan upgrade. Bench lacks these merged props permissions. An ended/unpaid trial/account needs billing or provider action. SportsGameOdds 401 needs legitimate authentication repair first, not an assumed upgrade. Any configuration/secret change remains pending approval and secure owner/provider handling; no token should be pasted into chat.

## Cost and coverage comparison

Prices checked against provider pages on November 15; use the provider's listed currency, taxes and exchange rates at checkout. These are **published totals**, not a verified incremental bill or a purchase recommendation.

| Option | Published monthly cost | Coverage / reliability / limitation |
| --- | --- | --- |
| Repair existing authorized OWL/SGO access | $0 additional if already entitled | Lowest integration risk; verify billing/key state with the provider first. Observed denials mean working access is not yet established. |
| OWL Rookie | $24.99 total; +$15 if currently paying $9.99 Bench | Unified NFL/NHL props; 75k requests/month. Does not include the general MVP archive. No price/market presence is guaranteed merely by tier. |
| OWL MVP | $49.99 total; +$25 from Rookie | Includes archived stats/odds; evaluate existing archive coverage before buying it to replace NFL history. Current subscription may already include it. |
| SportsGameOdds Amateur / Rookie | Free / $99 total | Existing adapter; free 2.5k returned objects/month and 10-minute updates; paid Rookie 100k objects and 3-minute updates. Full-month repeated slate collection can exhaust free allowance. Authentication currently fails. |
| The Odds API (`the-odds-api.com`, not the similarly named `theoddsapi.com`) | Free 500 credits; $30/20k or $59/100k USD | Six core NHL props documented, broad NFL props and Q1 passing. Q1 rushing/receiving availability is not established by its published catalog. Existing narrow NFL fallback is not a full normalized/evidence-complete integration; no configured secret. Costs scale by event, market, region and polling. |
| Existing NHL official API | No additional subscription | Real schedules, rosters, player logs and finals; no sportsbook odds. Existing 429s require respectful pacing/caching. Not a contracted SLA. |
| nflverse | Free | Licensed bulk NFL histories/rosters/PBP, generally nightly after games. Useful for independent historical features; not a fresh odds feed, live grading SLA or ready-made probability model. Defense/quarter features require explicit field/identity/date validation. New source adoption requires approval. |
| SportsDataIO production | Sales quote | Licensed live stats/projections/odds with commercial SLA options. Its inexpensive Discovery Lab data is next-day delayed; trial data is scrambled. Neither substitutes for current genuine pregame odds. Not the economical first choice here. |

Illustrative quota planning, not measured account usage: 60 NFL games × 14 distinct supported markets × 24 polls plus 250 NHL games × 6 markets × 24 polls is 56,160 one-region The Odds API credits before discovery/history/NBA. A $30/20k plan would not cover that example; $59/100k could. Batch markets avoid extra HTTP work but do not remove market-based credit costs. Conversely 24 repeated reads of 310 SGO events would return 7,440 objects, already above its free 2,500. Actual selection must use confirmed available markets, schedules and account usage, not these assumptions.

Do not purchase a projections service just to fill confidence/EV. Mean projections or bookmaker-implied chances are not interchangeable with independently calibrated model probabilities. Restoring real historical inputs can unblock supported existing models; unsupported forecasts and validation holds remain explicit.

## CW08 correlation and production protection

The latest reviewed research 403 span is **November 15 at 5:36:41 PM Toronto**, trace `b384795a9cecbb017456168ea0530ba2`, directly at `https://api.owlsinsight.com/api/v1/nhl/props`. Dashboard traces show that exact endpoint failing too. This establishes the same provider/route problem, not necessarily an identical underlying key or a known billing cause. Earlier dashboard NHL success at 12:56:58 PM followed by a 2:50:58 PM 403 also argues against treating permanent absence of sportsbook markets as the explanation.

Research status: 902 receipts, 658 grades, zero pending uploads, no storage error; active capture retrying `source_http_403`. Schedule remains `*/15 * * * *`; deployment `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174` unchanged. Existing evidence is preserved, but fresh eligible enrollment is blocked. Missed pregame opportunities cannot be retroactively enrolled or filled with later odds.

Dashboard remains compatible fallback `9b1c3dea-a683-4e0f-9f42-71236a095a9d`. Automatic-build inclusion is still `__cw08_manual_release_only__`. The recovery safeguards verified in `616cf96` are **not deployed**; their six compiled-runtime tests and 816-test regression result are prior evidence, not tests rerun during this read-only assessment. Existing production must not be declared immune to its known failures while held repairs are unactivated. No production or historical record was written here.

## Recommendation and next action

1. **Spend $0 first:** verify OWL Billing's actual plan/status and key activation/account association; ask support to explain the two denied merged-props routes. A ready-to-copy request is in `owl-support-request.txt`; it has not been sent.
2. If already active Rookie/MVP/Hall of Fame, seek entitlement/key/account correction under that subscription. Do not upgrade merely to try to cure 403. If Bench, Rookie is the lowest published tier for the exact required merged feed; request explicit approval before a $15/month increase. If inactive, obtain the actual renewal price before action.
3. Repair SGO authentication under the existing account as a potential authorized backup. Do not buy its paid plan until real coverage and usage are established.
4. If NFL history still needs a new source, compare existing entitled OWL archive coverage against free nflverse before buying another service. No source replacement has been made and CW08's source/protocol is unchanged.
5. After the account problem is corrected, perform **one bounded** verification of each required source, checking freshness, exact fixture/player/line/prices and supported history. Then repeat release acceptance and request deployment approval. No repeated probes or new deployment now.

## Primary references checked

* [OWL pricing](https://owlsinsight.com/pricing): plan prices and included products.
* [OWL API documentation](https://owlsinsight.com/docs#authentication): refusal status meanings, props/history access and supported statistical endpoints. The NFL/NHL historical archive must be checked for actual held coverage, not assumed complete.
* [SportsGameOdds error reference](https://sportsgameodds.com/docs/info/errors) and [pricing](https://sportsgameodds.com/pricing): authentication versus entitlement and object quotas.
* [The Odds API pricing](https://the-odds-api.com/), [market catalog](https://the-odds-api.com/sports-odds-data/betting-markets.html), [quota calculation](https://the-odds-api.com/liveapi/guides/v4/#usage-quota-costs): independent provider, actual catalog limitations and usage model.
* [nflverse licensing](https://github.com/nflverse#licensing) and [update schedule](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html): free attributed datasets and expected latency; no commercial SLA inferred.
* [SportsDataIO access modes](https://sportsdata.io/developers): live licensed production versus scrambled trials and delayed Discovery Lab.

The public documentation was read through web retrieval. Direct workspace retrieval of the public OWL OpenAPI document was refused; no authenticated sports endpoint was retried to work around that refusal. A shared desktop capability is declared for environment `ccarenv_b64_Y2NhcmVudl80ODQwNDk1MjNiOTA4MTkxOGRlNTU2ZjdjMmMzNDVhMA`, but no callable desktop JavaScript/browser tool is exposed in this session. No signed-in OWL page was inspected or subscription inferred from that capability flag.

## Recheck at 8:46 PM Toronto, November 15

This update supersedes the earlier claim that fresh CW08 enrollment remains blocked. Read-only telemetry now shows research OWL NHL props HTTP **200** at 8:21:31, 8:21:34 and 8:33:02 PM Toronto. Receipt count increased automatically from **902 to 930**, with 658 grades, zero pending uploads, no storage error, and an active roster phase with zero retries/error. No account, key, model, protocol or Worker changes were made by this investigation. Success is observed recovery, not a verified explanation of the earlier 403 or a guarantee of future availability.

The latest observed dashboard OWL NHL props call still returned 403 at 8:01:48 PM; SGO returned 401 in the same trace. A one-time check of the live dashboard NFL Passing Yards and NHL Shots routes was rejected **before reaching the app**, with Cloudflare Error 1010 (browser-signature access denial). Neither response establishes provider status. The non-retryable edge refusal was respected; no header disguise, alternate host or proxy was attempted. Upstream telemetry was read through the existing authenticated Cloudflare integration. NFL fresh recovery is unverified.

A broader connected email search for owl/owls/owlsinsight/WiseSportsAI/SportsGameOdds again returned no correspondence. The actual billing tier remains unknown. Given new successful research reads and restored enrollment, do not purchase an upgrade based solely on the previous 403. Confirm the existing plan/key/account status and dashboard access first. Evidence is in `access-recheck-2046-toronto.json`. No application source changes or new regression test claim; existing 816 passing tests remain the prior verified code result.
