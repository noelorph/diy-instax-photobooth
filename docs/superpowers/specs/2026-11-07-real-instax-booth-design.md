# Real Instax Mini Link 3 in Booth Mode — approved development design

**Status:** Owner-approved development design, copied from the November 7 proposal after approval. Tasks 1–4 are implemented and source-reviewed; database/browser software acceptance is outstanding. [Current execution status](../../implementation/real-instax-booth-integration.md) records verification and release gates. No physical trial or production approval is granted. Automatic matching reload clearing uses phone confirmation as fallback.

**Working tree inspected:** 8c003f14195c53297e6e2b76ecf8156711578a6a, 2026-11-07. README.md has an existing owner edit; preserve it. The original proposal was prepared outside the repository before implementation approval.

## Intent and approach

Use the existing /booth and Admin Event setup pages. A phone or iPad running the development app in Bluefy connects directly to the Mini Link 3; the computer hosts the app. Keep the current Guest flow, package accounting, server acknowledgements and limited device access. Extend the existing printer interface with a physical adapter using the qualification harness's transport, image-send routine and candidate detectors.

This is one connected integration project, not a replacement Booth application. Reusing the current flow is the sensible approach because it already owns the one-send boundary, durable non-photo journal, receipt recovery and completion screen. A separate physical-only Booth would duplicate those safeguards; a transport rewrite would discard tested framing and calibration behavior. Neither alternative serves this request. Small local helpers and naming details remain implementation choices when they do not alter the contracts below.

Use **ponytail:ponytail, full** for every implementation task and review. Reuse existing components and contracts, add no dependency, and avoid a new generic transport/recovery framework. Task-specific regression tests are required for the new safety logic.

## Accepted evidence and its scope

These are accepted inputs, not new work that must be repeated before integration:

- Automatic normal ejection detection on FI033 firmware 0102, including the physical last used sheet; the known-empty attempt produced no false ejection candidate. See [November 6 report](../../qualification/2026-11-06-ejection-detection-trials.md).
- Automatic normal-reload detection on FI033/0102, independent of the late operator marker. See [November 7 report](../../qualification/2026-11-07-reload-detection-trial.md).
- Existing F5 software acceptance covers simulator-backed one-send, receipts, acknowledged completion and automatic Guest ending on 518d04b; #9 software contracts were accepted on 2f89a96. Their results must be reverified where this integration changes their callers or contracts.

The harness's fixed “unqualified” label is not a failure verdict for those accepted trials. The physical reports do not prove production authority, fresh-film image quality for the new integrated flow, all fault cases, safe old-job clearance or actual-iPad operation. Preserve all dated reports and their qualifications. The [evidence audit](../../qualification/2026-11-07-evidence-audit.md) identifies incomplete raw-log/video preservation; do not invent missing traces.

## Where and when the physical path works

Propose one server setting, BOOTH_PRINTER_MODE, with disabled, simulated and instax-development values. Missing/unknown values disable printing. Replace the old BOOTH_SIMULATOR_ENABLED switch and update its callers rather than maintaining overlapping switches. A production process always disables both development modes, even if flags or browser hints say otherwise. Pass the non-secret selected mode from server components to the existing client components; browser state cannot grant authority.

The existing owner-controlled database completion-policy row remains an independent gate and defaults to disabled. Add instax-development there; do not enable it in a migration or expose a browser mutation for it. Server and database mode must agree for new work. Pin the evidence policy to each new Booth run at Start, using the acknowledged setup hardware report. Changing configuration does not relabel an existing run. Mismatches block new work and leave original receipts readable. In a nonproduction process, a valid originating grant may still report a previously authorized attempt or already-bound reload observation under its pinned policy after either gate is disabled/changed; the fresh report must pass all correlation checks and grants no new send permission. Existing-run /booth entry must retain that reconciliation path using the authenticated run's pinned mode, while presenting no new Guest/Print action; a disabled mode without valid existing access creates no printer owner. Production continues to reject development evidence. Turning a setting off must not discard a result from work already in progress or promise cancellation of a dispatch already authorized.

