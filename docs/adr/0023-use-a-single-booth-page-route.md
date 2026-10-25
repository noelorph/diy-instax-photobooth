# Use `/booth` as the guest-facing page route

**Status:** Historical decision with the current retained scope below. [ADR-0025](0025-package-accounting-and-booth-recovery.md) supersedes its old product behavior; [ADR-0029](0029-remove-legacy-features-and-reset-development-schema.md) removes legacy implementation and preservation requirements.

The single `/booth` page remains the Guest and ordinary recovery route. Local sign-in is exceptional, not the normal response to pause or equipment faults. No separate Guest Event-ID page is introduced.

The detailed original decision is available with `git show 1de2272:docs/adr/0023-use-a-single-booth-page-route.md`. It is not a current work order. Use the [current contract](../superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md) for exact guards and interfaces.
