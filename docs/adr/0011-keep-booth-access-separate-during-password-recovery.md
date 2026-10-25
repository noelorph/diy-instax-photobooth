# Keep Booth access separate during Admin password recovery

**Status:** Historical decision with the current retained scope below. [ADR-0025](0025-package-accounting-and-booth-recovery.md) supersedes its old product behavior; [ADR-0029](0029-remove-legacy-features-and-reset-development-schema.md) removes legacy implementation and preservation requirements.

Password recovery grants no Booth authority. Current Admin-session revocation stays separate from device grants; ordinary pause/fault recovery requires no local Admin sign-in. Exceptional replacement uses the current protected handoff rules.

The detailed original decision is available with `git show 1de2272:docs/adr/0011-keep-booth-access-separate-during-password-recovery.md`. It is not a current work order. Use the [current contract](../superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md) for exact guards and interfaces.
