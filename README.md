# DIY Instax Photo Booth

**2026-10-27 F2 implementation and availability:** [ADR-0032](docs/adr/0032-build-full-f2-with-uploads-unavailable.md) restores the original full F2/#30 implementation target, including the dormant editor and private delivery. Runtime uploads remain temporarily unavailable under ADR-0031, with trusted upload/attachment/replacement denials intact. Full #30 acceptance still requires supported cleanup proof and enabled transfer/failure/concurrency/private-delivery/playback qualification; the disabled-scope evidence is unchanged. The Admin Event Media page must visibly remind the Admin that interrupted/late uploads and leftover files need cleanup verification before re-enabling. F3–F8 may proceed against the verified upload-disabled F2 milestone; #30 stays in #10, remains open and is completed last as the final blocker to #10 closure.

An Event photo booth with an Admin application and Guest-facing `/booth`. The target release uses iPad A16, Bluefy and Instax Mini Link 3, subject to physical qualification.

## Current status

**The 2026-10-21 package-accounting and recovery design is approved.** Version-2 database contracts, trusted handlers and a provisional simulator/one-send path are verified for the #9 software prerequisite. F4 Booth setup and F5 Guest capture-to-print use these contracts; see [local F5 evidence and remaining gates](docs/implementation/issue-10-retirement-and-acceptance.md#f5-guest-capture-to-print-evidence--2026-11-04). Issue #10 still owns F6 recovery, F7 reporting, complete legacy removal and a fresh package-only schema under [ADR-0029](docs/adr/0029-remove-legacy-features-and-reset-development-schema.md). The [issue #9 verification record](docs/implementation/issue-9-package-contracts-review.md) records passing software checks on `2f89a96` and retained failures; GitHub #9 is closed as completed. No hosted deployment or new hardware trial has occurred.

The target gives ten prints per booked/additional Film Package, counts confirmed full ejection once and keeps unknown attempts pending. Equipment recovery and phone Admin pause/resume keep the iPad in Booth Mode. Physical reload confirmation is separate from buying packages. Finish Booth Mode precedes Complete Event. See the [full route and flow guide](docs/booth-user-flow.md).

Real printer-backed Booth Mode remains disabled until automatic normal full-ejection completion and required recovery procedures are physically qualified, followed by the actual iPad release trial. The [existing iPhone evidence](docs/qualification/issue-17-trial-report.md) is partial. Printer count is never inventory. Manual inspection is exceptional recovery, not normal per-print completion.

The [#10 functional design](docs/superpowers/specs/2026-10-24-issue-10-functional-breakdown-design.md) and [Draft-only Event Media limits](docs/adr/0027-draft-only-event-media.md) were approved on 2026-10-24. The [main plan and eight capability plans](docs/superpowers/plans/2026-10-24-issue-10-implementation-plan.md) were revised and approved on 2026-10-25 with an [acceptance trace](docs/implementation/issue-10-retirement-and-acceptance.md), explicit test environments and early handoff/media proofs. The user clarified on 2026-10-25 that [monthly Events includes Draft, Live and Completed and excludes Cancelled](docs/adr/0028-define-monthly-event-count.md). The plan is approved. The approved documentation was committed as `0bd7503`, then the user authorized GitHub publication. F1–F8 are published as #29–#36; F1, F3 and F4 have implementation evidence; F5 Guest capture-to-print is implemented locally with [dated evidence and open verification limits](docs/implementation/issue-10-retirement-and-acceptance.md#f5-guest-capture-to-print-evidence--2026-11-04). F6–F8 remain open; full F2 dormant implementation may continue under ADR-0032 with uploads disabled under ADR-0031; F3–F8 may proceed against the verified upload-disabled F2 milestone; #30 stays in #10, remains open and is completed last as the final blocker to #10 closure. The #9 software checks and independent evidence review passed; GitHub #9 is closed as completed.

## Read first

- [Replacement contract](docs/superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md): transitions, formulas, access/database rules, target APIs and recovery.
- [PRD](PRD.md), [architecture](ARCHITECTURE.md), [glossary](GLOSSARY.md), [design system](DESIGN_SYSTEM.md).
- [ADR-0025](docs/adr/0025-package-accounting-and-booth-recovery.md): decisions and supersession map; [ADR-0026](docs/adr/0026-order-captures-by-shutter-time.md): shutter-time Capture ordering and explicitly selected ties.
- [Proof checklist](docs/qualification/booth-recovery-proof-checklist.md): known observations, unproven work, pass criteria and fallbacks.
- [Approved Apricot Studio direction](docs/design/2026-11-04-apricot-studio/README.md): orange/apricot colors and smaller DM Sans typography for Admin and Booth under [ADR-0033](docs/adr/0033-adopt-apricot-studio-design-system.md); implemented in the application on 2026-11-04, with actual-iPad verification pending. The [October 21 gallery](docs/design/2026-10-21-package-recovery/index.html) and [screen notes](docs/design/2026-10-21-package-recovery/screen-map.md) retain package/recovery state coverage, with superseded visual styling.
- [Documentation index](docs/README.md): active guides versus historical artifacts.
- [Documentation review](docs/documentation-review.md): historical approval record; [implementation review](docs/implementation/issue-9-package-contracts-review.md): current software evidence and #10 handoff.
- [GitHub issue publication record](docs/github-issue-update-drafts.md): accepted #9 and the published #10 complete-removal scope, child links and dependency verification. #17/#7 drafts remain unpublished.

## Local development of existing code

The [existing implementation guide](docs/implementation/issue9-local-development.md) documents current local Auth/Supabase setup and the boundary between existing code and the planned fresh schema. Start with `npm ci`, configure the local environment/stack as documented there, then `npm run dev`. Optional trusted-device HTTPS uses `npm run dev:https`; never commit certificate keys or credentials.

Current development uses Next.js/React/TypeScript and Supabase; shared UI lives in `src/components/{ui,shared,layout}`. Read installed framework guides before code changes. Local version-2 migrations have not been activated on a hosted database; the physical release gate remains closed.

### Interactive browser tooling

`npm ci` also installs the pinned Playwright CLI development dependency. Coding agents can use the project-local [Playwright CLI skill](.agents/skills/playwright-cli/SKILL.md) for interactive local UI inspection and simulator exploration:

```bash
npx --no-install playwright-cli --help
npx --no-install playwright-cli -s=photobooth open http://localhost:3000
npx --no-install playwright-cli -s=photobooth snapshot
npx --no-install playwright-cli -s=photobooth close
```

Start the local application first using the setup above. The CLI uses a separate Playwright runtime from the existing test runner and may need its own browser installation; follow `npx --no-install playwright-cli install-browser --help` if a browser is missing. Generated workspace/session artifacts in `.playwright/` and `.playwright-cli/` are ignored by Git; keep saved authentication state and other sensitive artifacts there.

CLI use is optional during development. CI continues to run the existing Playwright Test suites; interactive CLI sessions add no separate CI step or acceptance gate. Add repeatable regressions discovered during exploration to those suites. Browser and simulator results do not replace physical printer or actual-iPad qualification.

The approved removal decision applies to disposable development/test data. Obsolete specs/plans and source mockups now live only in Git history at checkpoint `1de2272`. Current #9 contracts, package-era History, safe Draft cleanup and physical qualification evidence remain. F8 will replace the migration chain and reverify security/accounting and the full application; this docs change performs no reset or code changes.
