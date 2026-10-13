# Pre-gate Admin access and shell

**Status:** Proposed for owner review; implementation has not started.

## Intent and boundary

Deliver the independent Admin identity and navigation foundation allowed by [issue #14](https://github.com/noelorph/diy-instax-photobooth/issues/14), [PRD section 3](../../../PRD.md#3-development-and-launch-feasibility-gates), and [ADR-0012](../../adr/0012-qualify-development-on-iphone-before-ipad-launch.md) while [issue #17](https://github.com/noelorph/diy-instax-photobooth/issues/17) qualifies printing. This is the first of two pre-gate Admin specs; [Draft Event management](2026-10-13-draft-event-management-design.md) builds on its authorization boundary. Success means the sole Admin can authenticate, recover access, manage Profile, and navigate protected pages without any Booth or printing operation becoming available.

The first release's full Dashboard, Events, and History views remain assigned to [issue #10](https://github.com/noelorph/diy-instax-photobooth/issues/10). Until the Draft Event spec supplies the Events view, these three destinations are protected, clearly labeled foundation pages. Dashboard and History remain protected placeholders after that spec. They show no invented metrics, activity, Event history, or operational actions. Their presence in navigation does not imply the complete Admin system is ready.

## Public identity flows

- `/sign-in` contains labeled email and password fields, **Sign in**, and **Forgot password?**. It has no signup. Only the provisioned Admin identity may enter protected pages. Ordinary success goes to `/dashboard`. Invalid input, incorrect credentials, network failure, and expired session produce persistent, actionable feedback; incorrect credentials do not disclose whether an email exists.
- `/forgot-password` accepts an email, offers **Send recovery link** and a return to sign-in, and gives the same check-your-email response for known and unknown addresses. Delivery or connection failure permits retry without revealing account existence. The recovery redirect is restricted to approved application origins.
- `/reset-password` allows a valid, unused recovery link to set and confirm a secure new password. Invalid, expired, or reused links cannot change it and offer **Request another link**. Success revokes every Admin session, including the temporary recovery session, then requires password sign-in. A stale access token must not authorize a protected page or data operation after revocation: [Supabase global sign-out alone does not immediately invalidate issued access JWTs](https://supabase.com/docs/reference/javascript/auth-signout).
- The sole Admin is provisioned using Supabase Auth's dashboard or Admin API. There is no public or in-app provisioning endpoint. Public authentication and recovery pages never render the authenticated shell or Client details.

## Protected shell and Profile

- Every Admin page and data mutation checks the verified Auth identity, the provisioned Admin identity, and active-session status at the final data boundary. A navigation redirect or Next.js Proxy check is only an early guard. An unauthenticated or revoked session reaches `/sign-in` without protected content in HTML, server responses, or client hydration. Authenticated responses and cookie refreshes are private and uncached.
- The shared AppShell links Dashboard, Events, History, and Profile, with Profile last. It uses the [design system](../../../DESIGN_SYSTEM.md)'s light and dark semantic tokens: a wide sidebar, collapsible tablet rail, and phone menu. Auth pages use the public layout, not the AppShell. A keyboard or touch user can reach every destination and see the current page.
- `/profile` shows the Admin email and permits phone-number and light/dark preference updates, authenticated password change, and **Sign out**. The saved preference applies to Admin pages on later visits. Sign out uses local scope, ends this device's Admin session, and returns to `/sign-in`; another device remains signed in. A failed operation leaves the actual state clear and offers retry.
- The paused-booth sign-in context, Live Event return, and Booth Access Grant are deferred to the post-gate work. This foundation must not invent a paused Event or auto-resume path. Its routing and session code must not assume password reset is allowed to revoke a future Booth Access Grant; [ADR-0011](../../adr/0011-keep-booth-access-separate-during-password-recovery.md) keeps those scopes separate.

## Data and security contract

Use Supabase Auth with cookie-based server sessions and an `admin_profiles` record keyed to the provisioned Auth user. Store phone and theme preference there, with row-level security and least-privilege grants. A valid `authenticated` role alone does not establish Admin authorization. Profile reads and writes must be limited to the provisioned Admin and an active Admin session. Do not expose a service or secret key to the browser. Do not put Client contact, recovery tokens, or session secrets in logs or activity data. The Draft Event spec consumes the same authorization predicate and must not introduce a weaker shortcut.

The implementation plan must choose and document a concrete active-session check that rejects already-issued JWTs after global reset, including at the data boundary. Its tests must prove this across two independent sessions. Profile sign-out and password reset have deliberately different scopes.

## TDD acceptance and verification

Implement each behavior with a failing test first, observe the failure, make the smallest change that passes, then rerun the relevant test. Cover at least:

1. Signed-out, wrong-identity, expired, and globally revoked sessions cannot read Admin HTML or Profile data or mutate Profile, including direct requests that bypass navigation.
2. Valid sign-in reaches `/dashboard`; incorrect credentials use neutral feedback and preserve a retry path. There is no public signup route or action.
3. Known and unknown recovery requests have the same public confirmation. Invalid, expired, and reused recovery links cannot update the password.
4. A successful reset makes two previously active Admin sessions fail protected access immediately, including before their access JWTs expire; a fresh password sign-in works.
5. Profile phone and theme persist; authenticated password change reports success or a recoverable failure; local Sign out affects only the current device.
6. The shell works at compact, medium, and wide layouts, including keyboard focus, accessible names, light/dark contrast, loading/error states, and 200% zoom. Placeholder routes remain protected and contain no fake data or gated controls.

Use unit/component tests for form and shell states, Auth/database integration tests for authorization and revocation, and browser tests for the public-to-protected journeys. Follow the verification approach in [ARCHITECTURE.md section 8](../../../ARCHITECTURE.md#8-verification-and-delivery). Recovery email delivery needs a controlled test mailbox locally and configured production SMTP before release; a mocked request alone does not prove delivery.

## Completion and handoff

This spec is complete when its tested flows work independently of the printer trial and expose no gated operation. It supplies the authorization and AppShell contract to the Draft Event spec. Before claiming issue #14 complete, review the combined Admin change against both specs, resolve code-review findings, run fresh lint, type, unit/integration, and browser checks, and record deferred #10 and physical-device cases. Do not treat this foundation or issue #17's iPhone result as iPad release proof.
