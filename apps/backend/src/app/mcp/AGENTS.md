# MCP backend guide

- Reuse `shared/` for the stateless HTTP transport, OAuth resource admission, account eligibility, browser review session checks, signed previews, and fixed GraphQL operations. Each MCP surface owns its routes, audience, OAuth scopes, client allowlist, operation catalog, delegations, authorization and approval policy.
- Build GraphQL operations from server-owned field names and projections. Validate request arguments with `parseMcpGraphqlArguments` before applying policy or passing values to `executeMcpGraphqlOperation`. Reuse the owning GraphQL resolver or domain service, with its usual authorization, ownership, visibility and eligibility checks.
- The admin GraphQL bridge runs with a request-bound internal principal and the admin read/apply context. Keep that context scoped to the admin bridge. Treat a user-facing operation's allowed arguments and result fields as its own contract.
- Review sessions authenticate the human. The calling surface authorizes the proposed change and its targets. Bind signed previews to a purpose unique to the surface and workflow, plus the authenticated actor, proposal identity and reviewed values.
- Run `bunx nx test backend --runInBand --testPathPatterns=mcp` and `bunx nx lint backend`. Run `bunx nx run backend:test-mcp-postgres` when changes touch command application or persistence boundaries.
