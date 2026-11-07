# Official app error and recovery investigation — 2026-11-07

**Finding:** The official Android library classifies the November 6 known-empty trial's error as `CAMERA_JAMMED_ERROR`. Its print task ends with an error result. This explains how the app treats that packet; it does not establish that the cartridge is physically jammed, uniquely identify an empty cartridge, or prove an old print job cannot later eject.

This is static evidence from Instax Mini Link Android 7.0.6 (336), not a new physical trial or a production change. The [accepted automatic-ejection demonstration](../../../2026-11-06-ejection-detection-trials.md) remains accepted within its recorded scope. The [qualification checklist](../../../booth-recovery-proof-checklist.md) still governs physical recovery and release.

## Artifact and method

- Base APK: `com.fujifilm.instaxminiLink/base.apk`, SHA-256 `95785e4cea57085904e1e112aff9578e05ca320a22f6b5a4b7862078f0e6090c`.
- Existing REA 6.7.0 public CLI, Java 17.0.12, and JADX bridge 0.7.1; heap limited to 1024 MiB per analysis. No installation or persistent configuration change.
- Full successful CLI envelopes are preserved beside this report. [Evidence index](evidence-index.md) identifies each operation, source representation and Evidence ID; [SHA256SUMS](SHA256SUMS) verifies the records.
- The Android app and printer firmware were not executed or modified. No Bluetooth command, print, reload, reset or physical recovery was performed. This does not establish iOS-app or other app-version behavior.

## Known-empty packet: what the official library calls it

The November 6 run `run-a79dc280-a5e6-47bd-8591-c447ff817840`, attempt 2, returned `00 02 29 f4 f0 0b 00 00 00 10`. Its operator-established physical contents were empty even though the reported film count remained nine.

The [previous parser evidence](../printer-status-parser.json) and [status mapping](../setStatusData.json) identify a printer error flag, result `0xf0` (`ERROR_FLAG`) and big-endian error data `0x00000010` (16). The command-level `statusByte: 0` does not override those error fields. The explicit `NO_FILM_ERROR` result declared in [the result enum](../print-result-codes.json) is 2; that is not the result in this trial.

The recovered chain is:

1. `InstaxPrinterInfo.setErrorData(int)` stores the raw error integer unchanged.
2. `checkPrinterError()` calls the error-bit decoder `W1.v.a.a(int)`, then the category getter `W1.v.j()`.
3. The decoder tests named bits using [the previously recovered bit helper](../status-bit-helper.json). `FILM_JAMMED_ERROR` has custom bit index 4, distinct from its enum ordinal 5. Value 16 sets only bit 4.
4. The error enum constructor stores the category, and `j()` returns it: `W1.C.x`.
5. `W1.C.<clinit>` names `x` as `CAMERA_JAMMED_ERROR`. `CAMERA_NO_PAPER_ERROR` is a separate category.

**Interpretation:** Our observed empty-cartridge case reaches the official app's jam category. That category is useful protocol evidence, but this one trial cannot distinguish empty, jammed or other mechanically unsuccessful conditions. It supplies no automatic no-output or safe-cancellation guarantee. No meaning is assigned here to operation-info value 15 beyond its decoded numeric value.

## How the print task exits on this error

The previously recovered [print polling method](../official-print-poll.json), `T1.r.n`, checks `isPrinterGood(true)` after command acceptance. A result other than OK or PRINTER_BUSY calls the print task's error handler.

The newly recovered `T1.r.c` sets its local task state to `COMPLETED` for this jam classification, then calls `T1.f.c`, which stores the error result and category. The base getters return those stored values. The [scheduler](../official-print-scheduler.json), `T1.r.s`, handles that ended task by setting progress to 100 and calling its completion callback with the stored result/category.

Thus `COMPLETED` and progress 100 describe the end of this local task, including failure; they are not standalone physical-print success signals. The recovered path returns `INSTAX_ERROR` plus `CAMERA_JAMMED_ERROR` for this packet.

No reset, cancellation command or print resend appears in this traced error-handler/scheduler branch. This is a bounded finding, not a claim that no other app path can retry. `NOW_PRINTING_ERROR` takes a different branch that saves the previous state and notifies a listener; its subsequent recovery behavior was not traced. The concrete caller of this print-task completion callback and firmware job retention are outside the established chain.

## Shared error dialog and its action

The shared UI handler `com.fujifilm.instaxbod.ui.a.e1(L1.o, W1.C)` ignores OK/CANCELLED, logs other errors and builds a dialog unless the Activity is finishing or destroyed. Its builder callback `a.i.b` obtains its message from `X3.g.a`, clears the title and allows cancellation.

