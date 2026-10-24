# Admin Access and Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the sole-Admin sign-in, recovery, Profile, and protected navigation foundation.

**Architecture:** Supabase Auth supplies cookie-based sessions. A single authorization predicate checks the provisioned Admin identity and live Auth session at the data boundary; Next.js pages and actions call a shared server guard. Public forms and the protected AppShell use one design system, while Dashboard, Events, and History begin as protected foundation pages.

**Tech Stack:** Next.js 16.4 App Router, React 19, TypeScript, Supabase Auth/Postgres/RLS, Vitest, React Testing Library, Playwright.

**Historical spec:** [Admin access and shell](../specs/2026-10-13-admin-access-and-shell-design.md)

## Global Constraints

- Only the provisioned Admin may access Admin data; no public signup or self-provisioning.
- Password reset revokes all Admin sessions, including access through still-unexpired JWTs; Profile Sign out revokes only the current device.
- Authentication and recovery pages reveal no Client or Event data and use neutral account-existence feedback.
- Dashboard, Events, and History are protected foundation pages until their own features land; they contain no invented metrics or operational controls.
- Booth Access Grants, Live Events, printing, and physical-device qualification are outside this plan.
- Local Supabase is the TDD target. Remote migrations follow the architecture's separate staging-first promotion after the project environment is identified.
- Run `npm ci` and read the relevant installed `node_modules/next/dist/docs/` guides before writing product or test code, as required by `AGENTS.md`.

## Review Focus

- A non-Admin Auth user with a valid JWT must be denied; Task 1 tests it at the database and Task 2 at the route.
- A revoked but unexpired JWT must fail direct data access; Task 1 tests it after a global sign-out.
- A recovery URL with a foreign redirect target or invalid code must not enter protected pages; Task 4 tests both.
- A failed local sign-out must leave Profile's actual signed-in state visible; Task 5 tests the failure path.
- Cookie-refresh or protected HTML responses must not be shared through caching; Task 2 checks headers.

---

## File structure

- `supabase/`: local Auth configuration and a versioned migration for `admin_profiles` plus the private active-Admin predicate. No Auth user is inserted by SQL.
- `src/lib/supabase/`: browser, server, and Proxy clients; no privileged key in client code.
- `src/lib/auth/`: one `requireAdmin()` guard and public Auth actions.
- `src/app/(auth)/`: sign-in, recovery request, and reset pages; `src/app/auth/callback/route.ts` exchanges recovery codes.
- `src/app/(admin)/`: protected AppShell, foundation pages, and Profile.
- `src/features/admin/`: focused forms, shell, and Profile components consuming semantic tokens in `src/styles/globals.css`.
- `tests/`: database/Auth integration tests, component tests, and Playwright journeys.

### Task 1: Local Auth and active-Admin data boundary

**Files:** Create `supabase/config.toml`, a CLI-generated migration under `supabase/migrations/`, `tests/integration/admin-authorization.test.ts`, and local test fixtures; update `README.md` with the one-time Admin provisioning sequence. Add pinned Supabase CLI/test dependencies to `package.json` and lockfile only if needed.

**Interfaces:** Produce `public.admin_profiles(id uuid, phone text, theme text)` and `private.is_active_admin() -> boolean`. The predicate checks `auth.uid()`, the allowlisted profile row, and the JWT `session_id` against `auth.sessions`. No client can insert a profile. Later RLS policies reuse this predicate.

- [ ] Write integration tests for provisioned Admin read/update, non-Admin denial, no anonymous access, no self-provisioning, and denial by an unexpired JWT after its session is removed. Assert that a second still-active session survives local sign-out.
- [ ] Run those tests against the local stack and confirm the expected failures before the migration exists.
- [ ] Initialize local Supabase, create the migration and least-privilege grants/RLS, and add a fixture that provisions Auth users through the Admin API then allowlists only the test Admin. Document the corresponding production sequence: create the sole Auth user through the Supabase dashboard/Admin API, then insert its ID into `admin_profiles` through an admin-only operation. Keep the predicate in a non-exposed schema with a fixed search path and revoked default `PUBLIC` execution.
- [ ] Run the integration tests; inspect RLS deny cases and Supabase database advisors. Commit this independently testable boundary.

### Task 2: Server sessions, route protection, and foundation pages

**Files:** Create `src/lib/supabase/{browser,server,proxy}.ts`, `src/lib/auth/require-admin.ts`, `src/proxy.ts`, `src/app/(admin)/layout.tsx`, and foundation pages at `/dashboard`, `/events`, `/history`; update `src/app/page.tsx`. Test under `tests/integration/admin-routes.test.ts`.

