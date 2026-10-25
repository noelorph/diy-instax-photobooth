# F1 — Admin Access and Account Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Required throughout:** Use **ponytail:ponytail, full** for every task. Preserve working Auth/Profile behavior and extend the existing components; do not replace the authentication stack.

**Goal:** The Admin can securely sign in, recover access, manage preferences/password and sign out from the current device.

**Architecture:** Retain Supabase Auth, the provisioned Admin/live-session RLS boundary and existing server actions. Complete the approved presentation and failure paths in the current Auth/Profile/shell files. F4 consumes these session boundaries; F6 consumes exceptional authenticated setup.

**Tech Stack:** Installed Next.js/React/TypeScript, Supabase Auth, existing UI primitives, Vitest/Playwright.

**Spec:** [Approved design, F1](../specs/2026-10-24-issue-10-functional-breakdown-design.md#f1-admin-access-and-account-management). Parent #10; #9 prerequisite satisfied; no additional capability prerequisite. [Plan index and shared execution rules](2026-10-24-issue-10-implementation-plan.md).

## Global Constraints

- #9 passed on reviewed candidate `2f89a96` and is closed. Verify the index evidence; this plan is approved, but publication and implementation are on hold at the user's request.
- Reset succeeds only after a different password and confirmed global Admin-session revocation. Profile sign-out is local; an independent Booth grant survives both.
- No public signup, Client account, new role or authentication-driven automatic Booth start.
- Use [DESIGN_SYSTEM.md](../../../DESIGN_SYSTEM.md), [screen map](../../design/2026-10-21-package-recovery/screen-map.md), sheets [08 authentication](../../design/2026-10-21-package-recovery/admin/08-authentication.png), [10 profile](../../design/2026-10-21-package-recovery/admin/10-profile.png), [11 feedback](../../design/2026-10-21-package-recovery/admin/11-dialogs-feedback.png) and shared shell in [01 dashboard](../../design/2026-10-21-package-recovery/admin/01-dashboard.png).

Follow the [shared command/environment table](2026-10-24-issue-10-implementation-plan.md#verification-and-environment-rules). Update this capability’s rows in the [acceptance trace](../../implementation/issue-10-retirement-and-acceptance.md#acceptance-trace) with actual revision/command/result before closure; pending rows are not passing evidence.

**Complete removal:** [ADR-0029](../../adr/0029-remove-legacy-features-and-reset-development-schema.md) applies. Delete this capability's obsolete UI, actions, routes, validation, helpers, exports and success fixtures/tests as their current flows become ready; update every shared caller. Retain no legacy reader, denial-only route or version-1 fallback. Record shared SQL dependencies for F8's package-only baseline. Reuse #9's current contracts and safety tests; do not redesign them.

## Review Focus

1. Known and unknown recovery addresses yield the same account-independent response — task 1.
2. A password change followed by lost/failed revocation never claims reset success — task 1.
3. A revoked but unexpired Admin JWT cannot read protected data — task 1.
4. Local sign-out failure preserves actionable status and does not sign out the phone — task 2.
5. Keyboard menu closure, dark exceptional sign-in and saved-theme refresh remain usable — task 3.

## File map

| Responsibility | Modify/reuse                                                                                                                                                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth/recovery  | `src/features/admin/auth/{actions,reset-action,recovery-session,booth-return,state,reset-state}.ts`, `{forms,reset-form}.tsx`, `auth-form.module.css`; `src/app/auth/callback/route.ts`; `src/app/(auth)/{sign-in,forgot-password,reset-password}/page.tsx` |
| Authorization  | `src/lib/auth/require-admin.ts`, `src/lib/supabase/{server,proxy}.ts`, `src/proxy.ts` — preserve current boundaries                                                                                                                                         |
| Profile/shell  | `src/features/admin/profile/{actions,read,state}.ts`, `profile.tsx`, `profile.module.css`; `src/features/admin/app-shell.tsx`; `src/components/layout/{admin-shell,admin-navigation,auth-frame}.tsx` and corresponding existing CSS                         |
| Tests          | Existing Auth/reset/Profile integration/component tests, `tests/e2e/admin-profile.spec.ts`, `admin-ui-refresh.spec.ts`, `native-zoom.spec.ts`                                                                                                               |

## Task 1: Finish sign-in and truthful password recovery

**Files:** Auth/authorization rows above; `tests/integration/{admin-auth-actions,admin-authorization,password-reset}.test.ts`; `tests/components/{admin-auth,password-reset}.test.tsx`; `tests/components/admin-return.test.ts`.

**Interfaces:** Keep `signIn(state: AuthFormState, data: FormData): Promise<AuthFormState>`, `requestRecovery(state: AuthFormState, data: FormData): Promise<AuthFormState>`, `resetPassword(state: ResetState, data: FormData): Promise<ResetState>` and `requireAdmin(): Promise<{userId: string; sessionId: string}>`. Existing `consumeBoothReturn(authorize)` accepts only a validated setup destination; ordinary success is `/dashboard`.

- [ ] Extend the existing fixtures only for uncovered cases: neutral recovery for known/unknown addresses; invalid/expired/reused links; same-password rejection; active recovery session after revocation failure; lost revocation response requiring a new link; revoked JWT; forged return destination. Test oracle in the existing reset fixture:

  ```ts
  expect(result.confirmation).toBeUndefined();
  expect(result.requiresNewLink || result.revocationIncomplete).toBe(true);
  expect(result.error).toMatch(/incomplete|could not confirm/);
  ```

- [ ] Run `npm test -- tests/integration/admin-auth-actions.test.ts tests/integration/admin-authorization.test.ts tests/integration/password-reset.test.ts tests/components/admin-auth.test.tsx tests/components/password-reset.test.tsx tests/components/admin-return.test.ts`. Existing behavior should pass; any new gap must fail for its stated assertion before editing.
- [ ] Complete only uncovered behavior and the authentication sheets. Preserve neutral email copy, field values on failure, duplicate-submit protection, persistent status and focus. Do not expose credentials/tokens in HTML/logs or change #9's authorization fix.
- [ ] Rerun the task command; expect all selected tests to pass. Verify reset/session revocation leaves the seeded independent Booth grant valid through the real integration fixture.
- [ ] Commit changed task files with `feat: complete admin access and recovery`; skip an empty commit if existing behavior already satisfies the task.

## Task 2: Complete Profile edits and current-device sign-out

**Files:** Profile row above; `tests/integration/admin-profile.test.ts`; `tests/components/admin-shell-profile.test.tsx`; `tests/e2e/admin-profile.spec.ts`.

**Interfaces:** Preserve `readAdminProfile(): Promise<ProfileData>` and `saveProfile`, `changePassword`, `signOut`, each `(state: ProfileState, data: FormData) => Promise<ProfileState>`. `ProfileData = {email: string; phone: string | null; theme: 'light' | 'dark'}`. F4 must use its existing handoff endpoint for handoff sign-out, not duplicate it with this Profile action.

- [ ] Pin failed preference save, invalid/blank phone, password confirmation, theme persistence and ambiguous sign-out in existing tests. In a two-session integration case, sign out one device and assert:

  ```ts
  expect((await phone.client.from('admin_profiles').select('id')).data).toHaveLength(1);
  expect((await signedOutDevice.from('admin_profiles').select('id')).data).toEqual([]);
  ```

  Use the fixture's separate authenticated clients; also verify the independent Booth grant is unchanged.

- [ ] Run `npm test -- tests/integration/admin-profile.test.ts tests/components/admin-shell-profile.test.tsx`; identify uncovered failures, retaining already passing security cases.
- [ ] Complete the Profile sheet using existing forms/actions. Keep the verified email read-only, optional phone, saved theme and authenticated password change. Report unknown sign-out outcome persistently; do not redirect as if success were confirmed.
- [ ] Rerun focused tests and `npx playwright test --config playwright.config.ts tests/e2e/admin-profile.spec.ts`; expect pass with saved values surviving reload and local-only logout.
- [ ] Commit changed files with `feat: complete profile and local sign out`.

## Task 3: Finish shared navigation and accessible account presentation

**Files:** Shell/Auth/Profile presentation rows; `tests/components/admin-ui-primitives.test.tsx`, `admin-shell-profile.test.tsx`; `tests/e2e/admin-ui-refresh.spec.ts`, `native-zoom.spec.ts`.

**Interfaces:** Preserve `AdminShell` and existing shared form/status components' public props; extend a shared component only for a required state. Navigation remains Dashboard, Events, History, Profile, in that order. No new route or reusable form framework.

- [ ] Add missing presentation assertions using existing test fixtures: navigation order/current destination, compact menu Escape/focus restoration, 200% zoom without clipped controls, saved Admin theme and dark exceptional Booth sign-in. Representative browser oracle:

  ```ts
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /menu/i })).toBeFocused();
  ```

- [ ] Run `npm test -- tests/components/admin-ui-primitives.test.tsx tests/components/admin-shell-profile.test.tsx`; new missing interactions must fail meaningfully.
- [ ] Align existing tokens/layouts with the specified sheets. Preserve skip navigation, labels, non-color feedback, focus/status announcements, keyboard access and reduced motion; avoid broad restyling beyond these surfaces.
- [ ] Run the component command and `npx playwright test --config playwright.config.ts tests/e2e/admin-ui-refresh.spec.ts tests/e2e/native-zoom.spec.ts tests/e2e/admin-profile.spec.ts`; then changed-file lint/type/format checks from the index. Expected: pass; record the tested revision and any reused passing cases.
- [ ] Commit with `feat: align admin account presentation and navigation`.

**Done:** Complete authenticated and recovery journeys pass through real Auth/RLS, account values persist, phone/Booth isolation holds, and required presentation/accessibility checks pass. No #9 fix, lifecycle implementation, database rebuild or physical release belongs to F1.
