# Printing qualification to deployment

These diagrams show the agreed sequence in [PRD section 3](../../PRD.md#3-development-and-launch-feasibility-gates), [PRD section 8](../../PRD.md#8-acceptance-criteria), [ADR-0012](../adr/0012-qualify-development-on-iphone-before-ipad-launch.md), and the [issue #17 qualification design](../superpowers/specs/2026-10-13-iphone-print-qualification-design.md). The iPhone 15 Plus is a development device. The iPad A16 is the sole first-release Booth Mode device.

```mermaid
flowchart LR
    A["iPhone printing prototype and fresh-film trial"] --> B{"iPhone gate passes?"}
    B -- No --> A
    B -- Yes --> C["Build the full Admin and Booth Mode application"]
    C --> D["Trial on the actual iPad A16"]
    D --> E{"iPad release gate passes?"}
    E -- No --> C
    E -- Yes --> F["Complete release checks and deploy"]
```

## 1. Build and qualify the iPhone printing prototype

```mermaid
flowchart TD
    A["Build an isolated HTTPS qualification page for Bluefy"] --> B["Pair the Mini Link 3 and request camera and Bluetooth permissions during setup"]
    B --> C["Capture a photo, Retake, review the printable crop, and send a print"]
    C --> D["Log command and status timing; compare with video of physical film ejection"]
    D --> E["With fresh film, run three Guest Sessions and a Retake"]
    E --> E2["Check allowance exhaustion, disconnect recovery, Guided Access, and continuous printer power"]
    E2 --> F["Record physical output, pass or fail evidence, and actual device, browser, and firmware versions"]
    F --> G{"Correct crop and reliable physical-ejection feedback, with all checks passing?"}
    G -- No --> H["Revisit the printer or browser approach; keep unclear outcomes uncertain"]
    H --> B
    G -- Yes --> I["iPhone development gate passes"]
```

Reported iPhone trial setup: iPhone 15 Plus on iOS 26.2.1, Bluefy 3.9.3, and Mini Link 3 firmware 0102(RX). Verify versions and fresh-film usability again for any new trial. The printer now reports zero sheets, and the development gate remains closed; see the [current trial report](../qualification/issue-17-trial-report.md). A command acknowledgement or Film Remaining change alone does not prove ejection. The independent Admin foundation may be built alongside this stage, but it is not required to pass the gate. Qualification prints are recorded manually; they are not Event Test Prints or Confirmed Prints.

## 2. Build the full Admin and Booth Mode application

```mermaid
flowchart TD
    A["iPhone development gate passed"] --> B["Resolve the affected operational rules in issue 8"]
    B --> C["Define server, access, accounting, and printer contracts in issue 9"]
    C --> D["Build Admin: authentication, Events, Film Stock, Test Prints, History, and Profile"]
    C --> E["Build Booth Mode: access grant, capture, Retake, review, Print, pause, and recovery"]
    C --> F["Build accounting: reservations, Confirmed Prints, Uncertain Prints, and stock changes"]
    C --> G["Integrate the printer adapter and simulated printer"]
    D --> H["Integrate the full Event-to-print flow"]
    E --> H
    F --> H
    G --> H
    H --> J["Run unit, database, browser, accessibility, and iPhone integration checks"]
    J --> K{"Integrated application passes?"}
    K -- No --> L["Fix the affected flow or contract"]
    L --> H
    K -- Yes --> M["Prepare a staging candidate for the iPad trial"]
```

The iPhone remains a development and test device during this stage. Passing this flow does not establish that the iPad A16 is ready for an Event.

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