For the pair `INSTAX_ERROR` / `CAMERA_JAMMED_ERROR`, the message mapper selects `R.string.camera_jammed_error` and appends the category getter's value in parentheses. The recovered `L1.o` enum and synthetic switch establish both branches; no-paper uses a different resource. The exact localized resource text was not decoded, so this report does not quote the message or infer recovery instructions from its resource name.

The wrapper `X3.o.i0` supplies one positive button from `R.string.dialog_ok` with a null click listener. It invokes the builder callback and disables dismissal by touching outside the dialog. No reset, retry or print command appears in this direct handler/dialog path. The concrete route from the print-task callback to this shared UI handler was not established; this proves how the shared handler would present that error pair, not that every print screen uses it.

## What this changes for our recovery work

This supports the existing generic-fault/inspection route in P3. It does not qualify an automatic “out of film” message or authorize resolving this accepted attempt as NotPrinted from the error packet alone. Preserve its Pending outcome until reliable output inspection and a qualified clearing procedure establish the outcome. A normal idle response, reported film count, reconnect or reload alone cannot settle it.

The original completion demonstration remains useful. This investigation answers a different question: how to handle the printer when the expected sheet does not emerge and an error follows acceptance.

No automatic permitted-reload decision was recovered in this static follow-up. A separate [November 7 physical trial](../../../2026-11-07-reload-detection-trial.md) subsequently demonstrated normal-reload detection successfully and was accepted by the owner. Complete P5 qualification remains open; the [diagnostic reload candidate](../README.md#implemented-diagnostic-rules) does not grant production authority, and Admin **Confirm film loaded** is the approved fallback. Reload confirmation changes only the matching load requirement, not Event capacity, a pending print outcome or an explicit pause.

## Supported recovery advice and the next physical test

Fujifilm's [Mini Link 3 manual, printed pages 14–15](https://instax.com/mini_link_3/assets/pdf/manual_wwen_202408.pdf) recommends power off/on for jammed film and describes reset for temporary malfunction. Its reprint section, also reflected in the [official FAQ](https://www.instax.com/mini_link_3/en/support/), says power-off deletes the image retained for reprinting. That statement concerns the reprint image; the reviewed passages do not say that an accepted or interrupted print job is canceled.

The next useful experiment is **known-empty failure → power off/on → normal reload → one different test image**, in the isolated qualification harness:

1. Identify failed image/attempt **A**, preserve its accepted-command and fault records, and record the outlet continuously. Keep the outcome unresolved; never resend A automatically.
2. Record the exact power off/on and reconnect sequence. Do not induce a jam or open a fresh loaded pack to create this case. A reset-button procedure, if later needed, is a separate procedure to record and qualify.
3. Replace the operator-established empty cartridge with a fresh supported cartridge normally. Capture door closure, black-cover discharge, connection changes and settled raw status/history. Send no print/reprint command during recovery or loading; record any unexpected sheet. This procedure does not cover a trapped or unknown sheet.
4. Once ready, use the isolated harness to authorize exactly one visibly different calibration image **B**. Record exactly one B emerging, any delayed A, and the automatic candidate relative to complete physical exit. This is a qualification experiment, not production admission.
5. Review the continuous video and command trace together. Repeat the relevant recovery/reconnect boundaries before accepting a bounded procedure for FI033/0102. A successful run is empirical evidence for that exact procedure; a fixed wait or one idle response is not a cancellation guarantee. Unexpected output or unresolved ambiguity leaves the booth unavailable.

P4 also requires separate application checks with both known NotPrinted and Pending prior attempts: only the current reload request can be confirmed; a stale phone panel cannot clear a newer fault; reconnect uses the current request; capacity and deliberate pause remain unchanged; reload does not resolve A. These requirements already exist in the [replacement contract](../../../../superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md), and this report does not change them.

## Limits

No new physical or official-app runtime test, firmware analysis, full retry-path audit, app-signature verification, actual-iPad test, production-code change or qualification pass was performed. Static method completeness is scoped to the preserved methods; it does not establish dynamic dispatch, every caller, reflection or native behavior. The material unresolved risk is delayed output from an older accepted command after recovery or reload.

Preservation checks: all 24 record checksums passed; each successful record has a unique Evidence ID and the matching APK hash, with complete selected method source where applicable. The report, evidence index and parent README's 53 local links resolved. A separate read-only review found no blocking recovery-scope or acceptance overclaim; its two clarity suggestions were incorporated. No application tests were needed for these evidence-only additions.
