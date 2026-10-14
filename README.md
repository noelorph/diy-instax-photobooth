# DIY Instax Photo Booth

A web-based Event photo booth with an Admin application and Guest-facing Booth Mode. The first release targets an iPad A16 running Bluefy with an Instax Mini Link 3 printer. Direct browser printing remains conditional on the target-device trial described in the PRD.

## Project guides

- [Product requirements](PRD.md): behavior, scope, and launch gates
- [Design system](DESIGN_SYSTEM.md): visual language, interaction patterns, responsive layouts, and accessibility
- [Architecture](ARCHITECTURE.md): proposed system design and technical boundaries
- [Glossary](GLOSSARY.md): canonical product language
- [Decision records](docs/adr/): durable product and technical decisions
- [Approved pre-gate Admin specs](docs/superpowers/specs/2026-10-13-admin-access-and-shell-design.md): Admin access and shell, followed by [Draft Event management](docs/superpowers/specs/2026-10-13-draft-event-management-design.md)
- [Development flowcharts](docs/diagrams/printing-to-deployment-flow.md): iPhone qualification, full build, and iPad release gate

Read the PRD and design system before implementing an interface. The design system governs presentation; the PRD governs product behavior.

## Development sequence

The owner's iPhone 15 Plus is a development-only Booth Mode test device; the currently reported setup is iOS 26.2.1, Bluefy 3.9.3, and Mini Link 3 firmware 0102(RX). Until a fresh-film iPhone trial proves the combined capture, print, and reliable physical-ejection path, work is limited to the independent Admin foundation and an isolated printer qualification harness. The foundation may proceed in parallel but is not required to pass the gate. A passed iPhone trial permits the full Admin, Booth, and print-accounting build. The iPad A16 remains the only first-release booth and must pass its own end-to-end hardware trial before launch. The exact iPad model and iPadOS version will be recorded when that device is available. See [PRD section 3](PRD.md#3-development-and-launch-feasibility-gates) and [ADR-0012](docs/adr/0012-qualify-development-on-iphone-before-ipad-launch.md).

