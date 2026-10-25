# Require internet during the first release

**Status:** Historical decision with the current retained scope below. [ADR-0025](0025-package-accounting-and-booth-recovery.md) supersedes its old product behavior; [ADR-0029](0029-remove-legacy-features-and-reset-development-schema.md) removes legacy implementation and preservation requirements.

Internet is required for the first release. A fault ends the Guest interaction and discards its photo; independent attempt metadata survives for reconciliation. Retaining the photo for same-photo retry is removed.

The detailed original decision is available with `git show 1de2272:docs/adr/0004-require-internet-for-first-release.md`. It is not a current work order. Use the [current contract](../superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md) for exact guards and interfaces.