Physical scope is FI033 with firmware reported as exactly 0102 and evidence policy instax-fi033-0102-dev-v1. Simulator evidence remains simulator-v1. Do not accept another model/version by guessing that it behaves the same. This does not create a production-qualified policy.

## Connection and normal printing

- Keep one physical adapter owner through setup → local Admin sign-out → /booth. Only an explicit Connect to Instax gesture opens the Bluetooth chooser. No connection failure selects the simulator.
- Expose the selected Bluetooth device's stable identifier through the existing transport; reject a missing identifier or a different printer for a bound run. A model/name alone is not device identity. Whether Bluefy preserves the identifier across reconnects is an actual-device check; inability to establish identity blocks reuse safely.
- Advance connection generation on each real reconnect, retire prior listeners/timers and ignore callbacks from retired owners. Component subscription cleanup must not disconnect an authorized job during route handoff. Terminal owner teardown ends local observation; it never claims the physical job was canceled.
- One adapter-owned polling sequence uses the existing status/history exchange and candidate detector. Polls must not compete with image upload or each other; wait for an in-flight exchange before starting the send. Cached readiness expires after 5,000 ms. Keep the harness's framing, chunk size, transfer delays and JPEG validation.
- Reuse sendTrialPrint, but do not interpret its “rejected-before-command” result as proof of no involvement: upload/preflight writes may already have started. Only failure before any send-phase write could begin can report definitely_not_sent. All ambiguous transport involvement becomes Pending. A matching proven non-send ends NotPrinted and preserves any pre-existing safe-job state; it cannot turn a false safety flag true. The adapter may resume ordinary fresh readiness polling after proven non-send, while retaining the consumed dispatch ID and never retrying that photo. Server-proven cancellation of an undispatched Reserved attempt remains a separate existing path.
- After one authorized send, require the existing active-print → normal-idle sequence on the same uninterrupted connection. Error, invalid status, timeout, lost connection or missing sequence cannot produce success. Keep the current 60-second observation bound; expiry produces unknown, never success. A zero remaining count must not erase a valid final-sheet completion.
- Persist matching observation metadata, then report it to the server. Server correlation includes run/grant, attempt, dispatch, printer identity, connection generation, observation ID and pinned policy. Count Printed once. After the matching acknowledgement, display Print complete for 3 seconds and end the Guest Session. Welcome is allowed only when the remaining readiness/lifecycle/capacity guards pass.
- For the development policy only, ready_for_new_job after a normal print requires that same attempt to have been recorded Printed by its uninterrupted physical-ejection evidence, plus a fresh normal-idle observation with no intervening fault. Reconnect/idle/reload alone cannot produce that evidence. This normal-path development rule is not physical recovery qualification.

## Automatic reload and manual fallback

The owner's choice is automatic clearing of the matching reload requirement, with phone confirmation as fallback. Reload changes film readiness only: it never adds packages, resolves an attempt, establishes old-job clearance or resumes Paused.

Use the existing server reload request as the observation boundary. A scoped Booth state read exposes only its ID, revision, printer ID and connection generation. Start the existing reload detector for that request, with a closed baseline before the observed cover cycle. Require the existing cover-open/close sequence, unchanged print history, a fresh +1 cover-ejection history change and normal ready status. Preserve its invalidation rules.

A new scoped reload-observation endpoint settles only the matching open request, at its matching revision and generation, using a stable operation/observation ID. The database records device-grant attribution and evidence version rather than inventing an Admin confirmer. Duplicate reports and simultaneous automatic/manual confirmation must have one effect. Stale or superseded requests and a reconnect invalidate the observation. An already committed receipt remains recoverable; a stale uncommitted candidate cannot clear a newer request.

