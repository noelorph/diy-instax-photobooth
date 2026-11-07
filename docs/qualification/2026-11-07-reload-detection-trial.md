# Automatic normal-reload detection — 2026-11-07 trial evidence

**Accepted conclusion:** Automatic normal-reload detection demonstrated successfully on FI033/0102. The owner accepted this milestone after review of the supplied log and video.

The detector recognized the supervised reload automatically, independently of the later manual timestamp button. This accepts the normal-reload demonstration. The broader P5 false-positive checks and physical recovery requirements in the [proof checklist](booth-recovery-proof-checklist.md) remain separate, outstanding work. This evidence record does not enable production reload authority, settle an older print attempt, add Event capacity or close #17/#7.

## Setup and provenance

- Run: `run-a5079b51-8115-4a5c-a18b-c1bb7080ed17`.
- Reload observation: `observation-90dfeeac-8e76-4d99-8c5a-1e686f342456`, entirely on connection generation 2; a later connection check used generation 3.
- Printer: Mini Link 3, model `FI033`, firmware `0102`, as recorded in the connection events.
- Detector: `rea-candidates-v1` in the development qualification harness; [rules and static provenance](evidence/instax-mini-link-7.0.6/README.md#implemented-diagnostic-rules).
- Physical setup: operator-established empty starting condition, followed by a supervised cartridge replacement and black-cover ejection visible in the recording. The reported count is not physical inventory or independent proof of ten usable sheets.
- The operator supplied the complete JSON in the review conversation. The timeline below preserves selected events and raw payloads, not a complete raw-log archive. The export does not identify the source revision or independently verify the phone model, OS or browser version.
- Local video: `/Users/brandonorphiano/Downloads/de5015d6-95f4-48ca-9bda-65497216e8ea.mp4`; SHA-256 `28857ba95b289f0f5769c008c8d2169f06517d5437dea337e58109462994b5a1`. AVFoundation reported duration 152.134911 seconds, portrait 720 × 1280, nominal 29.651 fps. Review used sampled frames, with requested 0.05-second intervals around the candidate display and cover pickup; it was not an every-frame review of the entire video.

## Preliminary connection-only run

Before this trial, the operator supplied `run-2a4a202f-044d-45f1-97cc-08326dd43087` twice: first with `events: []` before connecting, then with six connection/setup events on 2026-11-07. Camera readiness was logged at 01:54:53.397 UTC, generation-2 status listening at 01:54:56.624, and the printer's zero-film status `00021000000b00000000` at 01:54:56.853. The final `printer-connected` event reported film zero, model FI033 and firmware 0102. The operator independently reported the printer empty.

That run contained no print attempt, reload observation, history baseline or reload candidate. It establishes successful diagnostic connection with a zero reported count, not another reload pass. The operator then restarted the procedure as the accepted run below. These details are transcribed from the supplied conversation exports; neither preliminary export is archived here as an original file.

## Logged sequence

All wall-clock times are UTC on 2026-11-07. Rows identify the derived event time where both a raw response and derived event were recorded.

| Event                                     | UTC          | Evidence                                                                       |
| ----------------------------------------- | ------------ | ------------------------------------------------------------------------------ |
| Connected, reported zero                  | 02:03:43.476 | `printer-connected`; status `00021000000b00000000`                             |
| Observation started                       | 02:04:12.430 | `reload-observation-start`                                                     |
| Closed baseline captured                  | 02:04:13.835 | `reload-baseline`; history `00030000004a00000058`: prints 74, FC 88            |
| First observed open cover                 | 02:04:29.794 | Status `00021001000b00000000`                                                  |
| First observed closed, active cycle       | 02:04:41.464 | Status `000210227f0b00000000`; operation-info 2, result 127                    |
| First normal idle, reported ten           | 02:04:50.854 | Status `00021a00000b00000000`                                                  |
| History increment and automatic candidate | 02:04:50.915 | History `00030000004a00000059`: prints still 74, FC 89; one `reload-candidate` |
| Manual physical marker                    | 02:04:57.022 | `physical-reload-cover-emerged`                                                |
| Observation ended                         | 02:05:12.432 | 60-second window ended; no candidate invalidation in the supplied trace        |
| Later connection check                    | 02:05:46.173 | Generation 3, `printer-ready`, normal status with reported ten                 |

The automatic candidate preceded the manual marker by **6.107 seconds**. Normal idle status and history 74/89 continued through the observation tail. The trace contains no print-start, accepted print or image-transfer sequence. The FC increment therefore accompanies this cover cycle without an increment in the printer's print total; its behavior under resets, invalid loads or other conditions was not tested here.

`rea-candidates-v1; unqualified` is the harness's fixed diagnostic label, not a per-trial failure verdict. The candidate is generated from status/history observations; the manual marker only records an operator action.

## Video timing and the late marker

The black cover appears fully extended and stationary around video 1:02. The operator then picks it up around 1:03 and presses the physical marker around 1:09. This confirms the operator's report that the button was pressed late.

Closer sampling establishes the following display sequence using actual video presentation timestamps:

| Observation                                  | Video time                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| Hand approaches the outer end of the cover   | 62.744667 s                                                                  |
| First apparent contact with the cover        | 62.778389 s; clear by 62.845800 s                                            |
| Last sampled “No candidate observed” display | 62.946922 s; status already idle/reported ten, displayed history still FC 88 |
| First sampled “Candidate observed” display   | 62.980633 s; displayed history FC 89                                         |

The candidate display follows apparent first contact by about 0.1–0.2 seconds. This does not establish that the hand completed ejection: the cover had already stopped visibly advancing, while the outlet lip hides its trailing edge. Unknown display latency also prevents assigning that ordering to the exact logged candidate event. The video supports the reload and delayed button press, but does not resolve exact unassisted full-release timing. The 6.107-second marker gap is not a measured physical detection latency.

## Acceptance and remaining scope

- **Passed and accepted:** the normal reload produced one automatic candidate on this FI033/0102 setup, independently of the manual marker; no later invalidation appeared in the observation window.
- **Still required for complete P5 qualification:** physical negative cases such as cover-only activity, empty/partial or otherwise invalid loads, and counter/reconnect boundaries. The later successful connection check is evidence of that connection only, not a reconnect false-positive trial.
- **Separate recovery work:** this run contained no failed accepted print and does not establish that an older command was cleared or cannot produce delayed output. P3/P4/P10/P11 remain open; reload cannot resolve a Pending attempt.

The [November 6 automatic print-ejection milestone](2026-11-06-ejection-detection-trials.md) remains accepted. Product accounting, the manual reload-confirmation fallback and production hardware gates in [ADR-0025](../adr/0025-package-accounting-and-booth-recovery.md) and the [replacement contract](../superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md) are unchanged. No application behavior or GitHub issue state was changed by recording this evidence.
