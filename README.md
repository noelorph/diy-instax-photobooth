# DIY Instax Photo Booth

A web-based Event photo booth with an Admin application and Guest-facing Booth Mode. The first release targets an iPad A16 running Bluefy with an Instax Mini Link 3 printer. Direct browser printing remains conditional on the target-device trial described in the PRD.

## Project guides

- [Product requirements](PRD.md): behavior, scope, and launch gates
- [Design system](DESIGN_SYSTEM.md): visual language, interaction patterns, responsive layouts, and accessibility
- [Architecture](ARCHITECTURE.md): proposed system design and technical boundaries
- [Glossary](GLOSSARY.md): canonical product language
- [Decision records](docs/adr/): durable product and technical decisions

Read the PRD and design system before implementing an interface. The design system governs presentation; the PRD governs product behavior.

The first-release Admin authentication requirements cover `/sign-in`, `/forgot-password`, and `/reset-password`; **Sign out** belongs on `/profile`. See the [Admin experience](PRD.md#5-admin-experience) for the behavior of each page.

## Local development

This repository currently contains a Next.js 16 starter app and the product/design documentation. Install dependencies with `npm ci`, then run `npm run dev` and open `http://localhost:3000`. Available checks include `npm run lint`, `npm run format:check`, and `npm test`. The authentication, Admin, and Booth Mode flows described in the guides are not yet implemented.
