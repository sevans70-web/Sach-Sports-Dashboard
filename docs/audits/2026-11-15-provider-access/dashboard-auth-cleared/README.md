# Dashboard authentication gate — cleared for controlled release consideration

Observed November 15, 2026 Toronto time (November 16 UTC). This supersedes the audit-client authentication blocker in the earlier report; it does not erase the genuine historical provider 403 responses.

## Confirmed cause and authorized verification

Cloudflare Error 1010 rejected the audit client's default Python urllib identity at the managed workers.dev edge, before the dashboard Worker ran. It was not evidence of a new outbound OWL failure. Cloudflare's official documentation recommends a descriptive application User-Agent for this case. The read-only audit now identifies itself truthfully as `SachSports-ReleaseAudit/1.0`; no browser impersonation, proxy/hostname change, WAF change, TLS bypass or credential extraction was used. Existing environment proxy configuration is respected (`NODE_USE_ENV_PROXY=1` for Node in this workspace).

References: https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1010/ and https://developers.cloudflare.com/workers/configuration/routing/workers-dev/ .

The existing production dashboard, not a substitute audit Worker or CW08 credential, served the fresh results below through its own current bindings. Saved/frozen rows were explicitly excluded from authentication acceptance. The new CLI `frontend/scripts/dashboard-live-access.mjs` checks only owned public GET routes and stops on denial/rate limiting. It contains no provider credentials. Run with the explicit upcoming NFL day to avoid mistaking frozen Sunday cards for fresh data.

## Live results

At 04:07 UTC, `/api/nfl/rankings?market=passing_yards&day=2026-11-16` returned two verified, two-sided fresh main-line quarterback quotes (Jacoby Brissett and Justin Herbert), updated seconds before the response. Recheck at 04:12 remained successful.

Tomorrow's NHL routes returned 18 verified priced Shots on Goal rows and 15 verified priced Points rows among their public top-25 responses. The repeated Shots check fetched a new quote update at 04:12:09 UTC. These are observed returned rows, not a claim about complete provider inventory. Tomorrow's Saves returned 11 unpriced model-watch rows and zero verified quotes: this remains a coverage limitation, not proof of authentication failure. No missing odds or probabilities were invented.

Production trace sampling did not capture the individual manual audit calls; upstream 200 status is not asserted from absent traces. Fresh provider-attributed quotes, quote timestamps, current dashboard routing and the separately healthy research transport support access restoration. Intermittent future provider restrictions cannot be ruled out.

## NFL historical data and optional backup

The existing nflverse validation remains research-only. Current-season weekly records and explicit GSIS/ESPN identity matching can supplement full-game history after a separately reviewed runtime adapter, pregame cutoff, season/roster and missing-data checks. Weekly totals cannot supply Q1 splits or first-touchdown order. No unsupported probability, EV or selection is derived from them; fresh sportsbook quotes do not prove fresh historical-model availability. ESPN historical endpoint restrictions remain a limitation handled by bounded source-denial checkpoints and explicit unavailable forecasts.

SportsGameOdds last observed 401 remains unresolved. Its legitimate account check is GET `https://api.sportsgameodds.com/v2/account/usage` with the existing configured credential. No connected authenticated SGO account tool or existing dashboard account-proxy route is available; Cloudflare secrets are write-only. We cannot extract a key or edit a deployment to run this check under the no-deployment instruction. Existing account owner/provider verification is still required if that optional backup is to be restored. No purchase, rotation, subscription change or support message was made. OWL now works without it, so optional SGO access does not by itself block the controlled dashboard release.

## Safety and remaining acceptance

The dashboard remains on the compatible fallback. Automatic builds remain paused. CW08's version and 15-minute schedule are unchanged; latest read-only status and observed successful scheduled cycle are preserved here. Existing receipts were not edited. Collection can be healthy without adding receipts when no newly eligible first-receipt opportunities exist.

The production browser test was blocked by the workspace browser's managed proxy certificate trust, before application execution; TLS verification was not disabled. Live API checks used normal certificate verification. Local compiled-candidate browser replay covers the 17 NFL tabs, seven NBA and four NHL markets separately and is not presented as live model/provider evidence. Real post-deployment browser, cold capture/checkpoint, schedule independence and memory acceptance remain mandatory with immediate compatible fallback on critical failure.

See `frontend/releases/dashboard-recovered-2026-11-15/release-plan.md` and its immutable artifact manifest. This is preparation for approval, not authorization to deploy or a declaration that the repairs are 100% complete.
