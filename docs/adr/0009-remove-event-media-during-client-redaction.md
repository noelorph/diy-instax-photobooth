# Remove Event Media during Client Redaction

> **Current scope (2026-10-21):** Client Redaction is fully superseded; terminal Event details/media are retained. [ADR-0025](0025-package-accounting-and-booth-recovery.md) and the [replacement contract](../superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md) control conflicting behavior. The original decision below is retained as history.

Client Redaction of a Completed or Cancelled Event removes its Client contact fields and stored Event Media while preserving anonymous Event, Capture, print, and stock totals. Backgrounds and montages may contain identifying names or branding that the system cannot reliably inspect, so deletion gives redaction a predictable boundary; the Admin may also rename an identifying Event title. This sacrifices later reuse of Event Media in exchange for a simpler privacy guarantee.
