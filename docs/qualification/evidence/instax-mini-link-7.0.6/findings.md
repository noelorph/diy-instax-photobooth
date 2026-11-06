# Instax Mini Link 7.0.6: automatic completion and reload investigation

Read-only investigation, 2026-11-02. No implementation, printer commands, app launch, GitHub mutation, project edit or persistent tool configuration change was performed. Analysis outputs are under `/private/tmp/instax-rea-investigation-20261102`. Other agents were editing this repository concurrently with the user's knowledge; their changes were left untouched.

**Conclusion.** The official Android app has a concrete status-polling completion rule. This investigation recovers the meaning of the historical `12 7f → 00 00` transition. It does not prove that the whole sheet has exited when the firmware reports completion. A separate print-history query supplies cumulative print and candidate film-cover-ejection totals worth investigating for reloads. No qualified automatic fresh-pack detection was recovered.

**Artifact and build.** The supplied directory is `.rea/instax-mini-link-7.0.6`, not `.rea/instax-mini-link-7.06`. Package `com.fujifilm.instaxminiLink`, app 7.0.6, version code 336, minimum Android SDK 29, target/compile SDK 35. The base APK hash matches the existing package evidence: `95785e4cea57085904e1e112aff9578e05ca320a22f6b5a4b7862078f0e6090c`. The existing package Evidence ID is `ev_9e927ccd9125172767ce8635438f3f6b733e26f522224024482de20d9fedc27b`.

Ordinary ZIP inspection finds six DEX files and Android Gradle Plugin 8.6.0 metadata. The ARM64 split includes Unity/IL2CPP, AR, image-processing and other native libraries. The relevant recovered printer path is Android Java/Kotlin code: Bluetooth response parsing → named printer model → readiness/error checks → a print-operation state machine. Kotlin-mangled method names expose `InstaxBluetoothLibrary_v13_0_0__release`. This describes the shipped package, not a reconstruction of its original build repository. No native-library or printer-firmware decompilation was needed for the identified Java/Kotlin control path; their behavior remains outside the analysis.

**Recovered completion behavior.**

1. `R1.q.<init>` decodes printer-function information into `InstaxPrinterInfo`.
2. `T1.r.n` checks `isPrinterGood(false)` before the print command, so zero reported remaining film blocks the command.
3. After an accepted print response, it enters `PRINTER_INFO_2` and checks `isPrinterGood(true)`. This deliberately permits zero remaining film during completion of the last sheet.
4. A post-command status other than OK or PRINTER_BUSY is treated as an error. The app sets its operation state to COMPLETED when `getPrinterOperationFlg()` becomes false.
5. `T1.r.s` contains a one-second delay before repeating the status request. Progress stays at or below 99 until the completed branch sets 100. The one-byte value decoded from the accepted print response is used as a progress denominator (clamped to at least one), not as proof of physical ejection.

The recovered completion branch does not require proof that a post-dispatch busy state was observed, nor a video/physical output sensor. It is an application completion convention, not qualification of physical full exit.

**Wire fields recovered.** Offsets below use this project's `parseResponse(...).payload` convention: the frame header and checksum are removed, while result and selector bytes remain.

| Query / payload field | Recovered meaning |
|---|---|
| `0x0002`, selector `0x02` | PRINTER_FUNCTION_INFO |
| payload[2] low four bits | `filmRemain` |
| payload[2] bits 4–6 / bit 7 | battery state / charging |
| payload[3] bit 0 (`0x01`) | back cover open |
| payload[3] bit 1 (`0x02`) | printer operation in progress |
| payload[3] bit 2 (`0x04`) | printer error flag |
| payload[3] high nibble | `printerOperationInfo`; the numeric value 1 is observed during the old printing traces, but its enum semantics were not recovered |
| payload[4] | print-request result enum declares: 0 NORMAL_TERMINATION; 1 CAMERA_BACK_DOOR_OPEN; 2 NO_FILM_ERROR; 127 PRINTER_PROCESSING; 240 ERROR_FLAG; physical/error behavior remains unqualified |
| payload[5] | `printWaitTime` |
| payload[6..9] | printer error data, big-endian int32 |
| `0x0002`, selector `0x03` | PRINT_HISTORY_INFO: totalPrintNum and totalEjectFCNum, each big-endian int32 |

The query IDs derive from the recovered function-selector enum and response parser, together with the project's existing support-function transport. Selector 0x03 has not been sent to the physical printer in this investigation.

