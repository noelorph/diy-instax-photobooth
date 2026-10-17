# iPhone-qualified development, iPad-qualified launch

**Timing update, 2026-10-15:** [ADR-0021](../../adr/0021-move-print-qualification-to-integration-checkpoint.md) supersedes this design's prerequisite that the iPhone fresh-film trial pass before integrated development starts. The stages below reflect the current sequence: work may proceed with a simulated printer; the ejection-confirmation decision and physical validation are required before printer-backed Booth Mode and Confirmed Print accounting are completed or enabled. The actual-iPad release gate remains mandatory.

## Intent and scope

Use the owner's iPhone 15 Plus with Bluefy and the Instax Mini Link 3 to investigate the real capture-to-print boundary while integrated development proceeds with a simulated printer. The currently reported setup is iOS 26.2.1, Bluefy 3.9.3, and printer firmware 0102(RX); verify these versions when another qualifying trial runs. The iPhone is a development and test booth device only. The iPad A16 remains the sole first-release booth device. Its exact model and iPadOS version are unknown until purchase and must be recorded during its own trial.

The original harness and physical-trial criteria are in the [issue #17 qualification design](2026-10-13-iphone-print-qualification-design.md). The fresh-film sequence did not complete; a separate used-film run demonstrated local allowance exhaustion. See the [current trial report](../../qualification/issue-17-trial-report.md) for evidence and film state.

The current timing is set by ADR-0021. If the iPad trial exposes a different printer signal, browser behavior, or kiosk constraint, the shared printing or accounting design may change and must be reverified.

## Development stages

1. **Integrated development:** Complete the Admin foundation and develop Booth, access, and accounting flows using a simulated printer and replaceable adapter. The decisions from closed issue #8 are resolved and documented in [ADR-0014](../../adr/0014-stop-booth-before-print-reservation.md) and [ADR-0016](../../adr/0016-keep-history-when-deleting-draft.md); subsequent contracts must preserve them. Keep command acceptance, verified ejection, clear rejection, and uncertainty distinct; do not auto-confirm or resend an uncertain attempt.
2. **Physical completion checkpoint:** Continue iPhone qualification with usable fresh film where needed. Before printer-backed Booth Mode, Test Prints, stock consumption, and Confirmed Print accounting are completed or enabled, validate reliable automatic ejection detection or explicitly design and validate a supervised/manual approach. A command acknowledgement, Film Remaining change, or qualification-page observation tap does not establish an automatic signal. Physical sheets used in qualification are recorded manually, not Event Test Prints.
3. **Integrated verification:** Exercise Admin and Booth flows with the simulator and contract tests, and test the iPhone as a development device. This does not authorize Event launch or make phone Booth Mode a supported product feature.
4. **iPad qualification before launch:** On the purchased iPad A16, run the complete target-device trial using usable fresh film, including Guided Access, portrait layout and crop, camera/Bluefy/Bluetooth coexistence, the chosen physical-ejection confirmation approach, three consecutive Guest Sessions, Retake, allowance exhaustion, disconnect recovery, and printer power. Run the integrated application's acceptance checks on the iPad. If a criterion fails, revisit the affected browser, printer, UI, or shared accounting boundary; re-test before release.

Used film may support connection, protocol, and local allowance experiments but cannot qualify image quality or a reliable physical ejection outcome. A failed automatic-signal trial leaves the physical completion checkpoint open while a supervised/manual option is considered and validated.

## Boundaries and verification

Keep the printer protocol behind an adapter so device-specific behavior does not silently become an accounting guarantee. A Guest print becomes Confirmed only when the evidence supports physical film ejection; ambiguous outcomes use the existing Uncertain Print flow. The iPhone trials establish provisional observations for the adapter and state machine. Automated tests exercise the provisional contract; physical completion validation and the iPad trial determine what may be enabled.

Keep the first-release iPad behavior, privacy rules, Admin/Booth isolation, and accounting definitions unless a physical trial or explicit follow-up decision supplies evidence to change them. Issue #17 continues to track the unfinished physical completion evidence; issue #7 tracks the separate iPad release trial.
