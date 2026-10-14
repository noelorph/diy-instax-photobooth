# Issue #17 — interim iPhone print qualification report

**Recorded:** 2026-10-14, Asia/Manila. **Decision:** development gate remains closed. This is an interim evidence record, not a passing qualification. See the [runbook](issue-17-runbook.md), [approved design](../superpowers/specs/2026-10-13-iphone-print-qualification-design.md), and [issue #17](https://github.com/noelorph/diy-instax-photobooth/issues/17).

## Setup and observed results

The operator reported an iPhone 15 Plus running iOS 26.2.1 and Bluefy 3.9.3, with a Mini Link 3 reporting model `FI033` and firmware `0102`, on continuous power. The fresh pack had eight printable sheets remaining when physical printing began. The no-print checks passed: camera permission denial and Retry camera, camera/capture/Retake/review, crop and orientation, Guided Access, controls, pre-command printer disconnect and reconnect, and non-photo log export.

Five sheets physically printed and matched the reviewed photo crop and orientation. The printer count moved from eight to three. Four print attempts have exported timelines; the second physical sheet's attempt did not have a full exported timeline. The operator confirmed the latest attempt ended with two local prints available and the printer reporting three sheets. An earlier second attempt became **Outcome uncertain** after a sheet emerged because the operator did not tap **Observed film ejection** before the observation timeout; physical inspection and reconciliation resolved that run. Page reloads and reconciliation interrupted later runs. No single run has yet demonstrated three consecutive prints and zero local allowance.

| Physical sheet | Run and attempt | Print tap UTC | Command acknowledgement UTC | First idle status and film count | Operator/video observation |
| --- | --- | --- | --- | --- | --- |
| 1 | `run-f87e9533-4cef-4498-ad2a-b0be53e7004e-attempt-1` | 07:13:44.366 | 07:14:15.374 | 07:14:29.984, 8 → 7 | Full sheet about 46.99 s after Print; observed-ejection tap 07:14:53.085 |
| 2 | Same run, second attempt | Not exported | Not exported | Printer later reported 6 | Correct sheet emerged; observation timed out without a tap and was reconciled |
| 3 | `run-ca544a0f-35d8-42e7-b69f-0d5ab218429e-attempt-1` | 07:41:05.448 | 07:41:37.987 | 07:41:52.418, 6 → 5 | Observed-ejection tap 07:42:03.080; Retake logged |
| 4 | `run-6a705349-6179-4dc5-9ca4-981bed1c357e-attempt-1` | 07:55:39.981 | 07:56:14.530 | 07:56:28.810, 5 → 4 | Video 00:04 Print to 00:53 full emergence, about 49 s; observed-ejection tap 07:56:31.404 |
| 5 | `run-aebb9ba3-586f-4675-af27-c34053da7eb3-attempt-1` | 08:24:37.024 | 08:25:19.794 | 08:25:34.193, 4 → 3 | Video 00:03 Print to 01:00 full emergence, about 57 s; observed-ejection tap 08:25:39.204; Retake logged |

The standard status responses during sheet 5 changed from `0002b4127f0b00000000` to `0002b300000b00000000` when film count dropped 4 → 3. This was 57.169 s after Print and 14.399 s after command acknowledgement. The video records full emergence at approximately 57 s after Print; its whole-second marks cannot establish subsecond ordering. For sheet 1, the status change was 45.618 s after Print, while the operator timed full emergence at about 46.99 s. The candidate status therefore may precede complete ejection. Similar status transitions accompanied the other logged prints. These responses have only been observed together with film-count changes, so they have not established a distinct, reliable physical-ejection signal.

The optional Mini Link 3 status characteristic was subscribed successfully before sheet 5 (`link3-status-listening` at 08:23:44.133 UTC), but **no `link3-status` notification** appeared during upload, command acknowledgement, or physical ejection. The preceding no-print run also subscribed successfully and received none. The first seven events in the latest exported JSON belong to the preceding run `run-de542e1c-6cbe-462e-af87-7399af1d2d4e`; each event's own `runId` identifies its run. The [public reverse-engineered protocol notes](https://github.com/dgwilson/ESP32-Instax-Bridge/blob/main/INSTAX_PROTOCOL.md#link-3-specific-services) identify the characteristic as Notify, but do not document an ejection notification from it.

## Gate review

| Criterion | Current result | Basis |
| --- | --- | --- |
| Device setup, camera, Guided Access, and pre-command disconnect recovery | Pass in supervised iPhone dry run | Operator checks and exported connection/camera events |
| Physical crop and orientation | Pass for five observed sheets | Operator compared physical sheets with review |
| Three consecutive prints with Retake | Not observed | Reconciliation and reloads interrupted runs; Retake occurred in logged runs |
| Local allowance reaches zero and blocks another command | Not observed | Latest local allowance was two |
| Reliable ejection feedback distinct from command acknowledgement and Film Remaining alone | Not established | Standard status changed with film count; separate status channel emitted no notifications |
| Safe uncertainty and no automatic resend | Pass for observed uncertainty | Operator reconciled physical sheets before restarting |

**Next step:** preserve the remaining three sheets. Investigate a read-only completion signal or obtain a documented protocol trace before another physical test. Do not infer automatic ejection from the manual **Observed film ejection** button or the film count. If no reliable signal can be established, keep the full build gated and reconsider the printer/browser approach under the existing product decision.
