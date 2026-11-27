import { AsyncLocalStorage } from 'node:async_hooks';
import type { AuthorizationResourceContext } from './authorization-policy.service';

export interface AuthorizationRequirement {
  permissions: string[];
  context: AuthorizationResourceContext;
}

// Internal capture only: successful checks are replayed before serving a stored export.
export const authorizationRequirements = new AsyncLocalStorage<AuthorizationRequirement[]>();

export async function captureAuthorizationRequirements<T>(operation: () => Promise<T>) {
  const requirements: AuthorizationRequirement[] = [];
  const result = await authorizationRequirements.run(requirements, operation);
  const unique = [...new Map(requirements.map((entry) => [JSON.stringify(entry), entry])).values()];
  return { result, requirements: unique };
}
