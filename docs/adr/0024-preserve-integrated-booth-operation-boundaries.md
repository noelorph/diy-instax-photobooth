# Preserve integrated Booth operation boundaries

**Status:** Historical decision with the current retained scope below. [ADR-0025](0025-package-accounting-and-booth-recovery.md) supersedes its old product behavior; [ADR-0029](0029-remove-legacy-features-and-reset-development-schema.md) removes legacy implementation and preservation requirements.

Keep one-send dispatch, independent pending attempts, origin protections and bounded metadata-only Capture reconciliation through the current #9 contract. Old Test/quality-correction behavior, reconnect revocation and same-photo/local-takeover recovery are removed. Earlier test results describe their original revision only.

The detailed original decision is available with `git show 1de2272:docs/adr/0024-preserve-integrated-booth-operation-boundaries.md`. It is not a current work order. Use the [current contract](../superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md) for exact guards and interfaces.
