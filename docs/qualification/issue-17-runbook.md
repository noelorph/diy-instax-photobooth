# Issue #17 — iPhone print qualification runbook

**Status (2026-10-14):** The iPhone dry run passed. Five qualification sheets printed with the reviewed crop and orientation; one additional official-app diagnostic sheet brought the printer's reported count to two. The latest qualification run has two local prints available. An uncertain second attempt and page reloads interrupted earlier runs, so the three-consecutive-print and allowance-exhaustion checks are incomplete. An official-app trace shows a `12 7f` status field clearing after the film count fell, but its relation to full physical emergence is not yet synchronized or replicated; no independent Link 3 status notification was recorded, and the logger had a short post-emergence gap. Reliable physical-ejection feedback remains unproven, and the full development gate remains closed. The qualification page now samples raw status about every 0.9 seconds and offers a separate physical-emergence timing marker. Prepare and check the diagnostic setup before using one remaining sheet; see below. See the [interim trial report](issue-17-trial-report.md) and [approved design](../superpowers/specs/2026-10-13-iphone-print-qualification-design.md). This runbook is for the supervised iPhone 15 Plus development gate. It does not qualify the iPad launch gate.

## Prepare the device connection

1. Put the development Mac and iPhone on the same reachable Wi-Fi network. Record the Mac's current LAN address with `ifconfig en0`; use the `inet` address. Turn off any network isolation that blocks the iPhone reaching the Mac. Record the address below; it can change between sessions.
2. Install dependencies with `npm ci` if needed. Generate a certificate for the **current** LAN address:

   ```sh
   mkdir -p certificates
   mkcert -key-file certificates/booth-key.pem -cert-file certificates/booth.pem <LAN-IP> localhost 127.0.0.1
   ```

   The certificate and private key stay in the ignored `certificates/` directory. Never transfer `booth-key.pem` or the mkcert root CA private key.

