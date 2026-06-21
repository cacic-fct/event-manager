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
  canReadGlobalInsights: boolean;
}> {
  const globalPermissions = await authorizationPolicy.evaluateGlobalPermissions(
    authenticatedUser,
    DASHBOARD_PERMISSION_REQUIREMENTS,
  );
  if (globalPermissions.length > 0) {
    return {
      permissions: [...globalPermissions].sort(),
      cacheable: true,
      canReadGlobalInsights: true,
    };
  }

  const scopedPermissions = await authorizationPolicy.evaluatePermissions(
    authenticatedUser,
    DASHBOARD_PERMISSION_REQUIREMENTS,
  );

  return {
    permissions: [...scopedPermissions].sort(),
    cacheable: false,
    canReadGlobalInsights: false,
  };
}

export function formatPermissions(permissions: string[]): DashboardPermissionGroup[] {
  return formatPermissionGroups(permissions);
}
