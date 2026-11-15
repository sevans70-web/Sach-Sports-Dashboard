# NFL missing rankings — combined release awaiting approval

No deployment occurred. Work continues on `cloudflare-compatibility-test`, retaining `f4f5d2d` and `235cce4` and the complete original capture-repair history.

## Reproduced cause

A real production browser showed **0 Passing Yards rankings / 0 picks**, with no page exceptions. The same live API returned **16 quarterbacks**. The current page required `completeRankingProp`, which requires an exact-price EV comparison, for *every* NFL ranking. This conflated browsable research coverage with selection eligibility. Available fitted forecasts whose probability validation failed, unsupported-model markets, and genuine quote-only quarters all disappeared.

The live week-10 schedule had 14 weekly fixtures and **12 Sunday November 15 Toronto fixtures**, including the international NE–DET game already underway. The primary sportsbook catalog was healthy (14 events). The supplemental feed returned HTTP 401, which reduces redundancy but does not explain all quarterback rows disappearing from an otherwise populated response.

A second defect affected later blocks: internal background capture took the retained frozen-board shortcut instead of fetching fresh sources. Job publication uses dashboard KV while the older shared history path remains read-only. The foreground retained response consulted only the older publication path, so a frozen early block could hide fresh later-block coverage. Held fallback jobs further reduced refresh coverage; holding jobs did not itself delete the API's 16 existing quarterbacks. Existing logs also showed failed legacy featured-publication attempts. This repair does not enable that shared write path; it reads the dedicated job-published cache.

NFL also had a display-only maximum of five UNDER rows and incomplete Q1 quarterback-rushing/scorer category aliases. These can remove real coverage independently of model/odds availability.

## Implemented changes

- NFL-specific display eligibility keeps genuine current or immutably saved pregame sportsbook rows browsable. Quote, fixture, player, capture timing, withdrawal and availability checks remain enforced. Invalid/stale unrecorded quotes cannot become rankings.
- Show the original fitted projection when present. Historical averages are explicitly labelled **Historical baseline**, never substituted for forecasts. Missing projection, confidence and EV have visible reasons and additive `nflCoverage` API diagnostics, including the Worker KV response path.
- An original fitted projection can show its direction against its actual main-market line, including Q1, labelled as a projection direction. No baseline-only or missing-model row creates OVER/UNDER, confidence or EV. Scorer and one-sided target semantics remain distinct.
- Exact, integrity-checked model probabilities can display signed positive, negative and zero research EV without creating a selection. Failed probability validation still blocks confidence/EV and every selection/featured qualification rule remains intact. Existing rank, quote, forecast and pick fields are not rewritten.
- Remove NFL's display-only UNDER quota; preserve all original directions and records. NBA, NHL, CBB and CFB display rules remain unchanged.
- Internal capture now bypasses the retained-board shortcut. Foreground reads can merge fresh job-published later-block KV coverage with original frozen early rows. Originals win; no later fit replaces them. This requires no new namespace, credential, write permission or schedule.
- Quarter alias handling is isolated in an **NFL-only adapter**. Explicit Q1 categories can identify period when no conflicting period is present; contradictory full-game evidence is rejected. The shared football quote parser is restored byte-for-byte. Existing active-market visibility policy is unchanged; no unsupported quarter model was introduced.

## Actual candidate coverage

These are **compiled candidate browser replay counts from unchanged live November 15 API captures**, not post-deployment counts. All 17 currently active NFL market tabs rendered with no browser page errors. Every market had zero newly qualified model picks/EVs in this captured population; keeping these unavailable is intentional.

| Market | Rendered rankings |
|---|---:|
| Passing Yards | 16 |
| Passing TDs | 16 |
| Passing Interceptions | 16 |
| QB Rushing Yards | 16 |
| Passing + Rushing Yards | 16 |
| Rushing Yards | 25 |
| Receiving Yards | 25 |
| Receptions | 25 |
| Rushing + Receiving Yards | 21 |
| Anytime TD | 25 |
| First TD | 25 |
| Sacks | 24 |
| Solo Tackles | 25 |
| Tackles + Assists | 25 |
| Q1 Passing Yards | 16 |
| Q1 Receiving Yards | 25 |
| Q1 Rushing Yards | 25 |

The real captured featured feed contained First TD (Jonathan Mingo) and Long Shot (Jahmyr Gibbs). Play of the Day / Best Value had no qualifying row; these slots were not filled artificially. Existing distinct-player and qualification tests remain required.

A separate actual compiled-Worker/KV replay served all **14 still-upcoming** original passing rows with diagnostics and no altered row; the full browser replay preserved all 16, including the two already-started international quarterbacks. Pure upcoming cache entries must not smuggle started rows into the pregame path. Causal route tests verify mixed-cache merging retains the original early evidence and internal jobs actually reach source fetching.

## Release protection and remaining work

The frozen combined archive, exact source commit and digest are in [manifest](../../frontend/releases/dashboard-nfl-capture-2026-11-15/manifest.json). It supersedes the pending capture-only candidate. [Release plan](2026-11-15-nfl-capture-release-plan.json) requires fresh approval before any upload and immediate rollback on a critical live failure. Current compatible fallback is version `a48c431a-5c3e-4491-8529-38cb20dfa898`; namespace and all new evidence must survive rollback. Do not restore the withdrawn failed candidate or a pre-namespace version.

Automatic builds remain paused. CW08 remains on deployment `39ea465b-ca3f-47f8-9bd2-50eb2f1ad174`, with its 15-minute schedule untouched. Regression testing caught an intermediate change to its bundled shared dependency; the final NFL-only adapter removes that dependency change. The research output again matches **151,874 bytes / SHA256 `c6a71a74051e42a9f6642944b6f9e247be3c4b3f74c96cd84319fb0dbb4959e4`**. No research model, evaluation period or receipt was modified.

Supplemental provider authorization, unsupported fitted markets and insufficient quarter history remain real data/model limitations. Fixing rankings does not complete model validation. Future source-population counts, real scheduled checkpoint progress, browser/API response times and all production release checks must be verified after approval. Local emulator request accounting does not certify live Cloudflare quota enforcement.

[Machine-readable validation and final test results](2026-11-15-nfl-ranking-validation.json), [infrastructure snapshot](2026-11-15-nfl-ranking-infrastructure.json). Ready for controlled deployment only after the final checks recorded there pass; no production repair is declared complete from local tests.

Final verification: **793 tests passed, 0 failures, 0 skips; TypeScript 0 diagnostics; production compilation and frozen combined artifact dry run passed.** The capture recovery tests, all seven NBA EV regressions, all-sport featured rules and NHL preservation tests pass. The final compiled NHL replay retained 11 Shots, 5 Points, 14 Assists and 11 Saves using the same recorded November 14 evidence, with no real writes. Final CW08 health: 886 receipts, 658 grades, 136 completed cycles, no pending uploads or storage error.

**Ready for a controlled manual deployment after approval. Not deployed and not a declaration of completed production/model repair.**
