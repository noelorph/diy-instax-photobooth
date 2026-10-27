# Design documentation

**Current F2 scope — 2026-10-27:** [ADR-0032](../adr/0032-build-full-f2-with-uploads-unavailable.md) restores full F2/#30 implementation, including the dormant media editor and private delivery, while runtime uploads remain unavailable. Preserve media sections/designs, disabled controls, trusted mutation denials, private access/retention and prior-authorized cleanup-pending safeguards. The Admin Event Media page must visibly state that interrupted/late uploads and leftover files need cleanup verification before re-enabling. Supported cleanup and enabled transfer/failure/concurrency/private-delivery/playback qualification remain required for full #30 acceptance; existing disabled-scope evidence is unchanged. F3–F8 may proceed against the verified upload-disabled F2 milestone; #30 stays in #10, remains open and is completed last as the final blocker to #10 closure.

Use the root [DESIGN_SYSTEM.md](../../DESIGN_SYSTEM.md) for current presentation and [PRD.md](../../PRD.md) for behavior.

## Approved current mockups

Open the [October 21 visual gallery](2026-10-21-package-recovery/index.html) or [mockup guide](2026-10-21-package-recovery/README.md). The new set covers the full Admin system, phone management and recovery, portrait iPad Booth screens and paired recovery examples. It follows the approved package-accounting/recovery contract and current Geist/teal design system.

The user approved this set on 21 October 2026. These are approved visual references; implementation is pending. [Screen notes](2026-10-21-package-recovery/screen-map.md) map them to the [current route and flow guide](../booth-user-flow.md). Hardware qualification remains governed by the current proof checklist.

## Superseded material

The October 20 mockups, source prompts and alternate tokens were removed under ADR-0029. They remain in Git checkpoint `1de2272`; use the current package-model gallery for implementation. History has no legacy-total variant and Draft setup has no conversion-review screen.
