# Automatic ejection detection — 2026-11-06 trial evidence

**Accepted conclusion:** Automatic ejection detection demonstrated successfully on this FI033/0102 setup in the reviewed trials.

The owner accepted this conclusion and requested its preservation. This records a successful detection milestone: automatic candidates accompanied the reviewed used-sheet outputs, including the physical last used sheet, and the known-empty attempt produced no false ejection candidate. Full production qualification under [ADR-0025](../adr/0025-package-accounting-and-booth-recovery.md) and the [proof checklist](booth-recovery-proof-checklist.md) remains open. This evidence update does not change the product contract or enable real Booth Mode.

## Setup and evidence scope

- Printer: Mini Link 3, model `FI033`, firmware `0102`, as recorded in the supplied logs. Each listed run used connection generation 2 through its print observation.
- Detector: development qualification harness, `rea-candidates-v1`; [rule and source evidence](evidence/instax-mini-link-7.0.6/README.md). After command acceptance, it requires an observed active print followed by normal idle status, with invalid/error conditions excluded. A film-count decrement alone does not trigger it.
- Trial medium: used/reinserted sheets and an operator-established empty cartridge. These trials establish no fresh-film image-quality result. Reported film count is not physical inventory.
- The JSON exports and local videos were supplied by the operator in the review conversation. Videos remain local; this report preserves the relevant extracted observations, not a complete raw-log archive. The logs do not record the source revision or independently confirm the phone model, OS or browser version for these trials. The earlier reported iPhone/Bluefy setup is historical context, not a newly verified version record.
- `ejection-candidate` is generated automatically. `physical-ejection-marker` and the later `observed-ejection` are operator actions. The harness still requires manual final confirmation; these runs did not exercise automatic production completion, server accounting or admission of the next Guest.

All times below are UTC on 2026-11-06. Candidate delays relative to an operator marker are log comparisons, not measurements of the exact trailing-edge clearance time.

## Positive trials

Each row has one automatic candidate and operator-reported sheet output. The latest paired trial's cumulative export repeats attempt 1; that repetition is not another print or an empty-attempt candidate.

| Run (attempt 1)                            | Physical-ejection marker | Automatic candidate | Candidate after marker | Reported count |
| ------------------------------------------ | ------------------------ | ------------------- | ---------------------- | -------------- |
| `run-1d7e2876-c6a3-463b-9d3c-6eccad00a149` | 13:37:14.448             | 13:37:14.482        | 0.034 s                | 9 → 8          |
| `run-9c72c8a3-168c-4327-882c-1f784ff7bc72` | 14:04:20.861             | 14:04:22.029        | 1.168 s                | 8 → 7          |
| `run-2931c578-74fe-4cdd-9afe-a5884b4e09be` | 14:34:05.708             | 14:34:06.459        | 0.751 s                | 10 → 9         |
| `run-a79dc280-a5e6-47bd-8591-c447ff817840` | 15:14:47.983             | 15:14:49.837        | 1.854 s                | 10 → 9         |

In `run-9c72c8a3…`, count had already fallen to seven at 14:04:21.248 while the payload still contained `12 7f` (`000227127f0b00000000`). Normal idle and the candidate followed at 14:04:22.029 (`00022700000b00000000`). The count drop and the completion candidate are therefore distinct observations.

For `run-2931c578…`, sampled video frames show the sheet dropping without operator contact between approximately 71.977 and 72.247 seconds into the video, before the candidate at approximately 73.8 seconds. For `run-a79dc280…` attempt 1, the sheet is near horizontal at video 57.470 seconds, dropping at 57.740 seconds and settled at 57.976 seconds; the candidate follows around video 60 seconds. These observations support successful physical output before the automatic candidate in those reviewed sequences. Resolution, outlet shadows, display timing and polling gaps do not establish the exact instant each trailing corner cleared the printer or exclude early completion in every fault condition.

