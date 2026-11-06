# Apricot Studio implementation evidence — 2026-11-04

Historical evidence copied from the former presentation guide. The statements below describe the November 4 implementation and its limits; they are not a pass for the [November screen reference](../superpowers/plans/2026-10-24-issue-10-implementation-plan.md#screen-reference-and-presentation-contract). Original context is retained in Git revision `969e27eaa9082992ed58bbacd1b8c32c4393fbf0`.

This section records how the running application applies the system. It changes no behavior, copy contract or release gate.

- **Tokens and font.** `src/styles/globals.css` defines the then-current Apricot light and dark roles for `.admin-shell`, `.public-auth` and the Profile theme previews, plus `--color-primary-on-muted` (light `primary-hover`, dark `primary`) for brand text on `surface-muted`. `src/app/layout.tsx` loads DM Sans 400/500/600 through `next/font/google`, which self-hosts the files at build time.
- **Booth tone.** `src/features/booth/booth.module.css` sets `data-tone="light"` only for the default welcome and `data-tone="dark"` for every other phase, the paused entry and the setup handoff surface. The welcome shows the bundled `WelcomeIllustration` SVG (decorative, `aria-hidden`) in place of the old empty frame, a small Photo Booth wordmark and a full-width pill Start with an arrow icon. The wordmark hides below 500 px height so touch targets keep their size.
- **Admin shell.** Cream sidebar and compact header; active destination uses `surface-muted` with a 3 px `primary` start border. Brand icon uses `primary`.
- **Live Event panel.** Open sections separated by `border-subtle` rules; the then-current accounting strip; equipment rows with Lucide icons and status dots paired with text; Pause/Finishing run status in a `warning-soft` box; blockers in a `warning-soft` list.
- **Primitives.** Buttons, fields and alerts use `radius-md` (12 px); dialogs and grouped surfaces use `radius-lg` (16 px); badges are pills with a status dot. Shadows appear only on dialogs. Empty states use a dashed `border` on `primary-soft`.
- **Copy.** Profile's appearance note now reads "Booth Mode sets its own appearance for each screen." because the welcome is no longer dark. No other visible text changed.

Verification on 2026-11-04 (local, Chromium via Playwright):

- `tsc`, ESLint, Prettier and 443 unit/component tests passed. The Booth simulator suite (`playwright.booth.config.ts`, 820×1180 and 1180×820) passed 2/2.
- A temporary screenshot sweep covered Dashboard, Events, Event detail, New Event, History and Profile in light and dark themes at 390×844, 820×1180, 1180×820 and 1440×1000, plus Booth welcome, preview and paused at 390×844, 820×1180 and 1180×820. No page had horizontal overflow, and computed `font-family` resolved to DM Sans.
- Database-backed suites (`playwright.config.ts`, `playwright.admin-booth.config.ts`) had failures that also occur on the baseline commit `ab3d289` with these changes stashed. The local database held a leftover Live Event that violates `events_one_live_idx`. Those suites need a clean local stack to give a verdict on this change.
- Not verified: actual iPad A16/Bluefy rendering, media-backed welcome contrast, screen readers and 200% zoom on the redesigned screens.
