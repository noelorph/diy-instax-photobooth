# ADR-0027: Limit Event Media changes to Draft

**Status:** Accepted; implementation belongs to issue #10. Its plan is approved; publication and implementation are on hold at the user's request. The #9 software prerequisite is satisfied and #9 is closed as completed.
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

F2 owns this complete functionality; F5 consumes its authorized media delivery. Optional media failure still uses the default Booth presentation without blocking readiness. These are product limits, not platform limits or proof of actual iPad playback. No application behavior, storage bucket or database is changed by this ADR.
