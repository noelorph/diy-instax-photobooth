# November 2026 reference extraction

The supplied [PDF](source.pdf) contains 22 Admin screens. Each page is rendered unchanged to a separate PNG in `admin/`, using the original page dimensions. The [manifest](manifest.json) lists every screen file, page, dimensions and SHA-256 checksum.

Source: `Instax Booth · New design reference · Nov 2026.pdf`, extracted on 2026-11-06 using macOS PDFKit. Source SHA-256: `bb97d79a34fd334bfe4e5ea549cd14893d095a8f5310a321913e4441d99f0dba`.

The PDF includes Dashboard, Events, Draft editor/setup, unavailable media, Live Event, History/detail, Profile, authentication and phone recovery screens. It contains no Booth or dialog pages. The manifest separately records 30 Booth frames, 19 dialogs and three reference boards from the [November 5 Figma inventory and drawing sources](../../../artifacts/design-reference-2026-11-05/README.md); those are provenance links, not extracted files or freshly verified remote designs.

The [issue #10 implementation plan](../../superpowers/plans/2026-10-24-issue-10-implementation-plan.md#screen-reference-and-presentation-contract) is the canonical per-screen reference and capability map under [ADR-0034](../../adr/0034-use-november-screen-reference-in-implementation-plan.md). This reference migration does not establish application adoption or acceptance evidence.
