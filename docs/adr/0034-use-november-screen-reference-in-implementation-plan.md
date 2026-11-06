# ADR-0034: Use the November screen reference in the implementation plan

**Status:** Accepted, 2026-11-06. The owner confirmed full November visual adoption, including fonts/colors, and removal of the old reference files while preserving Git history and dated evidence. The initial instruction authorized documentation/GitHub reference updates without a commit; the owner subsequently authorized committing the current changes and necessary drawing-source artifacts. No push is authorized by that instruction.
**Supersedes:** [ADR-0033](0033-adopt-apricot-studio-design-system.md)'s presentation target. [ADR-0010](0010-one-design-system-for-admin-and-booth.md)'s shared-system decision and [ADR-0020](0020-place-shared-ui-components-under-src.md)'s component ownership remain in force.

## Context

The owner supplied “Instax Booth · New design reference · Nov 2026.pdf”, requested one extracted file per screen, and selected the [#10 implementation plan](../superpowers/plans/2026-10-24-issue-10-implementation-plan.md#screen-reference-and-presentation-contract) as the reference for every screen and remaining F2/F6/F7/F8 issue. The PDF has 22 Admin pages; it does not contain Booth or dialog pages. Current #35 separately records approval of the Dashboard Live Event card and History filters, which were missing from the local F7 plan and acceptance trace.

## Decision

- Make the main implementation plan the single screen-reference and presentation index. Store the unchanged PDF, 22 page PNGs and checksum manifest under `docs/references/2026-11-06-instax-booth/`. Capability plans and GitHub issues cite that index and their A/B/D screen identifiers.
- Adopt the November presentation across Admin and Booth: cream, dark green ink and coral; Manrope UI type with limited Libre Baskerville editorial headings. Exact reference values, interpretation rules and retained responsive/accessibility constraints live in the main plan. Reuse existing shared components and semantic roles. Admin retains light/dark preference; Booth remains state-specific and independent.
- Identify the 30 Booth frames, 19 dialogs and three boards from the local November Figma inventory as supplementary links, not extracted PDF pages or freshly inspected remote frames. Missing dark/responsive/error/recovery variants still need implementation and verification against written requirements.
- Remove the former presentation collection and standalone presentation guide from the maintained tree after preserving dated review/implementation evidence. Git revision `969e27eaa9082992ed58bbacd1b8c32c4393fbf0` preserves the earlier files.
- Synchronize F7's already-approved Live card, History filters, read-only detail and F7-01–F7-06 ownership with the PRD, functional spec, local plan and shared trace. The trace remains the single acceptance-evidence record.

## Boundaries and consequences

PRD, architecture, glossary, ADR-0025–0032 and the replacement contract retain authority over product behavior, accounting, security, privacy, retention and release gates. Screen samples do not authorize new fields, routes or capabilities. In particular, preserve the unavailable-media sections and cleanup reminder, independent recovery blockers, explicit Resume, no automatic resend and truthful ejection completion.

This change updates references and work orders; it does not change the application or establish visual/runtime acceptance. Earlier software/visual evidence remains dated. Later styling or shared-component changes require affected browser/regression checks. F2 stays open and completes last; F8's upload-disabled candidate cannot close #10 before full #30 acceptance. Physical #17 and actual-iPad #7 gates remain open.
