# Design documentation

**Current F2 scope — 2026-10-27:** [ADR-0032](../adr/0032-build-full-f2-with-uploads-unavailable.md) restores full F2/#30 implementation, including the dormant media editor and private delivery, while runtime uploads remain unavailable. Preserve media sections/designs, disabled controls, trusted mutation denials, private access/retention and prior-authorized cleanup-pending safeguards. The Admin Event Media page must visibly state that interrupted/late uploads and leftover files need cleanup verification before re-enabling. Supported cleanup and enabled transfer/failure/concurrency/private-delivery/playback qualification remain required for full #30 acceptance; existing disabled-scope evidence is unchanged. F3–F8 may proceed against the verified upload-disabled F2 milestone; #30 stays in #10, remains open and is completed last as the final blocker to #10 closure.

Use the root [DESIGN_SYSTEM.md](../../DESIGN_SYSTEM.md) for current presentation and [PRD.md](../../PRD.md) for behavior.

## Approved current direction

The user approved [Apricot Studio](2026-11-04-apricot-studio/README.md) on 4 November 2026: warm orange/apricot colors, smaller DM Sans typography, a light default welcome and dark camera/review/operational surfaces. [ADR-0033](../adr/0033-adopt-apricot-studio-design-system.md) records the visual decision. The root design system supplies exact tokens, sizing and accessibility rules. Application implementation and rendered verification are pending.

## Package/recovery state coverage

The [October 21 gallery](2026-10-21-package-recovery/index.html) and [mockup guide](2026-10-21-package-recovery/README.md) cover the full Admin system, phone management/recovery, portrait iPad Booth states and paired recovery examples. Their Geist/teal styling and all-dark Booth policy are superseded by Apricot Studio; retain these images and their provenance as dated references for the agreed behavior.

F1, F3 and F4 have implementation evidence and F5 is implemented locally with [dated evidence and open verification limits](../implementation/issue-10-retirement-and-acceptance.md#f5-guest-capture-to-print-evidence--2026-11-04). Full F2 and F6–F8 acceptance remain open. [Screen notes](2026-10-21-package-recovery/screen-map.md) map the package/recovery states to the [current route and flow guide](../booth-user-flow.md). The visual approval changes no product behavior or hardware gate.

## Superseded material

The October 20 mockups, source prompts and alternate tokens were removed under ADR-0029. They remain in Git checkpoint `1de2272`; use the current design system for presentation and the package/recovery screen notes for behavior. History has no legacy-total variant and Draft setup has no conversion-review screen.
