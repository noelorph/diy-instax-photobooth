# Carry Film Stock across Events

> **Current scope (2026-10-21):** The shared Film Stock product feature is fully superseded. [ADR-0025](0025-package-accounting-and-booth-recovery.md) and the [replacement contract](../superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md) control conflicting behavior. The original decision below is retained as history.

Film Stock is one shared inventory of physical Instax sheets for the booth, rather than a separate balance created for each Event. Sheets remaining after an Event carry forward to the next Event; Film Reservations temporarily make sheets unavailable, and Test Prints and Confirmed Prints consume them while each Event's Print Allowance stays separate. This matches the physical stock used by the same printer across Events and avoids counting leftover sheets twice, at the cost of reconciling inventory when sheets are added, removed, or used outside the booth.