The first-release Admin authentication requirements cover `/sign-in`, `/forgot-password`, and `/reset-password`; **Sign out** belongs on `/profile`. See the [Admin experience](PRD.md#5-admin-experience) for the behavior of each page.

## Local development

Install dependencies with `npm ci`, configure local Auth as described below, then run `npm run dev` and open `http://localhost:3000`. For local HTTPS device testing, place your certificate key at `certificates/booth-key.pem` and certificate at `certificates/booth.pem`, then run `npm run dev:https`. Open `https://localhost:3000` on the development computer or use the network URL printed by Next.js on the test device. The certificate must be trusted by the device and valid for the address used. The `certificates/` directory is ignored by Git; do not commit private keys. See [ADR-0013](docs/adr/0013-use-optional-https-for-local-device-testing.md). Available checks include `npm run lint`, `npm run format:check`, and `npm test`. Admin sign-in, password recovery/reset, Profile, responsive navigation, and protected foundation pages are implemented. Draft Event management and Booth Mode remain pending.

### Local Auth and database

With Docker running, run `npx supabase start`. This checkout uses the isolated `diy-instax-admin` project: API at `http://127.0.0.1:55321`, database on port `55322`, Studio at `http://127.0.0.1:55323`, and the Mailpit test inbox at `http://127.0.0.1:55324`. The pinned CLI applies the versioned migrations when starting a fresh stack. After adding a migration, use `npx supabase migration up --local`.

Run the Auth/Data API checks with `npm test -- tests/integration/admin-authorization.test.ts`. The fixtures discover only this local stack, reject any other API address, create temporary Auth users through its Admin API, allowlist only each test's Admin, and clean up the users and their Profiles/sessions. They never read application environment credentials. `npm test` includes these integration tests and therefore needs this local stack running. Inspect local database security with `npx supabase db advisors --local`.

Public registration is disabled by `[auth].enable_signup = false`. Keep `[auth.email].enable_signup = true`: that setting enables the email provider, including existing-user login. Approved local recovery callback URLs are listed explicitly in `supabase/config.toml`; production must configure its own exact application callback URL and SMTP delivery.

In an ignored `.env.local`, set `NEXT_PUBLIC_SUPABASE_URL` to the local API URL and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to its publishable/anon key from `npx supabase status`. Set the server-only `ADMIN_AUTH_ORIGIN` to the application origin used in the browser, such as `http://localhost:3000` or `http://127.0.0.1:3000`. Recovery always sends the configured origin's `/auth/callback` URL; headers and form fields cannot choose it. The corresponding exact callback URL must also be approved in Supabase Auth settings. Missing or invalid origin configuration produces neutral retry feedback. Production origins require HTTPS; only `localhost` and `127.0.0.1` may use HTTP. Recovery emails arrive in local Mailpit. Open the link in the same browser that requested it so the PKCE verifier is available. The fixed callback exchanges the single-use code and opens the public reset form; invalid, expired, or reused links offer another recovery request.

Run focused public form/action and Mailpit checks with `npm test -- tests/components/admin-auth.test.tsx tests/integration/admin-auth-actions.test.ts`. Sign-in checks the provisioned Profile through live-session RLS before opening `/dashboard`; a valid non-Admin login is denied and signed out locally. Wrong passwords and unknown addresses receive neutral feedback. Forms preserve the entered email, retain actionable errors, and block submissions while pending. Recovery gives the same confirmation and retry path for known and unknown addresses, including account-dependent cooldown or delivery errors. Confirmation does not guarantee delivery. Only address-independent configuration or connection failures show generic retry feedback.

### One-time Admin provisioning

For each environment, an authorized project owner provisions the sole Admin in two steps:

1. Create the email/password Auth user through the Supabase Dashboard's **Authentication → Users** interface or the server-only Auth Admin API, with an appropriately verified/confirmed email. Copy its user ID. Do not insert directly into `auth.users`.
2. Through the Dashboard SQL editor or another trusted admin-only database operation, insert that ID into `public.admin_profiles`:

   ```sql
   insert into public.admin_profiles (id, phone, theme)
   values ('<copied-auth-user-id>'::uuid, null, 'light');
   ```

Keep public signup disabled in production Auth settings while keeping email login enabled. Provision only the owner; another Auth user is not an Admin unless a trusted operation explicitly adds its Profile. There is no browser provisioning endpoint, and authenticated clients cannot insert/delete Profiles or change their IDs. They may update only phone and the `light`/`dark` theme.

`private.is_active_admin()` checks the current Auth user, its allowlisted Profile, and the JWT's session ID against `auth.sessions`. Profile RLS uses this predicate on reads and updates so original, unexpired JWTs lose data access after their session is revoked. The private schema is not exposed by the Data API; the function has a fixed empty search path and only the authenticated execution grant needed by RLS. Later Admin data policies must reuse this predicate. Apply migrations to staging and then production through the documented deployment process; the local commands above do not configure or modify a hosted project.

Password reset requires an Auth-verified recovery session and an active provisioned Admin Profile. It saves a matching 12–128 character password, globally signs out all Admin sessions (including recovery), and offers fresh sign-in. Existing JWTs immediately lose protected data access through the live-session RLS predicate. If ending sessions fails after saving, the form reports incomplete reset and accepts the same password again to finish revocation. Run `npm test -- tests/integration/password-reset.test.ts tests/components/password-reset.test.tsx` for the local Mailpit journey, expired/reused link checks, and two-session revocation proof.

### Profile and browser verification

Profile shows the verified Admin email and saves an optional phone number and light/dark preference through active-session RLS. Authenticated password changes require matching 12–128 character values. The local Auth provider was observed to end other existing Admin sessions after a password change. Profile Sign out revokes only the current device; other Admin sessions remain active. Failed operations retain feedback and permit retry; an uncertain sign-out result is never presented as success. The shared shell keeps Profile last, with a phone menu, collapsible tablet rail, and wide sidebar. DM Sans is hosted locally under its included Open Font License.

Run `npm test -- tests/components/admin-shell-profile.test.tsx tests/integration/admin-profile.test.ts` for focused checks. Install the browser with `npx playwright install chromium`, then run `npm run test:e2e`. Playwright starts a production build on port 1437 against the isolated local stack and checks keyboard navigation, theme/phone persistence, password change, local sign-out, another active device, and compact/medium/wide layouts with 200% CSS scaling. It creates and removes temporary Auth fixtures. Run `npm run lint`, `npx tsc --noEmit`, `npm test`, and the browser suite separately; the production build does not run lint.

These checks do not qualify paused-booth return, Booth Access Grants, integrated cross-device Booth behavior, or physical printing. Those remain with #10 after the #17 development gate, and target iPad launch validation remains separate. Issue #14 also requires the separate Draft Event management spec.
