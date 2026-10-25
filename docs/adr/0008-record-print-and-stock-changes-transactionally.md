# Record print and stock changes transactionally

**Status:** Historical decision with the current retained scope below. [ADR-0025](0025-package-accounting-and-booth-recovery.md) supersedes its old product behavior; [ADR-0029](0029-remove-legacy-features-and-reset-development-schema.md) removes legacy implementation and preservation requirements.

Current package/accounting transitions and receipts remain atomic under private transactional functions with current authority checked after locks. The stock ledger, independent allowance and correction operations are removed.

The detailed original decision is available with `git show 1de2272:docs/adr/0008-record-print-and-stock-changes-transactionally.md`. It is not a current work order. Use the [current contract](../superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md) for exact guards and interfaces.
