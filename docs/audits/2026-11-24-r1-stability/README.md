# R1 stability preparation — GO for separate approval, not deployed

Requested November24,2026 4:29PM Toronto. Preserve source16a9844 and the later e35c9d7 handoff; do not reopen probability/provider investigations. **No production code/data writes, deployment, model promotion, import, backup export or CW08 changes.**

## Frozen candidate

`R1-STABILITY-2026-11-24-e35c9d7-84829ff137af`, target `sach-sports-cloudflare-test`.

- Compiled source `e35c9d7f02c9f63354aa74dfbc3dc933dc0f67e9`; all812 existing build inputs hash-identical to that source. Only local test harnesses and package/preparation documentation change in this task.
- Bundle/config/assets `84829ff137affe1e09736ed901f853da3805259d184cc7ecb0cc2b6ed976aa99`;431fingerprinted files.
- Frozen archive `6898b846076b44675d6e4bea271c473c2641d1f9944bc78b4061981f21911d00`;13,175,634bytes. Includes complete per-file checksums/source-input inventory. The new preparation helper verifies both inventories, every restored file and original source ancestry; rejects upload flags.
- [Exact release plan](../../../frontend/releases/r1-stability-2026-11-24/release-plan.md), [manifest](../../../frontend/releases/r1-stability-2026-11-24/manifest.json). Package commit and literal depth2 manual commands are in the post-commit handoff/Issue129; that package commit has e35c9d7 as its parent.

NBA supporting-history/durable/EV recovery (`af5f712`), Prediction Dashboard bounded cached statistics (`b8d05e3`) and NFL FINAL/checkpoint/quote-price safeguards (`af5f712`/`31911ba`) are included. Existing NHL recovery stays intact. Four NFL probability statuses and NHL Goals/Assists safeguards remain unchanged; improvements stay under P01/later model release. Stable quote/projection cards with honest unavailable-value explanations do not require promotion of held probability models. No forced counts or selections.

## Targeted verification

**34distinct targeted tests passed, zero unresolved failures; TypeScript zero diagnostics; production build and dry-run passed.** [Machine-readable results](verification.json). Existing73recovery/36pricing/3research checks and previous live evidence are reused with [hashes](reused-evidence.json); no broad suite or new provider calls.

| Candidate check | Evidence |
|---|---|
| Cross-sport identity/cards/negative-zero EV/featured/resource bounds |14checks;37recorded categories and all17NFL/sixNHL coverage/display contracts; supported and deferred original-selection preservation. No live coverage claim. |
| Full shipping summary + seven NBA cached markets |3tests: cold/concurrent summary HTTP200 with17recorded games, zero unsupported redirects; all seven original cached boards/forecasts/availableEV recovered before denied providers, zero upstream calls/writes; genuinely missing uncached inputs explicitly unavailable. |
| Full shipping supporting-history route |14first/last eligible cases across seven markets, exact input-receipt hash/game-by-game series; zero providers/history writes and unchanged cached forecasts. |
| Full shipping source/capture/grading/rollback |9tests: legitimate NFL quote capture during official403, denied feeds block explicitly,17foreground tabs with in-flight collection, recovered NHL Shots/Points/Saves, independent official-final grade lanes and lostACK recovery. Candidate→compatible fallback→candidate retains originals/checkpoints and completes with zero manufactured picks. |
| Bounded official NFL checkpoint runtime |5tests: request-exhaustion progress **3→7→9FINALs**, isolate restart and warm no-restamp; persistent403/429 cooldowns;58sources/116of220charged operations/max2sources across six teams; deliberately stalled body stops without detached requests and resumes. |
| New frozen package |2tests: all files/hashes and unchanged binding/model-hold flags restore; tampering detected; upload flags rejected. |

The initial run exposed **test harness defects**, not waived application failures: the older cold-route adapter lacked new NFL schedule/final endpoints and returned synthetic500s; it now explicitly applies the intended403contract there. A50ms fault timer could fire before the intended second FINAL; the test now checkpoints the first FINAL under a six-operation ceiling before injecting the stalled body. All original safety assertions remain.

One obsolete withdrawn-artifact opt-in is skipped; no required release gate is skipped. Previously verified redirect error/timeout scenarios were reused, not needlessly repeated. Initial/final logs are retained separately; remaining failure count is zero.

## Compiled statistics/resource delta

