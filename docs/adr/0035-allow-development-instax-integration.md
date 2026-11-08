# ADR-0035: Allow bounded development Instax integration

**Status:** Accepted by the owner with the November 7 integration design and implementation plan. Implementation and verification are separate from this decision.
**Date:** 2026-11-08
**Refines:** [ADR-0025](0025-package-accounting-and-booth-recovery.md), specifically development evidence authority and physical recovery safety. Package accounting, privacy, access and operational release requirements remain in force.

## Decision

Use the existing Booth flow and version-2 transactions. `BOOTH_PRINTER_MODE` is the sole server setting: `disabled`, `simulated`, or `instax-development`. Missing/unknown settings and every production process select `disabled`. The independently owner-controlled database completion policy defaults to disabled; no migration enables either development mode or grants browser policy mutation. New setup/Start/Guest/reserve/dispatch work requires agreement between the server setting, database setting and supported hardware evidence.

Pin each new run to its acknowledged setup evidence: `simulator-v1`, or `instax-fi033-0102-dev-v1` for adapter `instax-mini-link3-v1`, model FI033 and firmware exactly 0102. Existing version-2 runs receive only the simulator pin. Null/unverifiable policies grant no physical authority; a run pin cannot change. Readiness contains the exact descriptor, printer identity and connection generation; disconnected reports may carry null evidence. Every attempt observation also binds the attempt, dispatch (null only for genuinely undispatched work), printer, generation, observation ID, adapter and evidence version. Receipt replay precedes fresh-generation validation and never creates send permission.

Turning either setting off blocks new work. In a nonproduction process, originating scoped grants can still settle already-authorized attempts under their original pin, after every identity/generation check. Receipts remain readable. Production refuses fresh development evidence. Existing-run entry must retain reconciliation under its pin; disabled configuration without valid existing access creates no adapter owner. An unavailable physical adapter blocks entry and never selects the simulator.

Physical development permits command acceptance, normal full-ejection evidence, unknown outcomes, connection changes and genuinely proven pre-write non-send. It does not permit automatic `no_film_rejected`: error 0x10/counts alone do not prove no output. Proven non-send preserves the previous old-job safety flag without upgrading it. A server-proven undispatched Reserved cancellation remains distinct.

A matching normal physical Printed event can establish old-job safety only with same-generation fresh idle and no intervening interruption, fault, inspection or conflicting evidence. Reconnect/idle/reload cannot repair interrupted evidence. Exceptional Admin inspection can account Printed with a reason, while keeping safety false; an unqualified inspection flag cannot release possibly delivered physical work as NotPrinted. Simulator inspection behavior remains available for software checks.

Physical Finish remains Finishing until both the unresolved attempt and printer safety are settled. The final valid ready report can then finish and revoke the grant. Start checks outstanding unsafe physical runs globally, including earlier Events/Finished rows, so changing Event/run/printer cannot erase the block. This decision grants no physical clearing/reset procedure or global clearing table.

The approved follow-on reload integration observes one existing request with a closed baseline, matching revision/printer/generation, unchanged print history and the accepted cover/ejection sequence. It changes film readiness only. Missing, expired or interrupted baselines use authenticated phone confirmation. Automatic/manual races have one effect; neither adds capacity, resolves a job or resumes Paused. Request observation implementation belongs to the reload task.

## Evidence and release boundaries

The accepted [November 6 ejection results](../qualification/2026-11-06-ejection-detection-trials.md) and [November 7 normal reload result](../qualification/2026-11-07-reload-detection-trial.md) remain accepted within their recorded scope. Software implementation and synthetic tests do not expand those results. The [proof checklist](../qualification/booth-recovery-proof-checklist.md), including remaining normal/fresh-film/fault/recovery/false-positive checks and actual iPad A16/Bluefy qualification, still prevents operational release. Manual physical loading confirmation remains the approved fallback; printer counts are never inventory.

No physical print/reset/reload, deployment, hosted mutation, database reset, F6/F8 completion or issue closure is authorized by this development decision. The forward migration must later be included in F8's package-only baseline. Media uploads remain unavailable under ADR-0031/0032.