**Interfaces:** `requireAdmin(): Promise<{ userId: string; sessionId: string }>` verifies Auth claims, the allowlisted identity, and live session, then redirects/denies. Proxy refreshes cookies but is not the final authorization decision. Every protected data action calls the same guard or the Task 1 RLS predicate.

- [ ] Write failing route tests for signed-out, wrong-identity, expired, and revoked sessions; direct page requests; no protected HTML leakage; and private/no-store response behavior on Auth cookie refresh.
- [ ] Run the focused tests and confirm they fail for the missing guard/routes.
- [ ] Add SSR clients and the guard using the installed Next.js and Supabase SSR guides. Render truthful protected foundation pages with no fake data or gated action. Make `/` land on the appropriate public or protected entry.
- [ ] Run the focused tests and type check; commit the route boundary.

### Task 3: Sign-in and neutral recovery request

**Files:** Create `src/app/(auth)/sign-in/page.tsx`, `src/app/(auth)/forgot-password/page.tsx`, focused form/action modules in `src/features/admin/auth/`, and component tests in `tests/components/admin-auth.test.tsx`.

**Interfaces:** Sign-in succeeds only for the provisioned Admin and goes to `/dashboard`. Recovery request returns one public confirmation for known and unknown addresses. Approved recovery origins come from server configuration, never user input.

- [ ] Write failing component and action tests for labels, field errors, wrong credentials, connection failure, no signup, retry, and identical known/unknown recovery confirmation.
- [ ] Run those tests and confirm the expected failures.
- [ ] Add the forms and server actions with persistent errors, preserved email, pending-state duplicate prevention, and a fixed redirect origin. A valid non-Admin Auth login is signed out locally and denied.
- [ ] Run focused tests and an Auth integration test using local Mailpit for a recovery request; commit the public flows.

### Task 4: Password reset and global revocation

**Files:** Create `src/app/(auth)/reset-password/page.tsx`, `src/app/auth/callback/route.ts`, reset form/action modules, and `tests/integration/password-reset.test.ts`.

**Interfaces:** Exchange a valid recovery code for a temporary session, update the password, globally sign out, then require new password sign-in. Reject invalid/expired/reused codes and unapproved redirect targets.

- [ ] Write failing integration tests for valid reset, invalid/expired/reused link, mismatched passwords, foreign redirect, two existing sessions denied immediately after reset, and fresh sign-in success.
- [ ] Run the focused tests and confirm failure before the flow exists.
- [ ] Implement the callback and reset form against current Supabase PKCE guidance; keep recovery pages public and free of Admin data. Reuse Task 1's active-session predicate for immediate revocation.
- [ ] Run focused tests and a local Mailpit link journey; commit the recovery flow.

### Task 5: Responsive AppShell and Profile

**Files:** Create shell/Profile components in `src/features/admin/`, `src/app/(admin)/profile/page.tsx`, Profile actions, semantic styles in `src/styles/globals.css`, and `tests/components/admin-shell-profile.test.tsx`.

**Interfaces:** Profile reads/updates the allowlisted row via Task 1 RLS and Task 2 guard. It shows email, phone, saved light/dark preference, authenticated password change, and local-scope Sign out. Profile is last in every navigation layout.

- [ ] Write failing component and Auth integration tests for navigation order/current page, phone/theme persistence, actual authenticated password change and failure feedback, local Sign out preserving another device, failed sign-out state, keyboard access, compact/medium/wide menu behavior, and 200% zoom.
- [ ] Run focused tests and confirm failure.
- [ ] Implement the AppShell, semantic tokens, Profile page/actions, and accessible pending/error/success states. Keep Auth pages outside the shell.
- [ ] Run focused tests, type check, lint, and a Playwright sign-in → Profile → local Sign out journey at compact and wide widths; commit the working Admin foundation.

## Final verification and review

- [ ] Run the full lint, type check, unit/component, database integration, and Playwright suites against the local stack; check the build separately because Next.js 16 does not run lint during `next build`.
- [ ] Review the whole branch against the spec and issue #14, fix important findings, and rerun checks after fixes. Record which paused-booth, cross-device Booth, and physical-printer cases remain for #10/#17.
- [ ] Keep the Draft Event plan separate. Do not claim issue #14 complete until both approved specs pass final review and verification.
