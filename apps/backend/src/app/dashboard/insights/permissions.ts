import { formatPermissionGroups } from '@cacic-fct/shared-permissions';
import { AuthorizationPolicyService } from '../../authorization/authorization-policy.service';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { DashboardPermissionGroup } from '../models';
import { DASHBOARD_PERMISSION_REQUIREMENTS } from './constants';

export async function resolveDashboardPermissions(
  authorizationPolicy: AuthorizationPolicyService,
  authenticatedUser: AuthenticatedUser,
): Promise<{
  permissions: string[];
  cacheable: boolean;
}> {
  const permissions = await authorizationPolicy.evaluateGlobalPermissions(
    authenticatedUser,
    DASHBOARD_PERMISSION_REQUIREMENTS,
  );

  return {
    permissions: [...permissions].sort(),
    cacheable: true,
  };
}

export function formatPermissions(permissions: string[]): DashboardPermissionGroup[] {
  return formatPermissionGroups(permissions);
}
