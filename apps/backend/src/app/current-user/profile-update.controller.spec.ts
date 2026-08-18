import { BadRequestException, ForbiddenException, UnauthorizedException, type ArgumentMetadata } from '@nestjs/common';
import { AccountProfileUpdateController } from './profile-update.controller';
import { AccountProfileUpdateDto } from './profile-update.dto';
import { ALLOW_NON_ONBOARDED_KEY, REQUIRED_ROLES_KEY } from '../auth/auth.constants';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { REST_VALIDATION_PIPE } from '../common/rest-validation.pipe';

describe('AccountProfileUpdateController', () => {
  let currentUserContext: {
    syncProfileUpdate: jest.Mock;
  };
  let keycloakAuthService: {
    assertMachineToMachinePrincipal: jest.Mock;
  };
  let controller: AccountProfileUpdateController;

  beforeEach(() => {
    currentUserContext = {
      syncProfileUpdate: jest.fn(),
    };
    keycloakAuthService = {
      assertMachineToMachinePrincipal: jest.fn(),
    };
    controller = new AccountProfileUpdateController(currentUserContext as never, keycloakAuthService as never);
  });

  it('declares the non-onboarded internal boundary and profile-write role', () => {
    expect(Reflect.getMetadata(ALLOW_NON_ONBOARDED_KEY, AccountProfileUpdateController)).toBe(true);
    expect(Reflect.getMetadata(REQUIRED_ROLES_KEY, AccountProfileUpdateController.prototype.updated)).toEqual([
      'account-profile:write',
    ]);
  });

  it('authorizes and forwards the complete profile payload while returning only local identity ids', async () => {
    const requestUser = authenticatedUser({ sub: 'account-service' });
    const body = {
      userId: 'keycloak-user-1',
      email: 'person@example.com',
      name: 'Person',
      fullname: 'Person Example',
      phone: '+5518999999999',
      identityDocument: '12345678901',
      academicId: '20240001',
      unespRole: ['student', 'researcher'],
      isOnboarded: true,
    };
    currentUserContext.syncProfileUpdate.mockResolvedValue({
      user: { id: 'local-user-1' },
      person: { id: 'local-person-1' },
    });

    await expect(controller.updated({ user: requestUser } as never, body)).resolves.toEqual({
      status: 'success',
      userId: 'local-user-1',
      personId: 'local-person-1',
    });

    expect(keycloakAuthService.assertMachineToMachinePrincipal).toHaveBeenCalledWith(requestUser, {
      requiredRoles: ['account-profile:write'],
    });
    expect(currentUserContext.syncProfileUpdate).toHaveBeenCalledWith(body);
  });

  it('returns null ids when synchronization finds no local projections', async () => {
    const body = { userId: 'keycloak-user-2', name: 'Unmatched user' };
    currentUserContext.syncProfileUpdate.mockResolvedValue({ user: undefined, person: null });

    await expect(
      controller.updated({ user: authenticatedUser({ sub: 'account-service' }) } as never, body),
    ).resolves.toEqual({
      status: 'success',
      userId: null,
      personId: null,
    });
  });

  it.each([
    ['missing credentials', new UnauthorizedException('Missing service credentials.')],
    ['missing role', new ForbiddenException('Missing required M2M role.')],
  ] as const)('does not synchronize a profile when M2M authorization fails: %s', async (_case, failure) => {
    keycloakAuthService.assertMachineToMachinePrincipal.mockImplementation(() => {
      throw failure;
    });
    const request = { user: undefined };
    const body = { userId: 'keycloak-user-1' };

    await expect(controller.updated(request as never, body)).rejects.toBe(failure);

    expect(keycloakAuthService.assertMachineToMachinePrincipal).toHaveBeenCalledWith(request.user, {
      requiredRoles: ['account-profile:write'],
    });
    expect(currentUserContext.syncProfileUpdate).not.toHaveBeenCalled();
  });

  it('propagates synchronization failures without manufacturing an acknowledgement', async () => {
    const failure = new BadRequestException('Profile update cannot be synchronized.');
    currentUserContext.syncProfileUpdate.mockRejectedValue(failure);

    await expect(
      controller.updated(
        { user: authenticatedUser({ sub: 'account-service' }) } as never,
        { userId: 'keycloak-user-1' },
      ),
    ).rejects.toBe(failure);
  });

  it('rejects malformed profile payloads through the configured REST validation contract', async () => {
    await expect(REST_VALIDATION_PIPE.transform({}, bodyMetadata())).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      REST_VALIDATION_PIPE.transform({ userId: 'keycloak-user-1', email: 'not-an-email' }, bodyMetadata()),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      REST_VALIDATION_PIPE.transform({ userId: 'keycloak-user-1', unespRole: ['student', 7] }, bodyMetadata()),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      REST_VALIDATION_PIPE.transform({ userId: 'keycloak-user-1', isOnboarded: 'true' }, bodyMetadata()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unexpected profile fields instead of passing private data to synchronization', async () => {
    await expect(
      REST_VALIDATION_PIPE.transform(
        { userId: 'keycloak-user-1', privateData: 'must-not-cross-the-boundary' },
        bodyMetadata(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

function bodyMetadata(): ArgumentMetadata {
  return {
    type: 'body',
    metatype: AccountProfileUpdateDto,
    data: '',
  };
}

function authenticatedUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    realm_access: { roles: [] },
    token: 'service-token',
    roles: [],
    roleSet: new Set(),
    permissions: [],
    permissionSet: new Set(),
    oidcScopes: [],
    oidcScopeSet: new Set(),
    scopes: [],
    scopeSet: new Set(),
    claims: {},
    ...overrides,
  };
}
