# Private administration

The `/admin` route and `/api/admin/*` data routes require a server-verified Supabase user with confirmed email `sachsportsplatform@gmail.com`. User metadata and client flags never grant administrator access. The public site remains available as before; MLB and soccer remain absent from navigation, while both remain available in the private admin sport selector.

## First sign-in

Open `/admin/login`. The default first-access screen requests an email link without asking for a password. Existing users can choose **I already created an admin password**. Open the email sign-in link, then set a password in **Your account**. If the configured Supabase email template includes an OTP, the code form also works. Email messages are sent only after requesting them; deployment never creates a password or sends an invitation.

Auth return handling accepts access/refresh fragments and validated token-hash links for signup, email, magic-link, recovery and invite flows. Returns to this app's home URL are forwarded to the admin login using a fragment. The server still verifies the Supabase user and exact administrator identity before issuing cookies. Expired links and authorization-code returns without a PKCE verifier show a fresh-email instruction; they never grant access. A redirect to a domain outside this application still requires correcting Supabase's URL configuration.

For an email verification link that cannot open its destination, the login page has a private pasted-link fallback. It accepts only the configured Supabase origin and `/auth/v1/verify` path, extracts the token hash and permitted verification type, and verifies them with Auth. It never fetches the pasted URL or follows its redirect destination. The administrator allowlist still applies. Pasted links are sent in the same-origin POST body and cleared from the form after submission.

Existing Railway `SUPABASE_URL` and `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_KEY` remain server-only. Supabase Auth email sign-in must be enabled, and its allowed redirect URLs must include `https://marvelous-wholeness-production-c8d3.up.railway.app/admin/login`. Production email delivery must permit the dashboard address (Supabase's default mailer can restrict recipients; configure its existing SMTP/provider if needed). These provider settings cannot be inferred from database connectivity alone.

## Session and boundaries

- Supabase validates every administrator identity with `getUser`; no local JWT decoding authorizes requests.
- Access and refresh tokens live in Secure, HttpOnly, SameSite=Strict cookies. Refresh happens through the same-origin auth route. Sign-out clears both cookies and requests Supabase session invalidation.
- Mutations require the canonical dashboard Origin. Sign-in/email attempts have a bounded process-local limiter in addition to Supabase limits. Private APIs use no-store and never return API keys, passwords or authentication tokens.
- First-use email sign-in can create only the allowlisted dashboard account. There is no arbitrary registration, invitation or tester-access route.
- Password changes require the current verified user's session, with a minimum twelve-character password. No admin password reset or hardcoded password exists.

## Result inspection

Results run the same six sport performance/settlement handlers as public totals, including the NFL QB/Offense/Q1 and CFB QB/Offense scopes, then read the full saved scope directly through the existing history readers. This avoids public response caps of 100 entries and includes records with missing lines for inspection. Records retain original saved calls, lines, actuals and timestamps. Any unverified quote is labeled. The inspector supports sport, Today/Yesterday/Week, category, player/team/game search and outcome filters. Withdrawn records count as void; pushes count as settled but stay outside the hit-rate denominator. A failed group prevents partial aggregate counts from appearing as complete results.

Operations show the existing capture manifest, readable history storage and presence of backup configuration. Backup configuration is not a claim that the latest Drive upload succeeded. GI/model readiness remains unvalidated and there are no controls to promote a model or overwrite history.

No changes to retention, volume, Google Drive backup scripts or storage settings. Tester provisioning, public performance drill-down lists, model validation and broader operations controls remain separate work.

## Verification

`npm run build`, `node --test --test-concurrency=2 tests/*.test.mjs`, then `node --test tests/admin-auth.integration.mjs` from `frontend`. The integration test starts the production server against an isolated local Auth mock; it never authenticates against production or sends email. It checks page/API denial, exact-email authorization, request origin, session cookies, refresh, result access, password change and logout. Production verification must separately report whether only the signed-out boundary was tested or the real owner login and email delivery were completed.

## October 24 handoff update

MLB and Soccer are selectable privately. MLB reads existing Railway performance snapshots without generating predictions or recomputing grades. Legacy target-hit labels remain separate from sportsbook outcomes; missing/unreadable storage produces an error. Soccer reads existing saved predictions without invoking its capture or settlement routes. Neither sport is added to public discovery. Original projection, probability and GI fields are visible for inspection without implying validation.