In the latest attempt 1, the command was accepted at 15:14:34.895. Status still showed active printing and reported ten at 15:14:48.517, after the operator marker. The first normal idle response, `00022900000b00000000`, produced the candidate at 15:14:49.837, 14.942 seconds after acceptance. Manual final confirmation followed at 15:14:59.900. The operator reported that this was the last physical sheet; the reported 10 → 9 change does not contradict that physical count.

## Known-empty negative trial

The same run, `run-a79dc280-a5e6-47bd-8591-c447ff817840`, then continued as **attempt 2**, with the operator reporting zero physical sheets remaining. Its observation ID was `observation-132261c1-d0ac-4d9d-8315-ae011ed0b82d`.

| Event                                   | UTC                 | Evidence                                                                 |
| --------------------------------------- | ------------------- | ------------------------------------------------------------------------ |
| Command accepted                        | 15:16:07.776        | `accepted`, attempt 2                                                    |
| Active print status                     | 15:16:09.096 onward | `000229127f1000000000`, then `000229127f0b00000000`; reported count nine |
| Error status and candidate invalidation | 15:16:21.366        | `000229f4f00b00000010`; `candidate-invalid`                              |
| Observation ended                       | 15:17:07.779        | `uncertain`; 60-second observation ended                                 |

**Result: passed the no-false-candidate check for this known-empty attempt.** No `ejection-candidate`, physical marker or manual ejection confirmation belongs to attempt 2. The error payload persisted through the observation window, and sampled video views showed no additional output. The earlier candidate in the cumulative export belongs to attempt 1.

The error appeared approximately 13.59 seconds after acceptance. `statusByte: 0` remained present even during this error, so it is not sufficient evidence of print success. The response contains error code `0x10`; this single test does not establish that the code uniquely means no film. The conservative `uncertain` outcome is consistent with keeping an unqualified physical outcome unresolved. Recovery, old-job clearance and readiness after this error were not tested.

## Local video provenance

Files are in the operator's `/Users/brandonorphiano/Downloads/` directory. SHA-256 values were checked when recording this report. Review used sampled frames and closer sampling around the positive sheet drop, not continuous frame-by-frame analysis of the entire recordings.

| Trial                           | Video filename                             | SHA-256                                                            |
| ------------------------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| `run-2931c578…`                 | `3c186a1f-4115-45d3-9241-3fdc29143848.mp4` | `48b4e1db69936bf49a87a992906154ab373f86ab20d4c5a0540b759fc274bcb4` |
| Last used sheet + empty attempt | `addae1b7-cfca-4140-b053-e44dc8a6cd85.mp4` | `df7b6fd42675e9049e5f36bf09c866a893ba653afaffb245077b52700c0b6cf4` |

The earlier supporting videos were supplied as `c823768d-4db7-44f6-a5e9-06f72985ba5d.mp4` and `99b539d5-1363-482f-9ff4-d1964f326509.mp4`. Their viewpoints did not resolve exact trailing-edge clearance; the 34 ms marker/candidate separation in the first run must not be interpreted as measured physical detection latency.

## Issue #17 disposition

[Issue #17](https://github.com/noelorph/diy-instax-photobooth/issues/17) remains open. The successful demonstration above is accepted; the following broader qualification remains required:

- **P1/P2:** document full-exit timing and observation precision for the supported hardware/evidence policy, including relevant fault cases; complete three consecutive fresh-film Guest Sessions with Retake, matching reviewed output and automatic completion.
- **P3/P4/P10/P11:** qualify fault handling or the approved generic-fault/inspection fallback, physical reload, safe old-job clearance and readiness. The empty trial supplies one passing negative case, not a complete no-film classifier or recovery procedure.
- **P6–P9:** verify Bluetooth, network, camera and page reload/crash boundaries without duplicate sends or delayed output from an unresolved old command.

The live issue's older routine-manual-production alternative is superseded by ADR-0025 and the replacement contract. The [issue scope mapping](../github-issue-update-drafts.md) remains an unpublished draft. Actual-iPad release qualification belongs separately to #7; it is not the reason to discount this successful demonstration. No GitHub issue state, production evidence policy or accounting behavior was changed by this record.
