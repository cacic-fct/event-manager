---
applyTo: '**'
---

# Working agreement

- Frontend strings must be Brazilian Portuguese; use natural punctuation or line breaks, avoiding the middle dot (`·`).
- If in doubt about requirements, ask for clarification. Make a TODO list for work with multiple steps.
- Check `git status --short` before editing and preserve unrelated local changes.
- Code legibility matters. Prefer small, explicit changes and reuse existing domain helpers.
- Use Bun/Bunx for package management and commands; do not use npm, npx, yarn or pnpm. Server runtime is Node.
- Do not run Prettier, other formatters, the staged-formatting script or lint with `--fix`. Do run lint.
- Never expose secrets, private environment files, production snapshots or credentials in documentation or tool output.

# Load the guidance for the work

Read the applicable scoped `AGENTS.md` and its linked guides before editing. Frontend conventions, backend rules and database procedures live in their owning scopes rather than here.

| Work | Start here |
| --- | --- |
| API, domain mutations, audit, authorization, queues | [Backend](apps/backend/AGENTS.md) |
| Schema, migrations or generated Prisma metadata | [Prisma](apps/backend/prisma/AGENTS.md) |
| Public app and offline behavior | [Public app](apps/public/AGENTS.md) |
| Administrative app | [Admin app](apps/admin/AGENTS.md) |
| Shared logic, contracts, UI and fixtures | [Libraries](libs/AGENTS.md) |
| Angular code, including shared UI libraries | [Angular conventions](agent-guides/angular.md) |
| Frontend browser tests | [Frontend E2E](agent-guides/frontend-e2e.md) |
| Backend integration/E2E tests | [Backend E2E](apps/backend-e2e/AGENTS.md) |

`docs/` contains human-facing documentation, primarily in Portuguese. Keep agent implementation guidance in scoped agent files or short guides beside the code; link existing explanations instead of copying them. Update human docs too when behavior changes or they contradict the implementation. Keep instructions grounded in current code and tests, rather than historical branch or deployment state.

# Shared engineering rules

- Use strict TypeScript, infer obvious types and prefer `unknown` over `any`.
- Use Nx generators when introducing a library for code shared between frontend and backend. Search existing libraries first and respect the scope boundaries in `eslint.config.mjs`.
- Update meaningful regression tests when behavior changes. Reuse shared fixtures and test utilities; avoid hardcoded dates unless the clock is mocked.
- Authorization, privacy, publication, auditing and operational eligibility require validation at the backend boundary, even when the UI also restricts an action. Follow the backend mutation workflow when a feature crosses layers.
- Inspect each project's `project.json` and test config before choosing commands: runners differ and some Nx targets are inferred. Run focused tests while iterating, then appropriate checks for the final change.
- Finish with lint for affected projects and `git diff --check`. Report checks run, failures, unverified behavior and any external setup still needed. Do not reuse historical test results as current validation.
- Verify applied migrations, deployment and external workflow publication separately from local code checks.

# Domain vocabulary

| English | Brazilian Portuguese | Meaning |
| --- | --- | --- |
| Standalone event | Evento | An event outside an event group or major event |
| Standalone event group | Grupo de eventos | An event group outside a major event |
| Major event | Grande evento | A parent that encompasses event groups and/or events |

Do not infer identical rules for these resource types: permission scopes, publication, freezing and certificate eligibility use their actual relationships.
