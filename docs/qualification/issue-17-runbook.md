# Issue #17 — iPhone print qualification runbook

**Status:** Harness implemented; device dry run and film trial await operator observation. Use the [approved design](../superpowers/specs/2026-10-13-iphone-print-qualification-design.md) for the gate criteria. This runbook is for the supervised iPhone 15 Plus development gate. It does not qualify the iPad launch gate.

## Prepare the device connection

1. Put the development Mac and iPhone on the same reachable Wi-Fi network. Record the Mac's current LAN address with `ifconfig en0`; use the `inet` address. Turn off any network isolation that blocks the iPhone reaching the Mac. Record the address below; it can change between sessions.
2. Install dependencies with `npm ci` if needed. Generate a certificate for the **current** LAN address:

   ```sh
   mkdir -p certificates
   mkcert -key-file certificates/booth-key.pem -cert-file certificates/booth.pem <LAN-IP> localhost 127.0.0.1
   ```

   The certificate and private key stay in the ignored `certificates/` directory. Never transfer `booth-key.pem` or the mkcert root CA private key.

3. Find the public CA certificate with `mkcert -CAROOT` and transfer **only** `rootCA.pem` to the iPhone by a trusted local method. Install its certificate profile on the iPhone, then enable SSL/TLS trust under **Settings → General → About → Certificate Trust Settings → Enable full trust for root certificates**. [Apple explains the required manual trust step](https://support.apple.com/en-us/102390). The operator performs this device setting; do not bypass a browser certificate warning.
4. Run `npm run dev:https -- --hostname <LAN-IP>` using the same LAN address included in the certificate. Next.js allows development resources from the hostname it starts with; binding to `0.0.0.0` can leave the page stuck on **Loading local qualification…** when opened by LAN address. Open `https://<LAN-IP>:3000/qualification/iphone-print` in Bluefy. Confirm the interactive setup appears without a certificate warning and reports neither a trusted-HTTPS nor a Web Bluetooth blocker. If the Mac's address changed, regenerate the certificate, restart the server with the new address, and open the new URL.
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

Export and inspect one no-print JSON log. Confirm it has a run ID, timestamped non-photo events, model/firmware observed on screen, and no image data. Record its filename or secure evidence location: ________. If Bluefy lacks Web Bluetooth, Canvas produces an unsupported JPEG, printer support/status differs from the trial hypothesis, or any other mismatch appears, stop and repair that module before spending film.

## Fresh-film sequence — only after the dry run passes

Keep the printer powered continuously. Run three **consecutive physical** capture-to-print attempts. Include at least one Retake before a Print. A print command acknowledgement or Film Remaining change is not physical ejection. On each sheet, compare the physical crop and orientation with the unmirrored review image. Observe the printer and screen together if possible, and record wall-clock times for the command acknowledgement, every candidate status change, and physical ejection.

| Attempt | Run ID / attempt ID | Retake? | Command accepted time | Raw response/status sequence and times | Physical ejection time | Crop/orientation | Outcome |
| ------- | ------------------- | ------- | --------------------- | -------------------------------------- | ---------------------- | ---------------- | ------- |
| 1       |                     |         |                       |                                        |                        |                  |         |
| 2       |                     |         |                       |                                        |                        |                  |         |
| 3       |                     |         |                       |                                        |                        |                  |         |

After each observed ejection, press **Observed film ejection** once. This advances only the local trial counter. It does **not** prove automatic printer feedback. After three observed ejections, verify **0 sheets available** and that a fourth Print command cannot be sent. Do not spend a fourth sheet to test the disabled control.

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
