# Stop Booth Mode safely before a Print Reservation

**Status:** Historical decision with the current retained scope below. [ADR-0025](0025-package-accounting-and-booth-recovery.md) supersedes its old product behavior; [ADR-0029](0029-remove-legacy-features-and-reset-development-schema.md) removes legacy implementation and preservation requirements.

Stop before committed dispatch denies new work. A dispatch authorized first may still print and remains tracked to a reliable outcome. End the Guest interaction, dispose of the photo safely and preserve independent uncertain attempts. Same-photo retry and routine local takeover are removed.

The detailed original decision is available with `git show 1de2272:docs/adr/0014-stop-booth-before-print-reservation.md`. It is not a current work order. Use the [current contract](../superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md) for exact guards and interfaces.
