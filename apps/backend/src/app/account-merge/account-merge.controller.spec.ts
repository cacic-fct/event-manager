import { BadRequestException, ForbiddenException, UnauthorizedException, type ArgumentMetadata } from '@nestjs/common';
import { validate } from 'class-validator';
import { publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import { AccountMergeController } from './account-merge.controller';
import {
  AccountMergeAcknowledgementDto,
  AccountMergeNotificationDto,
  AccountMergeScoreRequestDto,
} from './dto';
import { ALLOW_NON_ONBOARDED_KEY, REQUIRED_ROLES_KEY } from '../auth/auth.constants';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { REST_VALIDATION_PIPE } from '../common/rest-validation.pipe';

describe('AccountMergeController', () => {
  let accountMergeService: {
    scoreAccountMergeCandidates: jest.Mock;
    acknowledgeAccountMerge: jest.Mock;
  };
  let keycloakAuthService: {
    assertMachineToMachinePrincipal: jest.Mock;
  };
  let controller: AccountMergeController;

  beforeEach(() => {
    accountMergeService = {
      scoreAccountMergeCandidates: jest.fn(),
      acknowledgeAccountMerge: jest.fn(),
    };
    keycloakAuthService = {
      assertMachineToMachinePrincipal: jest.fn((user: AuthenticatedUser | undefined) => user),
    };
    controller = new AccountMergeController(accountMergeService as never, keycloakAuthService as never);
  });

  it('declares the non-onboarded internal boundary and distinct M2M roles', () => {
    expect(Reflect.getMetadata(ALLOW_NON_ONBOARDED_KEY, AccountMergeController)).toBe(true);
    expect(Reflect.getMetadata(REQUIRED_ROLES_KEY, AccountMergeController.prototype.score)).toEqual([
      'account-merge:score',
    ]);
    expect(Reflect.getMetadata(REQUIRED_ROLES_KEY, AccountMergeController.prototype.merge)).toEqual([
      'account-merge:write',
    ]);
  });

  it('authorizes and forwards score requests without changing the candidate payload', async () => {
    const request = { user: authenticatedUser({ sub: 'score-service' }) };
    const body = { userIds: ['candidate-a', 'candidate-b'] };
    const response = { scores: { 'candidate-a': 4, 'candidate-b': 12 } };
    accountMergeService.scoreAccountMergeCandidates.mockResolvedValue(response);

    await expect(controller.score(request as never, body)).resolves.toBe(response);

    expect(keycloakAuthService.assertMachineToMachinePrincipal).toHaveBeenCalledWith(request.user, {
      requiredRoles: ['account-merge:score'],
    });
    expect(accountMergeService.scoreAccountMergeCandidates).toHaveBeenCalledWith(body);
  });

  it.each([
    ['azp', { azp: '  account-service  ', client_id: 'ignored-client' }, 'account-service'],
    ['client_id', { client_id: '  account-service  ' }, 'account-service'],
    ['subject', {}, 'merge-service'],
  ])('attributes merge acknowledgement to the %s client identity', async (_source, claims, expectedClientId) => {
    const requestUser = authenticatedUser({ sub: 'merge-service', claims });
    const body = {
      eventId: 'merge-event-1',
      type: 'account.merged',
      oldUserId: 'old-user',
      newUserId: 'new-user',
      occurredAt: publicFixtureDateFromNow(1),
    };
    const response: AccountMergeAcknowledgementDto = {
      ...body,
      status: 'success',
    };
    accountMergeService.acknowledgeAccountMerge.mockResolvedValue(response);

    await expect(controller.merge({ user: requestUser } as never, body)).resolves.toBe(response);

    expect(keycloakAuthService.assertMachineToMachinePrincipal).toHaveBeenCalledWith(requestUser, {
      requiredRoles: ['account-merge:write'],
    });
    expect(accountMergeService.acknowledgeAccountMerge).toHaveBeenCalledWith(body, expectedClientId);
  });

  it.each([
    ['score', 'account-merge:score', 'scoreAccountMergeCandidates'],
    ['merge', 'account-merge:write', 'acknowledgeAccountMerge'],
  ] as const)('does not call the %s service operation when M2M authentication fails', async (operation, role, serviceMethod) => {
    keycloakAuthService.assertMachineToMachinePrincipal.mockImplementation(() => {
      throw operation === 'score'
        ? new UnauthorizedException('Missing service credentials.')
        : new ForbiddenException('Missing required M2M role.');
    });

    const invocation =
      operation === 'score'
        ? controller.score({ user: undefined } as never, { userIds: ['candidate-a'] })
        : controller.merge({ user: undefined } as never, {
            eventId: 'merge-event-1',
            type: 'account.merged',
            oldUserId: 'old-user',
            newUserId: 'new-user',
            occurredAt: publicFixtureDateFromNow(1),
          });

    await expect(invocation).rejects.toBeInstanceOf(operation === 'score' ? UnauthorizedException : ForbiddenException);
    expect(accountMergeService[serviceMethod]).not.toHaveBeenCalled();
  });

  it('propagates account-merge service failures without exposing a second payload', async () => {
    const failure = new BadRequestException('Inconsistent merge event.');
    accountMergeService.acknowledgeAccountMerge.mockRejectedValue(failure);
    const body = {
      eventId: 'merge-event-1',
      type: 'account.merged',
      oldUserId: 'old-user',
      newUserId: 'new-user',
      occurredAt: publicFixtureDateFromNow(1),
    };

    await expect(controller.merge({ user: authenticatedUser({ sub: 'merge-service' }) } as never, body)).rejects.toBe(
      failure,
    );
    expect(accountMergeService.acknowledgeAccountMerge).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid score and merge DTOs through the configured REST validation contract', async () => {
    await expect(
      REST_VALIDATION_PIPE.transform(
        { userIds: ['candidate-a', 7] },
        bodyMetadata(AccountMergeScoreRequestDto),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      REST_VALIDATION_PIPE.transform(
        {
          eventId: 'merge-event-1',
          type: 'account.merged',
          oldUserId: 'old-user',
          newUserId: 'new-user',
          occurredAt: 'not-a-date',
        },
        bodyMetadata(AccountMergeNotificationDto),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps the DTO classes free of unexpected validation-pass fields', async () => {
    const errors = await validate(Object.assign(new AccountMergeScoreRequestDto(), { userIds: ['candidate-a'] }));

    expect(errors).toHaveLength(0);
    await expect(
      REST_VALIDATION_PIPE.transform(
        { userIds: ['candidate-a'], privateData: 'must-not-cross-the-boundary' },
        bodyMetadata(AccountMergeScoreRequestDto),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

function bodyMetadata(metatype: typeof AccountMergeScoreRequestDto | typeof AccountMergeNotificationDto): ArgumentMetadata {
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