[22new full shipping checks](compiled-performance-proof.json) use the existing verified20,904record SQLite restore read-only with intercepted source calls. This checks combined main/featured cold concurrency, all five periods for all three sports, durable isolate restart, genuine record reconciliation and absence of interactive archive work. Test wrappers live outside the package; production bundle is unmodified.

- NBA first response1,020ms; six concurrent985–1,020ms. Local simulator boot5,458ms recorded separately; total cold6,478ms<15s. Repeat48ms.
- NFL concurrent145–149ms/repeat8ms; NHL220–226ms/repeat9ms.
- Restart:129ms request/1,653ms including simulator boot, **zero source reads**. Cached five-period requests max85ms.
- Genuine protected records returned: NBA1,212/NFL149/NHL254; all summary outcome counts reconcile. Zero source writes, zero interactive archive/legacy requests. Partial archives stay explicit.
- Local automatic alarm delivery is disabled **only in this interactive test wrapper**, preventing prior-sport background work from contaminating foreground source counters. Background execution is verified separately in the capture/grading/recovery tests and reused archive rehearsal. No production schedule/code is disabled.
- Existing compatible config:350subrequests,220operation capture budget,25sphase/four source concurrency; official NFL history max2sources. Six-team test116/220operations; full shipping grading phases maxNBA4/NFL6/NHL6operations. Runtime limits/caches/schedules are recorded in the plan; no expansion.
- Dry-run module payload14,344.57KiB/gzip7,591.89KiB, below the existing10MiBcompressed limit. No plan change. Local workerd startup/route compatibility passes; actual Cloudflare CPU/heap/loading acceptance remains mandatory. Existing sourcemap warnings are build-tool warnings, not new runtime exceptions.

These are **local actual compiled-runtime/recorded-data measurements, not fresh production performance or provider availability**. Do not confuse fixture row counts with current sportsbook population. Existing full-population/350card/EV/historical import investigations were not repeated.

## Read-only production and recovery safety

[Fresh Cloudflare readback](production-safety.json): fallback deployment72ab06fe/versiona48c431a at100%, retrievable compatible class/namespace/KV, eight secret binding names only, existing three schedules and350limit unchanged. Build include remains only `__cw08_manual_release_only__`; original manual commands remain restored. CW08 deployment39ea465b/version46e95f99 and15minutecron unchanged; this is configuration verification, not a new collector health audit.

Fallback archive SHA25aab16c… matches the original manifest; the original stage verifier confirms approved86cb4452… digest. Its older bundle-then-assets fingerprint ordering differs from the newer globally sorted inventory; use its established verifier, not the new algorithm to relabel an old artifact. Live version readiness plus new lostACK candidate/fallback/resume rehearsal pass. Software rollback never restores/deletes databases or original/new evidence.

Reuse complete20,904record recovery:11,615history/6,368receipts/1,616picks/1,305grades. Existing delta and complete-manifest files hash-verified locally; their prior Drive readbacks/four-table isolated restore are reused without export or restore repetition. Current production counts are **not recounted in this preparation task**. Fresh read-only inventory and only any genuine later-delta recovery remain pre-upload gates; never imply the baseline is a fresh census.

## Readiness and remaining acceptance

**GO: request separate authorization for this exact scoped stability artifact after package push/depth2 check. NO: upload now, promote models, declare R1complete or move unchecked tracker rows.** No unresolved local application/packaging gate remains. Four NFL/NHL statistical holds belong to P01 and are expected disclosed behavior; Saves missing quotes, Blocks missing fitted model and unsupported Q1/role/source evidence remain distinct limitations, not permission to invent data.

After approval, require actual desktop/mobile NBA7/NFL17/NHL6, exact current quotes/availableEV/featured/top-and-bottom supporting history, five-period authentic statistics/automatic refresh, production errors/resources, protected baseline+new rows and unchanged CW08. Within90minutes complete current initialization,38capturemarkets/three grading rotations, archive reconciliation and genuine grading of last verified173olderpending cases where evidence permits. Explicit legitimate holds need their reason/coverage recorded. Critical acceptance failure immediately restores compatible fallback; no silent extension or additional deployment attempt.

The deployment procedure retains the proven **fetch depth2 + pinned checkout + original ancestry/hash guard**, uses extracted frozen output rather than rebuilding, and requires immediate command restoration/readback on success or failure. No credential movement, preview workarounds or new services. TrackerR1/CW09/CW11/V62stay open; P01modelwork stays later. The completion decision depends on actual production acceptance, not these passing tests.