3. Find the public CA certificate with `mkcert -CAROOT` and transfer **only** `rootCA.pem` to the iPhone by a trusted local method. Install its certificate profile on the iPhone, then enable SSL/TLS trust under **Settings → General → About → Certificate Trust Settings → Enable full trust for root certificates**. [Apple explains the required manual trust step](https://support.apple.com/en-us/102390). The operator performs this device setting; do not bypass a browser certificate warning.
4. Run `npm run dev:https`. The Next.js development configuration allows the current `en0` Wi-Fi IPv4 address so the plain command works from the iPhone. Open `https://<LAN-IP>:3000/qualification/iphone-print` in Bluefy. Confirm **Printer and camera setup** appears without a certificate warning or a trusted-HTTPS/Web Bluetooth blocker. If `en0` is not the Mac's active network interface, use `npm run dev:https -- --hostname <LAN-IP>` instead. If the Mac's address changed, regenerate the certificate, restart the server, and open the new URL.
5. Record the actual versions and starting film state before pairing or printing. Do not infer them from a previous report or the package label. Keep the printer on continuous power during the film sequence.

| Setup fact                                        | Observed value |
| ------------------------------------------------- | -------------- |
| Trial date, time zone, operator                   |                |
| iPhone model and iOS version                      |                |
| Bluefy version                                    |                |
| Mini Link 3 model and firmware shown in setup     |                |
| Mac LAN address, trusted HTTPS URL                |                |
| Film pack condition and physical sheets available |                |
| Printer power source                              |                |
| Second camera or timing observer                  |                |

## No-print dry run — stop before Print

Mark each row **pass**, **fail**, or **not observed**. Record a note for a failure. Do not use film while any setup, crop, or diagnostic step is unresolved.

| Check                                                                                                                           | Result | Observation or evidence |
| ------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------- |
| Trusted HTTPS page is reachable in Bluefy on the same network; Web Bluetooth is available                                       |        |                         |
| Camera permission is granted in operator setup; permission denial can be retried                                                |        |                         |
| Printer pairs from operator setup; model reads `FI033`; firmware and nonzero film status are visible                            |        |                         |
| Mirrored live preview, Capture, Retake, and unmirrored 600 × 800 portrait review work without a Guest permission prompt         |        |                         |
| The reviewed crop matches the intended frame and orientation; browser chrome does not cover Capture, Retake, or Print           |        |                         |
| Guided Access keeps the trial flow usable and blocks browser/device escape attempts                                             |        |                         |
| Disconnect **before** any print command blocks printing; reconnect restores setup without sending a queued command              |        |                         |
| Operator diagnostics show inbound responses with timestamps; **Export non-photo log** contains no photo bytes or Guest identity |        |                         |

Open **Operator diagnostics** and tap **Export non-photo log**. Use **Download JSON** or **Copy JSON** in the panel; if Bluefy does not save a file, paste the copied JSON into the evidence record. Keep the tab open until the log is captured. Inspect one no-print JSON log and confirm it has a run ID, timestamped non-photo events, model/firmware observed on screen, and no image data. Record its filename or secure evidence location: ________. If Bluefy lacks Web Bluetooth, Canvas produces an unsupported JPEG, printer support/status differs from the trial hypothesis, or any other mismatch appears, stop and repair that module before spending film.

## Fresh-film sequence — only after the dry run passes

### One-sheet ejection-signal diagnostic

This diagnostic tests the candidate status field; it does not pass the three-print gate. The two sheets currently in the printer cannot complete that gate. Automated tests must confirm that a simulated accepted print shows **Sheet fully emerged** beside a disabled **Observed film ejection** button, and that the non-photo JSON contains raw `status` responses. Do not send a live Print merely to check the controls.

1. Keep the printer on continuous power. Open the current trusted HTTPS qualification page in Bluefy and connect the printer. Record the printer's starting film count. If the page requests physical-sheet reconciliation after the earlier reload, compare the actual printer count and sheets used, then reconcile before starting a new run. This resets the local allowance; record the new run ID.
2. Put a second phone where one uninterrupted video shows both the Bluefy screen and the printer's film slot. Keep the printer, phone, and recording in place until at least ten seconds after full emergence. Do not pause PacketLogger, reload Bluefy, or disconnect Bluetooth during the attempt.
3. Capture a non-identifying test image and tap **Print** once. Film upload and command acknowledgement are not ejection. Watch the physical sheet.
4. The instant the **entire** sheet is outside the printer, tap **Sheet fully emerged** once. The page records a timestamped `physical-ejection-marker` for this attempt but does not change the local allowance. Keep the recording running and wait for **Observation window ended**; raw status polling continues for ten seconds after the marker. The message only marks elapsed time; inspect the exported log to see whether status replies arrived.
5. Tap **Observed film ejection** only after the ten-second tail. Open **Operator diagnostics** and export the non-photo JSON before reloading or reconciling. Record the physical sheet count and the printer-reported count. Preserve the unedited second-phone video privately and share the JSON; neither the photo nor image-transfer bytes should be in that log.
6. If the sheet does not fully emerge, the page becomes **Outcome uncertain**, the printer disconnects, or the sequence is interrupted, stop. Export the log, inspect the sheets and printer, and reconcile before any further print. Do not send another command automatically.

Compare the marker and video to every `status` payload, especially the film-count drop and `12 7f` clearing. A marker tap can lag physical emergence, so use the video to determine the ordering. If the candidate status clearly clears before full emergence, stop testing it as a completion signal. If promising, plan a replication before using the final sheet. A new pack is still required for a three-consecutive-print qualification run.

Keep the printer powered continuously. Run three **consecutive physical** capture-to-print attempts. Include at least one Retake before a Print. A print command acknowledgement or Film Remaining change is not physical ejection. On each sheet, compare the physical crop and orientation with the unmirrored review image. Observe the printer and screen together if possible, and record wall-clock times for the command acknowledgement, every candidate status change, and physical ejection.

| Attempt | Run ID / attempt ID | Retake? | Command accepted time | Raw response/status sequence and times | Physical ejection time | Crop/orientation | Outcome |
| ------- | ------------------- | ------- | --------------------- | -------------------------------------- | ---------------------- | ---------------- | ------- |
| 1       |                     |         |                       |                                        |                        |                  |         |
| 2       |                     |         |                       |                                        |                        |                  |         |
| 3       |                     |         |                       |                                        |                        |                  |         |

After each full emergence, press **Sheet fully emerged**, wait ten seconds for status-tail recording, then press **Observed film ejection** once. Only the latter advances the local trial counter. Neither operator action proves automatic printer feedback. After three observed ejections, verify **0 sheets available** and that a fourth Print command cannot be sent. Do not spend a fourth sheet to test the disabled control.

If a print outcome is unclear, disconnects after the command may have started, or has no physical ejection within 60 seconds, the UI must say **Outcome uncertain**. Stop. Inspect the printer and physical sheets. Export the log before **Reconcile physical sheets** and record what happened. Never press Print again as an automatic retry. A failed or ambiguous sequence does not pass the gate; repeat a full three-print sequence only after its cause is understood and film is available.

**Sheet reconciliation:** physical sheets available before ________; physically ejected ________; remaining in printer ________; damaged/other ________; matches printer-reported count? ________; operator/time ________.

## Gate review

For every criterion, mark **pass**, **fail**, or **not observed** and cite the run/attempt IDs, exported timeline, and physical observation. Keep the full build gated unless **all** rows pass. In particular, a reproducible signal or sequence must distinguish actual ejection from command acceptance and Film Remaining alone. An operator button press cannot supply that printer-feedback proof.

| Criterion                                                                          | Result | Evidence |
| ---------------------------------------------------------------------------------- | ------ | -------- |
| Actual device/browser/printer versions, trusted HTTPS, usable film                 |        |          |
| Operator permissions and Guided Access guest restriction                           |        |          |
| Camera, viewport, Bluetooth, capture, and printing operate together                |        |          |
| Three physical sheets match reviewed crop and orientation                          |        |          |
| Three consecutive prints include a Retake                                          |        |          |
| Local allowance reaches zero and blocks another command                            |        |          |
| Safe pre-command disconnect/reconnect and continuous printer power                 |        |          |
| Reliable printer ejection signal distinct from acceptance and Film Remaining alone |        |          |
| Uncertain outcome stops resend; diagnostic export has no photo or Guest data       |        |          |

Decision: **pass / fail / not observed** ________. Signal conclusion and timing: ________. Reviewer/date: ________. Write the actual evidence and decision in `issue-17-trial-report.md` after the physical trial; link it from [issue #17](https://github.com/noelorph/diy-instax-photobooth/issues/17). Do not mark the gate passed based on simulation or the loaded pack alone.
