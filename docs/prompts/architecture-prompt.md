> **Historical input.** This is the original architecture request, retained as project history. It is not the current technical specification. Follow the [architecture](../../ARCHITECTURE.md), [PRD](../../PRD.md), [design system](../../DESIGN_SYSTEM.md), [glossary](../../GLOSSARY.md), and [decision records](../adr/) when implementing the product. Where this prompt differs, those current documents take precedence.

Let's design [ARCHITECTURE.md](http://ARCHITECTURE.md)

We need to define how data flows for our proposed system and requirements.

We need to define the data models that will be needed for our product.

I'll define the tech stack:

Frontend:

- We'll be using Next.js, React, and TailwindCSS for our frontend
- We'll use shadcn/ui components, and some lucide icons for UI design.

Language:

- We'll use TypeScript as the main programming language

Backend:

- We'll be using Supabase to help us on the backend. Including Supabase Auth, Supabase Postgres Database, Supabase  Storage, etc

Testing:

- We'll use Vitest for unit/integration testing
- Playwright for e2e browser testing
- React Testing Library
- We'll use Zod, and React Hook Form as well.

Deployment:

- We can use Docker
-  GitHub Actions for CI/CD automation.
- We can use Cloudflare (if free)
- We can also use Vercel.
