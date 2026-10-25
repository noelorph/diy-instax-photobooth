# Centralize accounting transitions and persist Booth pause requests

**Status:** Historical decision with the current retained scope below. [ADR-0025](0025-package-accounting-and-booth-recovery.md) supersedes its old product behavior; [ADR-0029](0029-remove-legacy-features-and-reset-development-schema.md) removes legacy implementation and preservation requirements.

Current mutations use private transactions, current authorization, stable operation receipts and the approved lock order. Pause is persisted independently from readiness; recovery never clears it. The old allowance/stock mutations and pause-triggered grant revocation are removed.

The detailed original decision is available with `git show 1de2272:docs/adr/0022-centralize-accounting-transitions-and-persist-pause-requests.md`. It is not a current work order. Use the [current contract](../superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md) for exact guards and interfaces.
