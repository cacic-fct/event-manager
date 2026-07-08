import { PublicationTargetType } from '@cacic-fct/shared-data-types';
import { Permission } from '@cacic-fct/shared-permissions';
import {
  assertPublicationTargetPermission,
  getPublicationUser,
  readPublicationPermission,
  resolvePublicationActorId,
  resolvePublicationActorName,
} from './publishing-auth';

describe('publishing auth helpers', () => {
  it('reads the authenticated user from either GraphQL context request shape', () => {
    const reqUser = { sub: 'req-user' };
    const requestUser = { sub: 'request-user' };

    expect(getPublicationUser({ req: { user: reqUser }, request: { user: requestUser } } as never)).toBe(reqUser);
    expect(getPublicationUser({ request: { user: requestUser } } as never)).toBe(requestUser);
    expect(getPublicationUser({} as never)).toBeUndefined();
  });

  it('resolves audit actor identifiers and names using stable fallback order', () => {
    expect(resolvePublicationActorId({ sub: 'admin-1', email: 'admin@example.com' } as never)).toBe('admin-1');
    expect(resolvePublicationActorId({ email: 'admin@example.com', preferredUsername: 'admin' } as never)).toBe(
      'admin@example.com',
    );
    expect(resolvePublicationActorId({ preferredUsername: 'admin' } as never)).toBe('admin');
    expect(resolvePublicationActorId(undefined)).toBe('unknown-admin');

    expect(resolvePublicationActorName({ preferredUsername: 'admin', email: 'admin@example.com' } as never)).toBe(
      'admin',
    );
    expect(resolvePublicationActorName({ email: 'admin@example.com', sub: 'admin-1' } as never)).toBe(
      'admin@example.com',
    );
    expect(resolvePublicationActorName({ sub: 'admin-1' } as never)).toBe('admin-1');
    expect(resolvePublicationActorName(undefined)).toBe('Administração');
  });

  it.each([
    [PublicationTargetType.EVENT, Permission.Event.Read],
    [PublicationTargetType.EVENT_GROUP, Permission.EventGroup.Read],
    [PublicationTargetType.MAJOR_EVENT, Permission.MajorEvent.Read],
  ])('maps %s targets to the read permission', (targetType, expectedPermission) => {
    expect(readPublicationPermission(targetType)).toBe(expectedPermission);
  });

  it.each([
    [
      PublicationTargetType.EVENT,
      Permission.Event.Update,
      [Permission.Event.Update],
      { eventId: 'target-1' },
    ],
    [
      PublicationTargetType.EVENT_GROUP,
      Permission.Event.Update,
      [Permission.EventGroup.Update],
      { eventGroupId: 'target-1' },
    ],
    [
      PublicationTargetType.EVENT_GROUP,
      Permission.Event.Read,
      [Permission.Event.Read],
      { eventGroupId: 'target-1' },
    ],
    [
      PublicationTargetType.MAJOR_EVENT,
      Permission.Event.Update,
      [Permission.MajorEvent.Update],
      { majorEventId: 'target-1' },
    ],
    [
      PublicationTargetType.MAJOR_EVENT,
      Permission.MajorEvent.Read,
      [Permission.MajorEvent.Read],
      { majorEventId: 'target-1' },
    ],
  ])('asserts %s target permissions with the correct scope', async (targetType, permission, expectedPermissions, scope) => {
    const authorizationPolicy = {
      assertPermissions: jest.fn().mockResolvedValue(undefined),
    };
    const user = { sub: 'admin-1' };

    await expect(
      assertPublicationTargetPermission(
        authorizationPolicy as never,
        user as never,
        targetType,
        'target-1',
        permission,
      ),
    ).resolves.toBeUndefined();

    expect(authorizationPolicy.assertPermissions).toHaveBeenCalledWith(user, expectedPermissions, scope);
  });
});
