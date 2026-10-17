# Printing qualification to deployment

These diagrams show the current sequence in [PRD section 3](../../PRD.md#3-development-and-launch-feasibility-gates), [PRD section 8](../../PRD.md#8-acceptance-criteria), and [ADR-0021](../adr/0021-move-print-qualification-to-integration-checkpoint.md). The [original issue #17 qualification design](../superpowers/specs/2026-10-13-iphone-print-qualification-design.md) remains an evidence plan. The iPhone 15 Plus is a development device. The iPad A16 is the sole first-release Booth Mode device.

```mermaid
flowchart LR
    A["Partial iPhone evidence recorded"] --> B["Integrated development with simulated printer"]
    B --> C{"Physical completion approach decided and validated?"}
    C -- No --> B
    C -- Yes --> D["Complete and enable printer-backed Booth Mode"]
    D --> E{"Actual iPad release trial passes?"}
    E -- No --> B
    E -- Yes --> F["Complete release checks and deploy"]
```

## 1. Continue iPhone printer qualification

```mermaid
flowchart TD
    A["Build an isolated HTTPS qualification page for Bluefy"] --> B["Pair the Mini Link 3 and request camera and Bluetooth permissions during setup"]
    B --> C["Capture a photo, Retake, review the printable crop, and send a print"]
    C --> D["Log command and status timing; compare with video of physical film ejection"]
    D --> E["With fresh film, run three Guest Sessions and a Retake"]
    E --> E2["Check allowance exhaustion, disconnect recovery, Guided Access, and continuous printer power"]
    E2 --> F["Record physical output, pass or fail evidence, and actual device, browser, and firmware versions"]
    F --> G{"Correct crop and reliable physical-ejection feedback, with all checks passing?"}
    G -- No --> H["Keep automatic detection unproven; consider a separately designed and validated supervised approach"]
    H --> B
    G -- Yes --> I["Automatic ejection evidence available for the integration checkpoint"]
```

Reported iPhone trial setup: iPhone 15 Plus on iOS 26.2.1, Bluefy 3.9.3, and Mini Link 3 firmware 0102(RX). Verify versions and fresh-film usability again for any new trial. Seven fresh-film prints matched the review; a separate three-used-sheet run exhausted local allowance. No physical sheet is now known to remain loaded, despite the latest printer-reported count of nine. See the [current trial report](../qualification/issue-17-trial-report.md). A command acknowledgement or Film Remaining change alone does not prove ejection. Integrated development may run in parallel with qualification, using a simulated printer. Qualification prints are recorded manually; they are not Event Test Prints or Confirmed Prints.

## 2. Develop and reach the physical completion checkpoint

```mermaid
flowchart TD
    A["Partial iPhone evidence recorded"] --> B["Resolve the affected operational rules in issue 8"]
    B --> C["Define server, access, provisional accounting, and printer contracts in issue 9"]
    C --> D["Build Admin: authentication, Events, Film Stock, Test Prints, History, and Profile"]
    C --> E["Build Booth Mode: access grant, capture, Retake, review, Print, pause, and recovery"]
    C --> F["Build accounting: reservations, Confirmed Prints, Uncertain Prints, and stock changes"]
    C --> G["Integrate replaceable printer adapter and simulator"]
    D --> H["Integrate the full Event-to-print flow"]
    E --> H
    F --> H
    G --> H
    H --> J["Run unit, database, browser, accessibility, and iPhone integration checks"]
    J --> K{"Integrated application passes?"}
    K -- No --> L["Fix the affected flow or contract"]
    L --> H
    K -- Yes --> M{"Physical ejection-confirmation approach decided and validated?"}
    M -- No --> N["Continue automatic-signal investigation or design supervised confirmation"]
    N --> M
    M -- Yes --> O["Enable printer-backed Booth Mode and prepare iPad trial"]
```

The iPhone remains a development and test device during this stage. Code for Live Event and Booth Access Grants may be developed, but printer-backed Booth Mode, Test Prints, stock consumption, and Confirmed Print accounting must not be completed or enabled before the physical completion checkpoint. Passing this flow does not establish that the iPad A16 is ready for an Event.

## 3. Qualify the iPad and prepare deployment

```mermaid
flowchart TD
    A["Deploy the integrated candidate and migrations to staging"] --> B["Set up the actual iPad A16; record model, iPadOS, Bluefy, and printer firmware; load fresh film"]
    B --> C["Check portrait Booth Mode, Guided Access, camera, and Bluetooth together"]
    C --> C2["With fresh film, check crop, ejection feedback, three Guest Sessions, Retake, exhaustion, disconnect, and power"]
    C2 --> D{"Actual iPad trial passes?"}
    D -- No --> E["Fix the affected application, browser, printer, or configuration behavior"]
    E --> F["Re-run automated checks and the iPad trial"]
    F --> C
    D -- Yes --> G["Verify all PRD acceptance criteria: Admin and Guest flows, accurate totals, privacy, redaction, and recovery"]
    G --> H{"Acceptance criteria pass?"}
    H -- No --> E
    H -- Yes --> I["Confirm CI, staging migration and Storage-policy checks, and production configuration"]
    I --> J{"Release checks pass?"}
    J -- No --> E
    J -- Yes --> K["Promote migrations and deploy the first release for the iPad A16 booth"]
```

Any change that affects the iPad trial or print outcome rules needs another verification pass before deployment. An iPhone pass never replaces this iPad release gate.
