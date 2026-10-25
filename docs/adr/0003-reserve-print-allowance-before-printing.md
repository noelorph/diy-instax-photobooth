# Reserve print allowance before printing

**Status:** Historical decision with the current retained scope below. [ADR-0025](0025-package-accounting-and-booth-recovery.md) supersedes its old product behavior; [ADR-0029](0029-remove-legacy-features-and-reset-development-schema.md) removes legacy implementation and preservation requirements.

One unresolved current Print Attempt holds one package-derived print and the printer slot. Confirmed full ejection counts once, including unusable output; uncertainty holds capacity and never triggers an automatic resend. The independent allowance, stock and quality-refund model is removed.

The detailed original decision is available with `git show 1de2272:docs/adr/0003-reserve-print-allowance-before-printing.md`. It is not a current work order. Use the [current contract](../superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md) for exact guards and interfaces.
