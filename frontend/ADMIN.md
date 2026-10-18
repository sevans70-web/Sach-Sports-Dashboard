# Private administration

The `/admin` route and `/api/admin/*` data routes require a server-verified Supabase user with confirmed email `sachsportsplatform@gmail.com`. User metadata and client flags never grant administrator access. The public site remains available as before; MLB and soccer remain absent from navigation, including the admin sport selector.

## First sign-in

Open `/admin/login`. Existing Supabase users can use their password. For first access, request the email sign-in link, open it, then set a password in **Your account**. If the configured Supabase email template includes an OTP, the code form also works. Email messages are sent only after requesting them; deployment never creates a password or sends an invitation.

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
