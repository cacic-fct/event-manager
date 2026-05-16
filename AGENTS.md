---
applyTo: '**'
---

If in doubt, ask user for clarification.
Make a TODO list if there are multiple steps.

# NX Monorepo

We use Nx as our monorepo tool to manage multiple applications and libraries within a single repository.
When code can be shared between frontend and backend, a library should be created with Nx generators.

# Angular Frontend

For the frontend, we use Angular and Angular Material with the new Angular Material 19+ syntax to build a modern, responsive, and accessible user interface. The frontend is designed to be modular, with lazy loading for feature routes and a focus on performance and maintainability.
We use default Angular Material components and styles, avoiding custom themes to ensure consistency and ease of updates. We use both light and dark themes.
Frontend is always running on background, don't attempt to start it.

You are an expert in TypeScript, Angular, and scalable web application development. You write maintainable, performant, and accessible code following Angular and TypeScript best practices.

## TypeScript Best Practices

- Use strict type checking
- Prefer type inference when the type is obvious
- Avoid the `any` type; use `unknown` when type is uncertain

## Angular Best Practices

- Always use standalone components over NgModules
- Don't use explicit `standalone: true` (it is implied by default)
- Use signals for state management
- Implement lazy loading for feature routes
- Use `NgOptimizedImage` for all static images.

## Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `computed()` for derived state
- Set `changeDetection: ChangeDetectionStrategy.OnPush` in `@Component` decorator
- Prefer inline templates for small components
- Prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- DO NOT use `ngStyle`, use `style` bindings instead

## State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable

## Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables

## Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Use the `inject()` function instead of constructor injection

## Angular SSR

- Write appropriate guards for server-side rendering (SSR) to handle browser-specific APIs and features
- Use Angular's `isPlatformBrowser` and `isPlatformServer` utilities to conditionally execute code based on the rendering context
- New or edited components might need to have their RenderMode set manually to `RenderMode.Server` or `RenderMode.Browser` depending on their use case. Evaluate this on a case-by-case basis.

# NestJS Backend

For the backend, we use NestJS with TypeScript to build a scalable and maintainable server-side application. The backend is designed to be modular, with a focus on clean architecture and separation of concerns.

We use Swagger to document our API, with input and result examples and detailed descriptions for each endpoint.

Whenever appropriate, we prefer GraphQL over REST for API design, leveraging its flexibility and efficiency for data fetching.

The API's global prefix is `/api`.

Backend is always running on background, don't attempt to start it.

# Server

On our servers we use strict CSP (Content Security Policy) headers to enhance security. This includes allowing only trusted sources for scripts, styles, and images, and blocking inline scripts and styles.

# Package manager

We use bun as our package manager for both frontend and backend instead of npm. We still use node instead of bun for server runtime.
Therefore, don't use npm, npx, yarn, or pnpm commands. Use bun and bunx commands instead.

# Code formatting

Do not use Prettier or any other code formatter, user should run these manually.

Do run linting.

# Prisma ORM

After editing `schema.prisma` file and before verifying code for errors or building, you must run the following command to generate a new client:

```bash
bunx prisma generate --schema path/to/schema.prisma
```

Do not run migrations without user confirmation, as they can cause data loss.

# Storybook

We use Storybook for developing and testing our UI components in isolation. 

When creating a new component, you should evaluate if it would benefit from having a Storybook story. If the component has multiple states, complex interactions, or is likely to be reused across the application, it is a good candidate for Storybook documentation.

When writing Storybook stories, focus on showcasing the different states and variations of the component. This includes default state, edge cases, and any interactive behavior. Use Storybook's controls to allow users to manipulate props and see how the component responds.