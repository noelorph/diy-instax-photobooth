# Documentation map and authority

**Current approved target:** package accounting and Booth recovery, 2026-10-21. **Implementation status:** version-2 database contracts, trusted handlers and provisional simulator code passed the #9 software checks; legacy Admin/Booth UI consumers remain until #10. See the [issue #9 verification and #10 handoff record](implementation/issue-9-package-contracts-review.md) for passing 2026-10-25 software acceptance and retained failures; GitHub #9 is closed as completed. Hosted activation and physical qualification remain open.

## Active documentation

1. [Replacement contract](superpowers/specs/2026-10-21-package-accounting-booth-recovery-design.md): normative transitions, formulas, failure rules, access, database and target endpoints.
2. [ADR-0025](adr/0025-package-accounting-and-booth-recovery.md): decision rationale and supersession map; [ADR-0026](adr/0026-order-captures-by-shutter-time.md): shutter-time Capture ordering and explicitly selected ties; [all ADRs](adr/README.md).
3. Root [PRD](../PRD.md), [architecture](../ARCHITECTURE.md), [glossary](../GLOSSARY.md), [design system](../DESIGN_SYSTEM.md), [README](../README.md) and [agent instructions](../AGENTS.md): aligned requirements and working context.
4. [Routes and user-flow diagrams](booth-user-flow.md), [development/release diagram](diagrams/printing-to-deployment-flow.md).
5. [Proof checklist](qualification/booth-recovery-proof-checklist.md): what evidence supports, what remains unproven and what to do if a capability cannot be proven.
6. [Approved documentation plan](superpowers/plans/2026-10-21-package-accounting-booth-recovery-docs.md), [historical documentation review](documentation-review.md), [issue #9 implementation review](implementation/issue-9-package-contracts-review.md), [issue publication record and remaining drafts](github-issue-update-drafts.md).
7. [Approved mockup gallery](design/2026-10-21-package-recovery/index.html), [screen notes](design/2026-10-21-package-recovery/screen-map.md) and [design index](design/README.md): Admin and Booth visual references approved by the user on 21 October 2026; implementation pending.
8. [Approved #10 functional design](superpowers/specs/2026-10-24-issue-10-functional-breakdown-design.md), [capability flowcharts](diagrams/issue-10-functional-breakdown.md), [main/eight capability plans](superpowers/plans/2026-10-24-issue-10-implementation-plan.md) and [acceptance trace](implementation/issue-10-retirement-and-acceptance.md). The revised plans await approval/publication. [ADR-0027](adr/0027-draft-only-event-media.md) governs media; [ADR-0028](adr/0028-define-monthly-event-count.md) records the user's monthly-count clarification. Approval/review records do not claim implementation.
9. [Domain guidance](agents/domain.md), [issue workflow](agents/issue-tracker.md), [triage labels](agents/triage-labels.md).

If two active documents disagree, reconcile them against the approved contract and ADR rather than silently implementing a different policy. Ask about new durable product decisions. Current user decisions override older files. The #9/#10 GitHub descriptions were published on 2026-10-23; #17/#7 remain unpublished drafts. Description publication does not close issues or establish implementation completion. #10 planning may proceed. The [dated #9 software acceptance evidence](implementation/issue-9-package-contracts-review.md#issue-9-software-verification-passed--2026-10-25) records passing software checks and independent evidence review. GitHub #9 is closed as completed. #10 implementation awaits its own plan approval/publication.

## Historical material: read for evidence, not new instructions

| Collection                                                              | Use and limitation                                                                                         |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Specs/plans dated before 2026-10-21                                     | Prior design and work orders, marked superseded; do not execute their old accounting/recovery instructions |
| Earlier affected ADRs                                                   | Original reasoning preserved, with scope notice and link to replacement                                    |
| [#17 trial report](qualification/issue-17-trial-report.md)              | Dated factual observations; original future recommendations do not override current gates                  |
| [#17 runbook](qualification/issue-17-runbook.md)                        | Existing supervised harness controls; future trials must use/adapt the current checklist                   |
| [Issue #9 checkpoint](issue-9-implementation-checkpoint.md)             | Old checkpoint and test status, not a new pass or current plan                                             |
| [Existing-code setup guide](implementation/issue9-local-development.md) | Commands/behavior for inherited implementation; removed product controls still exist in code               |
| `docs/prompts/`                                                         | Historical source inputs, explicitly not current instructions                                              |
| [Archived October 20 designs](archive/design-2026-10-20/README.md)      | Original images/prompts/tokens preserved; old controls and alternate visual proposal are non-authoritative |

Historical terms intentionally remain where removing them would falsify evidence. They must not appear as active product choices. The [October 21 mockups](design/2026-10-21-package-recovery/README.md) visualize the new behavior using the current design system. Their reference images remain archived and non-authoritative.
