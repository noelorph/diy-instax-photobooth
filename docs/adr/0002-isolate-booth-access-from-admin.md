# Isolate Booth Mode access from the admin

**Status:** Historical decision with the current retained scope below. [ADR-0025](0025-package-accounting-and-booth-recovery.md) supersedes its old product behavior; [ADR-0029](0029-remove-legacy-features-and-reset-development-schema.md) removes legacy implementation and preservation requirements.

Admin authority remains separate from scoped Booth grants. Ordinary faults and pauses retain the grant; genuine access loss uses the approved protected replacement flow. Local Admin takeover after every interruption is removed.

The detailed original decision is available with `git show 1de2272:docs/adr/0002-isolate-booth-access-from-admin.md`. It is not a current work order. Use the [current contract](../superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md) for exact guards and interfaces.
