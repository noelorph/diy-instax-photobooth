# ADR-0031: Defer Event Media uploads for release

**Status:** Accepted; F2 implementation may continue with uploads unavailable. Implementation and acceptance remain to be verified.
**Date:** 2026-10-27
**Refines:** [ADR-0027](0027-draft-only-event-media.md), [ADR-0030](0030-fence-event-media-commits-and-require-cleanup-proof.md) and [ADR-0025](0025-package-accounting-and-booth-recovery.md).
**Supersedes:** The requirement to resolve/qualify enabled Event Media before release and the blanket Task 4 editor hold. It does not supersede content validation, private access, retention, cleanup or hardware safeguards.
**Approval:** The user approved temporarily unavailable media uploads while preserving the planned feature, page sections and designs, and explicitly authorized synchronized documentation, GitHub issue updates and continued F2 work.

## Context

F2's scoped Storage guard prevents the reproduced late metadata commit, but complete transfer inventory/drain and backend-byte removal remain unproven. The dated local failures and qualification reports remain evidence. The product can operate with its default Booth presentation; resolving the media backend is optional before release.

## Decision

- Keep Event Media as a planned optional feature. Preserve its page sections, background/montage designs and approved assets. Show a clear persistent **“Media uploads are temporarily unavailable.”** state and disabled upload controls; do not promise an availability date.
- Continue F2's package-based Draft preparation, stale-save/receipt recovery, cancellation/deletion safety and disabled media presentation now. The previous Task 4 prerequisite applies to enabling the full editor/transfer/delivery workflow, not to rendering its unavailable state.
- Deny new upload authorization and media upload/attach/replace mutations at trusted product boundaries while disabled. A disabled button alone is insufficient. Preserve existing authorized media removal/cleanup and receipt recovery under current safety rules; no full interactive editor is enabled. Previously issued credentials/transfers require the existing commit guard and cleanup-pending handling; disabling uploads does not prove those bytes are gone.
- A release may ship with uploads disabled and default Booth presentation. Unresolved media implementation/qualification is not by itself a release blocker in that state. Keep the feature and future acceptance work documented; do not describe it as implemented or qualified. This decision does not decide whether issue #30 closes or where future enabled-media work is tracked.
- Retain existing private media, terminal records, authorized access and audit history under their current rules. Previously authorized media-bearing Draft deletion remains pending until supported cleanup proof exists. Never infer cleanup from listing emptiness, denied delivery, expiration assumptions or the disabled feature state. Drafts with no media authorization may complete deletion only under the existing verified-empty rules.
- Re-enabling uploads requires a reviewed supported cleanup boundary, proof of transfer termination/drain and backend versions/staging/metadata removal with final rescan, then full content/size/duration, lifecycle/revocation, private-delivery and actual supported-device playback qualification. Keep ADR-0027's limits and ADR-0030's scoped guard unless deliberately replaced by an approved decision. Do not enable from a vendor reply, a support ticket, or a passing narrow regression alone.
- #9's accepted safety/security contracts and #10's complete legacy removal/fresh-schema obligations remain. #17/#7 automatic full-ejection/recovery and actual-iPad release gates remain open and mandatory.

## Consequences and acceptance

Current acceptance must prove visible unavailable media sections, denied new uploads/attachments/replacements, functional Draft workflows and default Booth behavior without media, preserved retention/private-access controls and honest cleanup-pending feedback for prior authorizations. Existing qualification failures remain unchanged; deferred enabled-media criteria remain open rather than marked passed. No backend replacement, hosted activation, schema reset or physical trial is authorized by this ADR.
