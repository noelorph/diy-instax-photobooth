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

This repository currently contains a Next.js 16 starter app and the product/design documentation. Install dependencies with `npm ci`, then run `npm run dev` and open `http://localhost:3000`. For local HTTPS device testing, place your certificate key at `certificates/booth-key.pem` and certificate at `certificates/booth.pem`, then run `npm run dev:https`. Open `https://localhost:3000` on the development computer or use the network URL printed by Next.js on the test device. The certificate must be trusted by the device and valid for the address used. The `certificates/` directory is ignored by Git; do not commit private keys. See [ADR-0013](docs/adr/0013-use-optional-https-for-local-device-testing.md). Available checks include `npm run lint`, `npm run format:check`, and `npm test`. The authentication, Admin, and Booth Mode flows described in the guides are not yet implemented.

### Local Auth and database

With Docker running, run `npx supabase start`. This checkout uses the isolated `diy-instax-admin` project: API at `http://127.0.0.1:55321`, database on port `55322`, Studio at `http://127.0.0.1:55323`, and the Mailpit test inbox at `http://127.0.0.1:55324`. The pinned CLI applies the versioned migrations when starting a fresh stack. After adding a migration, use `npx supabase migration up --local`.

Run the Auth/Data API checks with `npm test -- tests/integration/admin-authorization.test.ts`. The fixtures discover only this local stack, reject any other API address, create temporary Auth users through its Admin API, allowlist only each test's Admin, and clean up the users and their Profiles/sessions. They never read application environment credentials. `npm test` includes these integration tests and therefore needs this local stack running. Inspect local database security with `npx supabase db advisors --local`.

Public registration is disabled by `[auth].enable_signup = false`. Keep `[auth.email].enable_signup = true`: that setting enables the email provider, including existing-user login. Approved local recovery callback URLs are listed explicitly in `supabase/config.toml`; production must configure its own exact application callback URL and SMTP delivery.

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
