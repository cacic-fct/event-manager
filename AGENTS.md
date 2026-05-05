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

We use Prettier for code formatting. Its package is installed in every project.
