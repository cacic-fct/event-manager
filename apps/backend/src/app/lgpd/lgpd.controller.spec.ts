import { BadRequestException, ForbiddenException, UnauthorizedException, type ArgumentMetadata } from '@nestjs/common';
import { LgpdController } from './lgpd.controller';
import { LgpdDeletionRequestDto, LgpdUserRequestDto } from './dto';
import { ALLOW_NON_ONBOARDED_KEY, REQUIRED_ROLES_KEY } from '../auth/auth.constants';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { REST_VALIDATION_PIPE } from '../common/rest-validation.pipe';

describe('LgpdController', () => {
  let keycloakAuthService: {
    assertMachineToMachinePrincipal: jest.Mock;
  };
  let lgpdService: {
    collectUserData: jest.Mock;
    scheduleDeletion: jest.Mock;
    hardDelete: jest.Mock;
  };
  let controller: LgpdController;

  beforeEach(() => {
    keycloakAuthService = {
      assertMachineToMachinePrincipal: jest.fn(),
    };
    lgpdService = {
      collectUserData: jest.fn(),
      scheduleDeletion: jest.fn(),
      hardDelete: jest.fn(),
    };
    controller = new LgpdController(keycloakAuthService as never, lgpdService as never);
  });

  it('declares the non-onboarded internal boundary and exact privacy roles', () => {
    expect(Reflect.getMetadata(ALLOW_NON_ONBOARDED_KEY, LgpdController)).toBe(true);
    expect(Reflect.getMetadata(REQUIRED_ROLES_KEY, LgpdController.prototype.userData)).toEqual(['lgpd:read']);
    expect(Reflect.getMetadata(REQUIRED_ROLES_KEY, LgpdController.prototype.scheduleDeletion)).toEqual(['lgpd:delete']);
    expect(Reflect.getMetadata(REQUIRED_ROLES_KEY, LgpdController.prototype.hardDelete)).toEqual(['lgpd:delete']);
  });

  it('forwards data-export requests unchanged and returns the service projection without adding identity data', async () => {
    const request = { user: authenticatedUser({ sub: 'lgpd-service' }) };
    const body = { userId: 'subject-1', email: 'subject@example.com' };
    const exportData = {
      identity: { userId: 'subject-1' },
      subscriptions: [],
      attendances: [],
    };
    lgpdService.collectUserData.mockResolvedValue(exportData);

    await expect(controller.userData(request as never, body)).resolves.toBe(exportData);

    expect(keycloakAuthService.assertMachineToMachinePrincipal).toHaveBeenCalledWith(request.user, {
      requiredRoles: ['lgpd:read'],
    });
    expect(lgpdService.collectUserData).toHaveBeenCalledWith(body);
  });

  it.each([
    ['scheduleDeletion', 'scheduleDeletion', { userId: 'subject-1', email: 'subject@example.com', event: 'account-deletion.schedule', requestId: 'request-1' }],
    ['hardDelete', 'hardDelete', { userId: 'subject-1', email: 'subject@example.com', event: 'account-deletion.delete', requestId: 'request-1' }],
  ] as const)('forwards %s deletion requests and preserves the service result', async (operation, serviceMethod, body) => {
    const request = { user: authenticatedUser({ sub: 'lgpd-service' }) };
    const result = { status: 'success', requestId: body.requestId, retainedCategories: ['certificates'] };
    lgpdService[serviceMethod].mockResolvedValue(result);

    const response =
      operation === 'scheduleDeletion'
        ? await controller.scheduleDeletion(request as never, body)
        : await controller.hardDelete(request as never, body);

    expect(response).toBe(result);
    expect(keycloakAuthService.assertMachineToMachinePrincipal).toHaveBeenCalledWith(request.user, {
      requiredRoles: ['lgpd:delete'],
    });
    expect(lgpdService[serviceMethod]).toHaveBeenCalledWith(body);
  });

  it.each([
    ['userData', 'lgpd:read'],
    ['scheduleDeletion', 'lgpd:delete'],
    ['hardDelete', 'lgpd:delete'],
  ] as const)('does not call %s when M2M authorization fails', async (operation, role) => {
    keycloakAuthService.assertMachineToMachinePrincipal.mockImplementation(() => {
      throw new UnauthorizedException('Missing service credentials.');
    });
    const request = { user: undefined };
    const userBody = { userId: 'subject-1' };
    const deletionBody = {
      userId: 'subject-1',
      event: 'account-deletion.schedule',
      requestId: 'request-1',
    };

    const invoke = () =>
      operation === 'userData'
        ? controller.userData(request as never, userBody)
        : operation === 'scheduleDeletion'
          ? controller.scheduleDeletion(request as never, deletionBody)
          : controller.hardDelete(request as never, deletionBody);

    await expect(Promise.resolve().then(invoke)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(keycloakAuthService.assertMachineToMachinePrincipal).toHaveBeenCalledWith(request.user, {
      requiredRoles: [role],
    });
    expect(lgpdService.collectUserData).not.toHaveBeenCalled();
    expect(lgpdService.scheduleDeletion).not.toHaveBeenCalled();
    expect(lgpdService.hardDelete).not.toHaveBeenCalled();
  });

  it('propagates service errors without changing privacy error semantics', async () => {
    const failure = new ForbiddenException('Deletion is not allowed yet.');
    lgpdService.scheduleDeletion.mockRejectedValue(failure);

    await expect(
      controller.scheduleDeletion(
        { user: authenticatedUser({ sub: 'lgpd-service' }) } as never,
        { userId: 'subject-1', event: 'account-deletion.schedule', requestId: 'request-1' },
      ),
    ).rejects.toBe(failure);
  });

  it('rejects malformed export and deletion DTOs through the REST validation pipe', async () => {
    await expect(
      REST_VALIDATION_PIPE.transform({ email: 'not-an-email' }, bodyMetadata(LgpdUserRequestDto)),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      REST_VALIDATION_PIPE.transform(
        { userId: 'subject-1', event: 'account-deletion.schedule' },
        bodyMetadata(LgpdDeletionRequestDto),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      REST_VALIDATION_PIPE.transform(
        {
          userId: 'subject-1',
          event: 'account-deletion.schedule',
          requestId: 'request-1',
          privateData: 'must-not-cross-the-boundary',
        },
        bodyMetadata(LgpdDeletionRequestDto),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

function bodyMetadata(metatype: typeof LgpdUserRequestDto | typeof LgpdDeletionRequestDto): ArgumentMetadata {
  return {
    type: 'body',
    metatype,
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
