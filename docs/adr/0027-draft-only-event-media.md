# ADR-0027: Limit Event Media changes to Draft

**Current F2 scope — 2026-10-27:** [ADR-0032](0032-build-full-f2-with-uploads-unavailable.md) restores full F2/#30 implementation, including the dormant media editor and private delivery, while runtime uploads remain unavailable. Preserve media sections/designs, disabled controls, trusted mutation denials, private access/retention and prior-authorized cleanup-pending safeguards. The Admin Event Media page must visibly state that interrupted/late uploads and leftover files need cleanup verification before re-enabling. Supported cleanup and enabled transfer/failure/concurrency/private-delivery/playback qualification remain required for full #30 acceptance; existing disabled-scope evidence is unchanged. F3–F8 may proceed against the verified upload-disabled F2 milestone; #30 stays in #10, remains open and is completed last as the final blocker to #10 closure.

**Status:** Accepted; implementation belongs to issue #10. Its plan is approved; F1–F8 are published as #29–#36; F1 is implemented and full F2 dormant implementation may continue under ADR-0032 with uploads disabled under ADR-0031; F3–F8 may proceed against the verified upload-disabled F2 milestone; #30 stays in #10, remains open and is completed last as the final blocker to #10 closure. The #9 software prerequisite is satisfied and #9 is closed as completed.
**Date:** 2026-10-24
**Refines:** [ADR-0025](0025-package-accounting-and-booth-recovery.md), without replacing its retention, privacy or release gates.
**Approval:** The user approved the [functional breakdown design](../superpowers/specs/2026-10-24-issue-10-functional-breakdown-design.md), including its proposed upload defaults.

## Context

Private Event Media needs explicit editing and upload limits before #10 can be divided into executable capability plans. An upload may finish after another device starts or cancels the Event; beginning while Draft is insufficient authorization to change a later state.

## Decision

- Upload, replace or remove the optional background image and welcome montage only while the Event is Draft. Live media is frozen, including while its Booth run is Paused or Finished. Completed/Cancelled media remains retained under Admin access.
- Accept one optional still JPEG, PNG or WebP background, at most **10,000,000 bytes**. Reject animated images.
- Accept one optional MP4 montage containing H.264/AVC video, at most **50,000,000 bytes**, with positive duration no longer than **30 seconds**. Playback is always muted; an audio track need not be stripped, and there is no unmute control.
- Validate actual content, format/codec, size and duration at a trusted boundary. File extensions, declared MIME types and browser-reported duration do not establish acceptance. No automatic conversion, trimming or image editing is added.
- Recheck current Admin authority, Draft state and the expected revision when committing a media change. A failed or stale upload/replacement leaves the previous media intact. Starting or cancelling the Event first prevents subsequent media attachment or removal.
- Preserve private, authorized media delivery and safe Draft deletion. Cleanup of unreferenced failed uploads is not removal of retained Event Media; retain retryable cleanup state without falsely reporting completion. Guest photos never use this upload path.

## Consequences

F2 retains ownership of the planned full functionality; F5 consumes authorized media delivery when enabled. [ADR-0032](0032-build-full-f2-with-uploads-unavailable.md) permits full dormant implementation; ADR-0031 keeps runtime uploads unavailable and permits a disabled release, preserving these limits and UI designs. Full #30 proof remains open; F3–F8 may use the verified upload-disabled F2 milestone; #30 remains open in #10 and is completed last before #10 closure. Optional media failure still uses the default Booth presentation without blocking readiness. These are product limits, not platform limits or proof of actual iPad playback. No application behavior, storage bucket or database is changed by this ADR.
