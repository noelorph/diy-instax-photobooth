# ADR-0030: Fence Event Media commits and require backend cleanup proof

**Status:** Accepted scoped guard and fail-closed behavior; complete media-bearing Draft deletion remains blocked.
**Date:** 2026-10-26
**Refines:** [ADR-0027](0027-draft-only-event-media.md) and [ADR-0025](0025-package-accounting-and-booth-recovery.md). Their media limits, terminal retention, privacy and physical gates remain unchanged.
**Approval:** The user authorized F2 implementation, then explicitly approved the scoped commit guard and documentation: verify real Storage cleanup, late uploads and leftover bytes; if that cannot be proven, keep deletion pending and revisit the backend approach.

## Context and observed failure

Installed local Supabase Storage `v1.79.36` checks upload permission before receiving/completing bytes, then writes object metadata with privileged access. Invalidating an application upload row or observing an empty Storage listing does not drain an already-authorized request.

The real integration regression `deletion stays pending while an upload can still finish` holds Storage's object-completion advisory lock and observes its database waiter after authorization and byte transfer. Before the guard, Draft deletion reported complete; releasing the lock let the final PATCH return 204 and recreate one listed object. This is an observed in-flight race, not a delayed browser request that has yet to authorize.

## Decision

- Add a narrowly scoped BEFORE INSERT/UPDATE commit guard on `storage.objects` for the private `event_media` bucket. Re-read the exact asset and Event under the existing global guard → Event lock order. Require an uploading, unexpired asset and a nondeleted package Draft even when Storage writes as its privileged role. Reject metadata updates that move/version-overwrite existing Event Media objects. Other buckets and DELETE cleanup are unaffected.
- Preserve the installed vendor's permission preflight: `Uploader.canUpload` uses INSERT version `1` inside `StoragePgDB.testPermission`, which always rolls back. The guard exempts only that INSERT sentinel; UPDATE remains guarded and authenticated RLS remains active. Actual standard/TUS/S3 publications use internally generated UUID versions. This permits server termination of a known closed TUS URL, whose DELETE handler performs INSERT preflight. Rejections use PostgreSQL `42501` so Storage returns 403. Tests verify caller metadata cannot choose version `1`, authenticated sentinel INSERT after closure is denied by RLS, known-URL termination removes its files, and actual already-authorized completion remains denied. This installed-vendor distinction must be requalified on upgrades, not generalized into a privileged-role bypass.
- Beginning eligible Draft deletion retires its assets in the same transaction as erasing identifying details. Cleanup removes visible retired objects; attached Live/terminal assets are retained. Cancellation retains the Event and attached media.
- Never infer complete cleanup from invalidated rows, an empty public listing, denied downloads, a known-URL termination, or an elapsed application expiration alone. Require supported assurance that all authorized transfers have drained/terminated and all backend versions, staging bytes and metadata have been removed, followed by a final rescan.
- The current direct-upload interface supplies no complete transfer inventory or backend-drain acknowledgment. Consequently any Draft with an authorized media asset remains cleanup pending; no service cleanup acknowledgment can mark it removed, and the completion transaction independently refuses it. A Draft with no media authorization can complete deletion after actual empty-prefix verification. Retrying uses its original actor-scoped deletion receipt.
- Do not build Docker/file inspection into production. Do not add a proxy or change backend under this decision. Those require a further reviewed decision. F2 Task 3 and its F2-04 completion criterion remain open; Task 4's cleanup-proof prerequisite is not met.

## Physical evidence and limits

After the guard, the same local race returns pending, rejects the final PATCH and leaves no listed/downloadable object. Vendor cleanup removes the payload file, but the file backend leaves a TUS FileConfigstore `<asset>/<version>.json` artifact (381 bytes in the observed run). The explicit all-files-empty assertion failed after 10 seconds. This is not successful full cleanup. The maintained regression observes remaining metadata without reading its contents, confirms pending/retry behavior, and checks that finalization retries cannot recreate media. Exact-ID fixture teardown runs only after evidence and is never product proof.

The local factory does not configure a positive FileStore expiration; a documentation claim of 24-hour upload URL expiry is not local drain evidence. A single known URL is not an inventory. Hosted/S3 behavior is not qualified by the local file backend.

## Compatibility and consequences

Supabase [advises treating the Storage schema as read-only](https://supabase.com/docs/guides/storage/schema/design) and warns custom changes may conflict with updates. The user approved this narrow exception. Keep the trigger limited to Event Media, preserve vendor DELETE behavior and transaction ordering, and rerun upload/overwrite/cancellation/deletion races and physical leftover-byte checks after Storage upgrades. F8 must preserve or deliberately replace this guard in its fresh schema and reverify current #9 contracts. No hosted write, global activation or schema reset is authorized here.

This guard prevents metadata resurrection but is not a complete cleanup architecture. The product must continue to say cleanup pending until a supported backend inventory/drain/removal boundary is implemented and verified. No F2 closure, iPad playback or printer qualification follows from these checks.