For the historical payload `00 02 b4 12 7f 0b 00 00 00 00`, remaining film is 4, operation-in-progress is true, the result is PRINTER_PROCESSING, and the wait field is 11. For `00 02 b3 00 00 0b 00 00 00 00`, remaining film is 3, operation-in-progress is false, and the result is NORMAL_TERMINATION. Thus `12 7f` is not an opaque dedicated ejection notification: it spans two separately decoded fields.

**Recommended completion candidate — proposal, not implementation or accepted physical policy.** Reuse the existing validated BLE framing/exchange implementation. Bind observations to one printer, connection generation, attempt and dispatch. After the single authorized send, require a matching observed printing/processing phase and then idle + normal termination + no cover/error condition. Preserve raw fields and diagnostic print-history totals. Remain Pending/unknown if the sequence is missing, interrupted, contradictory or times out; never resend automatically. A final remaining count of zero must not erase completion of the current sheet.

This is intentionally stricter than the recovered app branch. It still must not emit production `full_ejection_confirmed` until the whole proposed rule passes synchronized physical testing. Adding a blind delay or equating progress 100 with physical exit is not sufficient. If the terminal status can precede full exit or also occur after a partial/jammed sheet, reject it as the sole physical-ejection authority. A separate physical exit sensor or another independently qualified observable would then be a new hardware/design option, not a solution established by this APK.

**Reload findings and candidate.** Selector 0x03 exposes totalPrintNum and totalEjectFCNum. The name of the latter suggests film-cover ejections; its physical meaning, update time, persistence, reset/wrap behavior and model support have not been measured. Its only recovered getter caller, `T1.v.n`, copies it into an aggregate printer model; this is not a recovered automatic reload decision.

`withOrWithoutFilmPI` is a misleadingly attractive alternative. The setter populates it from COLOR_INFO alongside CPU, battery and color metadata. Its getter has zero recovered incoming using nodes. It may describe a hardware property; it has not been established as a live film-presence reading. Dynamic/reflection use is outside that negative search.

The next useful reload probe is to record status 0x02 and history 0x03 before/during/after a cover-open → cover-closed → possible cover-ejection activity → idle sequence. Compare a fresh pack with cover-only opening, an empty cartridge, partial/used sheets, incorrect loading, reconnect and power-cycle. Determine whether the candidate counter changes only for the permitted reload. A counter rising after cover closure cannot be accepted merely because its name looks appropriate. If the permitted and invalid loads yield the same observable sequence, this software path cannot distinguish them.

Until that proof exists, keep Admin Confirm film loaded as the approved fallback. Reload detection must only clear the matching readiness blocker, never add ten Event prints, resolve an older Pending attempt, override a pause or authorize a repeat dispatch. The existing trials already show that the remaining counter is not inventory: three physical sheets gave reported 10→7, and one physical used sheet gave 10→9.

**What would establish the solution.**

- Completion: synchronized video of the entire exit path plus raw status and dispatch timestamps, using the intended polling rule, recorded printer/firmware/browser versions, normal fresh prints, last sheet, and relevant cover/error/disconnect cases. Establish that the emitted completion cannot precede the whole sheet exiting. Sampling delay and operator reaction time must not be mistaken for firmware ordering.
- Reload: the positive/negative loading matrix above, including proof that an old job cannot later eject. Test whether history counters add information beyond the known misleading remaining counter.
- Recovery: an interrupted or ambiguous sequence stays Pending, without automatic resend or loss of the reservation. Reload and output inspection stay separate.
- Then the current checklist's three consecutive fresh-film sessions including Retake, and the separate actual-iPad A16/Bluefy release qualification. The Android app is a protocol reference, not proof of iPad browser behavior.

The old official-app trace already separated remaining-count change (+19.223 s from upload start) from the terminal-field change (+20.108 s) by 0.885 s. Its video was not precisely synchronized to that trace, so the new decompiled names explain the fields but do not upgrade that old evidence into a physical pass.

**Later integration reach, if qualified.** Existing BLE protocol/session code → physical implementation of `PrinterAdapterV2` → attempt/dispatch/generation correlation and one-send observation reporting → server and SQL evidence-policy allowlists. These are currently simulator-only; swapping a browser adapter is insufficient. Automatic successful reload would additionally need an explicitly authorized trusted contract path because the current adapter union has no `film_loaded` observation. No such changes were made here.

**Current authority.** GitHub #17 remains OPEN. Its published body retains older manual-production and accounting references; current ADR-0025, the replacement contract and the proof checklist require automatic normal full ejection, with manual inspection reserved for exceptional recovery. Actual-iPad release remains separate. The repository HEAD observed at the final issue cross-check was `a9a633e84ee14614a1cb3ec3c59c3d8745c9869b`; concurrent edits were present.

