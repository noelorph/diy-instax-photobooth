# Keep operational history when deleting a Draft

**Status:** Historical decision with the current retained scope below. [ADR-0025](0025-package-accounting-and-booth-recovery.md) supersedes its old product behavior; [ADR-0029](0029-remove-legacy-features-and-reset-development-schema.md) removes legacy implementation and preservation requirements.

Delete only a never-started Draft without current run/attempt work. Remove private media and identifying fields, retain opaque audit/cleanup references, and report cleanup pending until actual removal succeeds. Package-era terminal History is retained. Existing disposable legacy records need no preservation or conversion.

The detailed original decision is available with `git show 1de2272:docs/adr/0016-keep-history-when-deleting-draft.md`. It is not a current work order. Use the [current contract](../superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md) for exact guards and interfaces.
