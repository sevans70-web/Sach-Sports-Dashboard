# R1 — NBA request-profile parity and complete-history outage handling

From `7a0b9a5`, existing branch. **Nothing deployed. R1 remains blocked for live source verification and production acceptance.** Issue129 was read first; its scoped instructions agree with this repair. No model, odds, historical record, backup, production binding, automatic build or CW08 state was changed.

## What the retained production evidence establishes

The failed corrected artifact returned54verified Points quotes and52Rebounds quotes, but54/54 and52/52gamelog failures and zero observations. It returnedHTTP200 with zero public rows; actual Chromium rendered0Points cards. Fallback again rendered25Points cards after rollback. The earlier controlled test allowed requests by athlete ID alone; it did not represent a request-profile restriction or a completely denied cold history path. Its local pass did not prove live source access.

Existing archived source maps show an unintended request-profile difference:

| First public NBA request | Fallback provider transport | Failed candidate official transport |
|---|---|---|
| Application identity | `Mozilla/5.0 (compatible; SachSports/1.0)` | `SachSports/1.0` |
| Framework cache directive | `no-store` | unspecified |
| Redirect handling | framework default | manual, explicit rejection |

The new manual redirect handling must remain: the previous `redirect:error` exception is already proven incompatible. The discrepancy is not evidence that redirect rejection itself is wrong. Same Worker, namespace/KV, binding configuration and byte-identical Points model/history partition were already verified in the retained release evidence; no reason to repeat that investigation.

The fallback does not have a special NBA KV read path; it computes/displays through its established transport and slate-board path. Candidate cache recovery needs a still-valid10-minute same-day receipt. A read-only check of the configured current Points key returned404/key-not-found; this is a present observation, not proof of the key's state at the earlier incident. A preseeded local cache test cannot prove a production cold start has evidence. No production cache was populated, edited or deleted for this task.

## Small repair

1. `provider-fetch.ts` exports its **existing unchanged** public application identity. `official-history-source.ts` reuses it for the initial NBA request and restores explicit `no-store`. NFL's profile stays unchanged. There is one NBA profile, not a sequence of profiles chosen after failure. Individual403 cooldowns, origin429 cooldowns, manual redirect rejection, cancellation, deadlines and job budgets remain enforced. No alternate-host403 retry, credential change or new access mechanism.
2. `nba-history-availability.ts` detects an empty result with verified prices, all priced histories unavailable and no fitted forecasts. The real NBA ranking handler now returns503/`nba_official_history_unavailable`, an explicit error and retry interval rather than a successful empty200. Existing foreground retry/retention can preserve prior cards, the Worker can still recover legitimate KV evidence, and unavailable results cannot be published as healthy empty market coverage. Normal empty schedules, model holds, partial forecasts and valid rows retain their existing behavior. This classification defect is directly established by the actual incident payloads, independent of the unknown provider rejection cause.

No projection/EV/eligibility threshold is relaxed. Genuine complete403 with no valid cache still cannot produce cold rankings. This repair does not make up missing histories or extend quote freshness.

## Targeted proof and limits

The compiled fallback, failed archive and corrected build are run in workerd against the same authentic recorded seven-market inputs and embedded model histories. An **explicit request-profile fault contract**, rather than an actual ESPN response replay, rejects the changed identity and accepts the existing public application identity without adding observations. Failed artifact:0rows in every market. Fallback/corrected: exact parity in identities/projections/full pricing probabilities, with9Points/9Rebounds/8Assists/11Threes/8PRA/11PR/8PA eligible rows. Unconditional403 tests keep all seven markets unavailable in all versions. A matching profile is not treated as provider authorization.

Actual compiled route valid-cache tests recover the original23/23/22/25/17/20/17rows with unchanged forecasts/KV and zero history writes. The real NBA GET handler is also compiled into workerd with faulted builder inputs: actual retained54/52incident coverage and parameterized other-market outages return503 across all7markets; normal empty results remain200. This handler test uses injected inputs and is not a complete shipping-source or production replay.

Final checks: **34focused +1handler workerd +2compiled profile +1compiled cache +10compiled summary =48passed,0failed**. Build passes; TypeScript0diagnostics. EV/First Basket/featured-original preservation, denial cooldowns, cancellation, retry/retention and redirects are in the focused set. The existing NFL/NHL fixes are preserved; no unrelated sport logic or frozen research model changed. Prior844regression evidence is reused for unaffected behavior; a new full-suite run was deliberately avoided. Initial test harness startup failed because its temporary modulesRoot was missing; setting it explicitly fixed that test-only issue, and the final handler check passes.

## Remaining uncertainty and next gate

The live response bodies/provider decision reason and a successful same-connection comparison for the changed request profile were not captured. **These tests prove request parity and error handling, not that the identity/cache difference caused ESPN's production403.** The actual provider refusal could involve another policy. Do not label the underlying live-access problem fully solved or request another production release on the fault contract alone.

The minimum next step is an authorized production-equivalent verification of the intended NBA history connection with the restored fixed profile, without changing production state or retrying refused access through other identities/hosts. Existing observability access was previously refused; no repeated blocked queries were made. If that connection remains denied, provider-supported access or an already authorized source is needed. No purchases, account changes or production deployment are authorized by this repair.

Read-only Cloudflare checks retain active fallback4699c3c4/versiona48c431a100% and paused automatic-build exclusion. No CW08 request or mutation was made. The tracker and Issue129 retain the live blocker and prior failure history; no row moves to100% complete.