**Application/device requirements.** No open application, emulator or printer connection was needed for this static investigation. The physical stage needs the Mini Link 3, deliberately accounted film, the intended browser/device, synchronized recording and a transport/harness capable of logging these fields. An Android official-app run can corroborate protocol behavior; it does not replace the actual iPad gate.

**Limits.** Static decompilation, with complete per-method source and enum smali where Java reconstruction fell back. No APK signature verification, fresh physical run, new packet capture, full native/firmware analysis, production change, or test-suite run. No claim of automatic inventory, firmware timing guarantee, solved hardware recovery, or issue acceptance.

**Evidence files.** [Readable decompiled methods](recovered-sources.md) · [Complete Evidence ID index](evidence-index.md). Original JSON records preserve target hashes, parameters, method prototypes, provider identity, source completeness, fallback markers and limitations.

**Repository and primary references.**

- [Issue #17](https://github.com/noelorph/diy-instax-photobooth/issues/17)
- [Current proof checklist](../../../../docs/qualification/booth-recovery-proof-checklist.md)
- [Dated physical trial report](../../../../docs/qualification/issue-17-trial-report.md)
- [Replacement contract](../../../../docs/superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md)
- [Existing protocol](../../../../src/features/qualification/instax/protocol.ts)
- [Adapter contract](../../../../src/features/booth/printer/contract-v2.ts)
- [Current simulator-only gate](../../../../src/lib/operations/printer-gate.ts)

Fujifilm's [Mini Link 3 manual](https://www.instax.com/mini_link_3/assets/pdf/manual_wwen_202408.pdf) states that loading/closing the film door automatically ejects a black cover; this supports testing the cover-ejection hypothesis but documents no Bluetooth completion guarantee. Fujifilm's [support FAQ](https://www.instaxus.com/support/) explains that opening the back resets the exposure counter, consistent with keeping that counter separate from known physical inventory.

**Finding ledger — static observed/derived evidence.** Every physical conclusion remains unqualified.

| Finding | Evidence ID | Complete record |
|---|---|---|
| Official app marks completed after operation flag clears | `ev_d67644b7fdab5ed25d8fd49dfbcf561ff45f0b49dc42b60d5dc5dfc358cdd6e9` | [official-print-poll](official-print-poll.json) |
| One-second polling and progress cap | `ev_772320078f37638b1da763c0b7ac202095b60e5d986ab3a2b6078902b4d3ddda` | [official-print-scheduler](official-print-scheduler.json) |
| Processing 127 and normal termination 0 | `ev_88c422b293c546d1626e8f1144d0cc50ca5ee659fe653990607210a06b7db961` | [print-result-codes](print-result-codes.json) |
| Status bit layout | `ev_51bace22003488c7797d62f0aa87cfa1ad48aa44f1afe1f027af93509a7040d6` | [setStatusData](setStatusData.json) |
| Bit helper verifies masks | `ev_7d7f2e3e484714ba32a13e1222af1dc303c4a45381d359d6c7ef27bbd67143b6` | [status-bit-helper](status-bit-helper.json) |
| Status and history field order | `ev_7c40ed873188e86a6e99139b3aa75e50c7bacdd0eda0057cbdff9776ebbc067f` | [printer-status-parser](printer-status-parser.json) |
| History selector is 3 | `ev_d74e8dd0503dddde2b3160355c1c2d6066312dc1d87c11a4050652fc81cdd71a` | [function-selectors](function-selectors.json) |
| Readiness permits zero film during completion | `ev_c1954de6ce0e05661d725359ca319ce37a70c53e63b5abb1f71d5691e8be6eea` | [isPrinterGood](isPrinterGood.json) |
| History totals copied without a reload decision | `ev_18448a5f2fbd52470e761088cc10dc863ce41571df3a41effbdb866d106e34dd` | [film-total-response-handler](film-total-response-handler.json) |
| Film PI field populated with color/hardware metadata | `ev_ff2529a7c055038d775bcf52c5b43105eb8fe0d7235ba370661ed1194fc6d89c` | [film-set-color](film-set-color.json) |
| No recovered Film PI getter callers | `ev_ac1db5922cc4eb7d8f993d0cece638f35c3ee813b2241842564ebf397ae42ee0` | [film-presence-callers](film-presence-callers.json) |
| Kotlin library release name | `ev_0feb3d89ee20a126be6731b11a574f13e1263c5cbac6ae35cd76312077578c5e` | [film-additional-info-class](film-additional-info-class.json) |
