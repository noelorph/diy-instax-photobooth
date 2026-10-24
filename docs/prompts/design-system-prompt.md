> **Historical input.** This is the original visual-design request, retained as project history. It is not the current UI specification. Follow the [design system](../../DESIGN_SYSTEM.md), [PRD](../../PRD.md), [architecture](../../ARCHITECTURE.md), [glossary](../../GLOSSARY.md), and [decision records](../adr/) when implementing the product. Where this prompt differs, those current documents take precedence.

You are designing the visual foundation for the DIY-INSTAX-PHOTOBOOTH.

Your task is to create a comprehensive, opinionated, implementation-ready DESIGN_SYSTEM.md that will serve as the visual and interaction source of truth for all future UI development. **Do not create a generic design system.**


The system must be specifically designed around the [PRD.md](../../PRD.md) and visual direction provided below.

PRODUCT NAME:

- DIY-INSTAX-PHOTOBOOTH

PRODUCT TYPE:

- Web application photo booth system made for events.
- It also includes a separate Admin Dashboard, Events, History, and Profile pages from the Booth Mode.

TARGET USER:

- This is made for a one Admin that can access the Admin pages.
- Booth Mode was made for Guests in the events.

PRIMARY PURPOSE:

- The primary purpose of this product is to make a photo booth system for special occasions.
- The future owner of this product would want an Admin pages as well in the same application so that he can see summaries, history, events, and setup events and booth mode.


VISUAL DIRECTION:

- I want the product to feel like a business product for Admin pages.
- While the Booth Mode has its own interface, it should still feel friendly and cool for everyone.

Desired Characteristics:

- Calm
- Professional
- Admin-friendly
- Guest-friendly

Avoid:

- Generic gradient
- Excessive rounded cards
- Excessive shadows
- Visual clutter
- overly playful UI


GOAL:

We need to define:

- Design Philosophy
- Design Tokens - Include color, typography, spacing, layout, border radius, borders, elevation, etc.
- Component System - Include potential components (do not automatically include every possbile component), foundational component architecture, component variants, interaction state, and responsive design for the booth device (iPad A16) but also include laptop, and mobile phones.
- Iconography
- Imagery
- Empty states
- Accessibility
- Define anti-patterns

For agents:

- Design decision rules
- Implementation contract

Validation:

Before finalizing the document, perform a design-system consistency review.

Check:

- Are all tokens coherent?
- Are colors semantically named?
- Is typography hierarchical?
- Is spacing consistent?
- Are component variants justified?
- Are responsive rules clear?
- Are interaction states defined?
- Are accessibility requirements explicit?
- Are there contradictions?
- Are there unnecessary components?
- Could another coding agent implement a page using only this document and the product requirements?


Open questions:
- Do you have reference suggestions for inspiration, and not instruction to copy another product?
