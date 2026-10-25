# Remove Event Media during Client Redaction

**Status:** Historical decision with the current retained scope below. [ADR-0025](0025-package-accounting-and-booth-recovery.md) supersedes its old product behavior; [ADR-0029](0029-remove-legacy-features-and-reset-development-schema.md) removes legacy implementation and preservation requirements.

Client Redaction and terminal Event deletion are removed completely. Current Completed/Cancelled Events retain private contact, media and operational history. Never-started Draft deletion remains a separate safe cleanup operation.

The detailed original decision is available with `git show 1de2272:docs/adr/0009-remove-event-media-during-client-redaction.md`. It is not a current work order. Use the [current contract](../superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md) for exact guards and interfaces.
