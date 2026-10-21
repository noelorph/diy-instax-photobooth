# DIY Instax Photo Booth

An Event photo booth with an Admin application and Guest-facing `/booth`. The target release uses iPad A16, Bluefy and Instax Mini Link 3, subject to physical qualification.

## Current status

**The 2026-10-21 package-accounting and recovery design is approved.** Version-2 database contracts, trusted handlers and a provisional simulator/one-send path are implemented for local verification. The existing Admin and Booth screens still use legacy flows; issue #10 must connect them to these contracts and remove retired controls. The [issue #9 verification record](docs/implementation/issue-9-package-contracts-review.md) separates tested behavior from remaining checks. No hosted cutover or new hardware trial has occurred.

The target gives ten prints per booked/additional Film Package, counts confirmed full ejection once and keeps unknown attempts pending. Equipment recovery and phone Admin pause/resume keep the iPad in Booth Mode. Physical reload confirmation is separate from buying packages. Finish Booth Mode precedes Complete Event. See the [full route and flow guide](docs/booth-user-flow.md).

Real printer-backed Booth Mode remains disabled until automatic normal full-ejection completion and required recovery procedures are physically qualified, followed by the actual iPad release trial. The [existing iPhone evidence](docs/qualification/issue-17-trial-report.md) is partial. Printer count is never inventory. Manual inspection is exceptional recovery, not normal per-print completion.

## Read first

- [Replacement contract](docs/superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md): transitions, formulas, access/database rules, target APIs and recovery.
- [PRD](PRD.md), [architecture](ARCHITECTURE.md), [glossary](GLOSSARY.md), [design system](DESIGN_SYSTEM.md).
- [ADR-0025](docs/adr/0025-package-accounting-and-booth-recovery.md): decisions and supersession map.
- [Proof checklist](docs/qualification/booth-recovery-proof-checklist.md): known observations, unproven work, pass criteria and fallbacks.
- [Approved design mockups](docs/design/2026-10-21-package-recovery/index.html): the current visual reference for Admin, phone recovery and portrait Booth; [screen notes](docs/design/2026-10-21-package-recovery/screen-map.md).
- [Documentation index](docs/README.md): active guides versus historical artifacts.
- [Documentation review](docs/documentation-review.md): historical approval record; [implementation review](docs/implementation/issue-9-package-contracts-review.md): current software evidence and #10 handoff.
- [GitHub issue update drafts](docs/github-issue-update-drafts.md): local only, not published.

## Local development of existing code

The [existing implementation guide](docs/implementation/issue9-local-development.md) documents the inherited local Auth/Supabase and UI setup; its old product controls are historical. Start with `npm ci`, configure the local environment/stack as documented there, then `npm run dev`. Optional trusted-device HTTPS uses `npm run dev:https`; never commit certificate keys or credentials.

Current development uses Next.js/React/TypeScript and Supabase; shared UI lives in `src/components/{ui,shared,layout}`. Read installed framework guides before code changes. Local version-2 migrations have not been activated on a hosted database; the physical release gate remains closed.

The [archived design proposals](docs/archive/design-2026-10-20/README.md) retain the newer reference images from `development`. Their old controls and alternate fonts/colors are historical; active presentation remains in DESIGN_SYSTEM.md.
