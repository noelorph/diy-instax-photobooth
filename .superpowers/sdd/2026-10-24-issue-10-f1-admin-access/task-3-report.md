# Task 3 — Shared navigation and account presentation

## Scope

Viewed approved `admin/01-dashboard.png` and `admin/11-dialogs-feedback.png` before implementation. Replaced the old stacked Instax/photo-frame shell brand with the Camera / Photo Booth identity already used by AuthFrame. Navigation uses Home, calendar, clock and user outline icons, retains Dashboard → Events → History → Profile order/current-page selection, and separates Profile at the bottom with a divider and trailing chevron. The chevron is hidden in the collapsed medium rail. Existing 240px sidebar, compact native button menu, rail expansion, skip link, Escape handling, focus restoration and link semantics remain intact.

Shared FormFeedback now pairs persistent error/success/information text with CircleAlert/CircleCheck/Info icons using the existing Alert grid and semantic tokens. Icons are hidden from assistive technology; role, ref, tabIndex, focus and announcement behavior remain unchanged. Reviewed callers across Auth, Profile, Draft, page-loading, Events, History and operations; no caller signatures or state logic changed.

Browser inspection found the Save preferences button touching the next Profile card. Added the missing 24px form-bottom spacing. The supplemental CSS-200% check at 390px exposed real horizontal overflow in the Appearance fieldset/previews: enabled native flex wrapping with min-width zero and content-driven preview columns. The narrower layout retains all labels and controls. No Dashboard content, F2–F8 behavior, schema, dependency, hardware, root specification or ADR changes.

## RED → GREEN

At the task-approved shared presentation seam, added three parameterized cases requiring readable feedback text plus a decorative hidden icon for error/success/status. RED: all three failed because no SVG existed; the other 25 cases passed. Added the icons; GREEN: `npm test -- tests/components/admin-ui-primitives.test.tsx tests/components/admin-shell-profile.test.tsx` passed **28 tests**. Reused existing destination order/current route, nested Events selection, medium rail names, skip-link, compact Escape/focus restoration, feedback focus and Profile persistence/error tests instead of duplicating them.

## Browser evidence and corrections

Ran the requested combined command serially with existing isolated local Supabase (56321/56322), production build on 1437, one Playwright worker, and no schema reset. The sandbox attempt failed before any test because Supabase CLI could not write its telemetry file; the authorized elevated run started normally.

First completed run: **12 passed / 3 failed (7.0m)**. All six visual-contract cases (320/768/1440 × light/dark), all three real recovery/PKCE cases and all three native 200% zoom cases passed. The three Profile cases failed before screenshot capture because `getByLabel('Confirm new password')` matched both the input and its “Show confirm new password” button. Corrected the locator with `exact: true`; no product behavior change was needed.

Inspected compact light/dark Profile, medium light Profile, wide light/dark Profile, compact dark exceptional sign-in and ordinary sign-in screenshots. Ordinary sign-in captured an empty streamed panel because the helper waited only for the frame/fonts. Updated the helper to await the actual visible h1 before capture. Added dark exceptional sign-in capture at every width. Profile screenshots exposed the missing gap corrected above. Second combined run after the locator/readiness/spacing corrections: medium and wide Profile journeys passed; compact Profile reached screenshots and persisted state but failed its supplemental CSS-200% horizontal-overflow assertion. Gracefully interrupted the superseded run: **5 passed / 1 failed / 1 interrupted / 8 unrun**. Corrected appearance reflow as described above, without weakening the assertion. Targeted production-built `admin-profile.spec.ts --grep 390px`: **1 passed (31.0s including build)**. Added a supplemental CSS-200 screenshot to each Profile case. Final combined run on committed code **`5f414fe`**: **15 passed (6.7m)** using exactly:

```sh
npx playwright test --config playwright.config.ts tests/e2e/admin-ui-refresh.spec.ts tests/e2e/native-zoom.spec.ts tests/e2e/admin-profile.spec.ts
```

Final generated evidence was inspected: Profile light/dark at 390 and 1440, Profile CSS-200 at 390, ordinary sign-in at 320 (complete form after readiness correction), and exceptional dark sign-in at compact and wide sizes. The Save preferences / Change password gap is present; radio choices and preview cards stack at the narrow scaled size. Saved success has its check icon and persistent text. Navigation retains the reference icon/brand hierarchy and keyboard focus. Evidence remains under `test-results/admin-profile-sign-in-navi-*/` and `test-results/admin-ui-refresh-Admin-visual-contracts-at-*/`; these generated artifacts are untracked. Earlier failed runs are retained factually above, not represented as passes.

## Validation

- Component tests: 28 passed.
- Changed TypeScript ESLint: passed.
- `npx tsc --noEmit`: passed.
- Changed-file Prettier and `git diff --check`: passed.
- Final combined browser run on `5f414fe`: **15 passed (6.7m)**.
- Final component rerun after reflow correction: **28 passed**.
- No product-code changes followed the final tested commit; this report-only evidence update follows it.

## Limits

No hardware/iPad/Bluefy, screen-reader session, physical release gate or fresh-schema acceptance was performed. Dashboard/Events/History content remains outside Task 3; existing browser cases continue to exercise these callers for shared-shell/feedback regressions. The controller owns the final full Vitest run. No new product or technical decision was introduced.
