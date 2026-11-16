import type { Permission } from '@cacic-fct/shared-permissions';
import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import type {
  AuthorizationPolicyService,
  AuthorizationResourceContext,
} from '../authorization/authorization-policy.service';

export async function canReviewContent(
  authorization: AuthorizationPolicyService,
  user: AuthenticatedUser,
  permission: Permission,
  context?: AuthorizationResourceContext,
): Promise<boolean> {
  try {
    await authorization.assertPermissions(user, [permission], context);
    return true;
  } catch (error) {
    if (!(error instanceof ForbiddenException)) throw error;
    return false;
  }
}