The observation window is 60 seconds, matching the harness. If it expires, the baseline was missed, the cover was already open, the sequence is interrupted or the request changed, leave the request open and offer phone confirmation. Do not automatically restart the detector in a way that combines separate cover cycles. A new explicit reload request can start a new observation. An unannounced reload that began before a usable request/baseline may therefore require manual confirmation; this is a deliberate limit, not a claim that detection failed in the accepted trial.

Add the minimal phone controls needed for this workflow to the existing Event page: request a reload and confirm film loaded for the current request. Preserve current Admin authority, revision checks and original receipt retry behavior. Reconnect requires refreshing the request before manual confirmation. No quantity is inferred from printer count.

## Errors and limits

An accepted or possibly delivered job with no reliable outcome remains Pending and holds its print and printer slot. Discard the photo; never automatically resend it. Recover lost operation replies and previously committed observations with their original IDs. A receipt for evidence committed before a reconnect is distinct from a fresh stale-generation callback; preserve the former and reject the latter.

The recorded error 0x10 is not a qualified exclusive no-film diagnosis or safe NotPrinted result. Use the existing generic unavailable/Pending presentation. Printer counters, official-app progress 100, local COMPLETED state, dismissal, reset, power cycling, reload and normal idle are not old-job clearance proof.

This integration supplies no new physical clearing procedure or button that claims one. Keep simulated inspection behavior for existing software tests. For physical development attempts, a possibly delivered job cannot be released as NotPrinted or made safe by an unqualified inspection flag. Server-proven unsent work remains recoverable under the existing contract. Account an exceptional inspected Printed outcome only if the existing authorized contract permits it, while retaining the printer safety block; completion of the F6 inspection interface and qualification of its physical procedure remain separate work.

Ordinary pause/fault recovery stays in /booth. Preserve independent camera/network/printer blockers, pause, Finish races, grant security and image privacy. Full F6 access-loss/inspection completion, F8 schema replacement, media enablement, deployment and issue closure are outside this integration's completion claim.

**No lifecycle bypass:** For a physical-development run, Finish stays Finishing while either an attempt is unresolved or old_job_safety_confirmed is false. The valid same-generation normal-ready observation may then complete Finish; do not revoke the reporting grant before that final safety report. An exceptional inspected Printed result alone cannot finish an unsafe run. Start also checks for an outstanding unsafe physical job across prior runs/Events so changing Event, run or selected printer cannot erase the single-printer block. No new global state table is needed: use the persisted run safety and physical policy, under the existing global guard. This physical-development refinement belongs in the new ADR; simulator behavior is unchanged unless an existing safety regression requires a shared correction.

## Verification and release

Use recorded payload excerpts as clearly labeled fixture inputs and synthetic transport responses for additional faults. Drive the real physical adapter in browser tests, with fake Bluetooth at the browser boundary and real local HTTP/database operations. Simulator-only happy paths do not verify the physical adapter. Keep Guest screenshots, traces and video off.

No physical printing, reset, reload or new qualification trial is authorized in planning or implementation. No hosted change or database reset. Preserve the ordinary stack and its Events; use the existing isolated verification-stack mechanism if required by its data guards.

Operational release remains blocked on the [proof checklist](../../qualification/booth-recovery-proof-checklist.md): complete P1/P2 normal/fresh-film proof, required recovery scenarios P3–P4 and P6–P11/P13–P14, and actual iPad A16/Bluefy P12. P3 may use the qualified generic-fault/inspection route; an exclusive no-film classifier is not mandatory. P5 automatic reload's remaining false-positive qualification is required before granting that automatic path production authority; manual confirmation remains the approved alternative. Accepted normal-detection checks stay accepted.

## Documentation and approval boundary

The owner approved this design together with the written plan. Approval confirms the development-only policy and scope; it does not authorize physical trials or production use. ADR-0035 records the decision and links its refinement from ADR-0025; current authority documents accompany implementation while preserving historical evidence. Follow AGENTS.md for any further product/contract decision not covered here. Do not ask again about already approved behavior.
