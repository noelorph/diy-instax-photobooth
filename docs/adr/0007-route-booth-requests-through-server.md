# Route Booth Mode requests through the server

**Status:** Historical decision with the current retained scope below. [ADR-0025](0025-package-accounting-and-booth-recovery.md) supersedes its old product behavior; [ADR-0029](0029-remove-legacy-features-and-reset-development-schema.md) removes legacy implementation and preservation requirements.

Booth requests pass through trusted server handlers. Current scoped grants, authorization and private transactions remain; old allowance/stock routes are removed.

The detailed original decision is available with `git show 1de2272:docs/adr/0007-route-booth-requests-through-server.md`. It is not a current work order. Use the [current contract](../superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md) for exact guards and interfaces.
