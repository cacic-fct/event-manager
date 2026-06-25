import { Permission } from '@cacic-fct/shared-permissions';
import { PublicationTargetType } from '@cacic-fct/shared-data-types';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { GraphqlContext } from '../current-user/selects';

export function getPublicationUser(context: GraphqlContext): AuthenticatedUser | undefined {
  return context.req?.user ?? context.request?.user;
}

export function resolvePublicationActorId(user: AuthenticatedUser | undefined): string {
  return user?.sub ?? user?.email ?? user?.preferredUsername ?? 'unknown-admin';
}

export function resolvePublicationActorName(user: AuthenticatedUser | undefined): string {
  return user?.preferredUsername ?? user?.email ?? user?.sub ?? 'Administração';
}

export function readPublicationPermission(targetType: PublicationTargetType): Permission {
  if (targetType === PublicationTargetType.MAJOR_EVENT) {
    return Permission.MajorEvent.Read;
  }
  if (targetType === PublicationTargetType.EVENT_GROUP) {
    return Permission.EventGroup.Read;
  }
  return Permission.Event.Read;
}

export async function assertPublicationTargetPermission(
  authorizationPolicy: AuthorizationPolicyService,
  user: AuthenticatedUser | undefined,
  targetType: PublicationTargetType,
  targetId: string,
  permission: Permission,
): Promise<void> {
  if (targetType === PublicationTargetType.EVENT) {
    await authorizationPolicy.assertPermissions(user, [permission], { eventId: targetId });
    return;
  }
  if (targetType === PublicationTargetType.MAJOR_EVENT) {
    const effectivePermission = permission === Permission.Event.Update ? Permission.MajorEvent.Update : permission;
    await authorizationPolicy.assertPermissions(user, [effectivePermission], { majorEventId: targetId });
    return;
  }
  const effectivePermission = permission === Permission.Event.Update ? Permission.EventGroup.Update : permission;
  await authorizationPolicy.assertPermissions(user, [effectivePermission], { eventGroupId: targetId });
}
