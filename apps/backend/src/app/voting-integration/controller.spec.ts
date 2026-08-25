import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  type ArgumentMetadata,
} from '@nestjs/common';
import { EVENT_MANAGER_M2M_VOTING_ROLES } from '@cacic-fct/event-manager-m2m-contracts';
import { publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import { VotingIntegrationController } from './controller';
import {
  VotingAttendanceCheckRequestDto,
  VotingPeopleLookupRequestDto,
  VotingPersonIdentifierLookupRequestDto,
} from './dto';
import { ALLOW_NON_ONBOARDED_KEY, REQUIRED_ROLES_KEY } from '../auth/auth.constants';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { REST_VALIDATION_PIPE } from '../common/rest-validation.pipe';

describe('VotingIntegrationController', () => {
  let keycloakAuthService: {
    assertMachineToMachinePrincipal: jest.Mock;
  };
  let votingIntegrationService: {
    listLinkableEvents: jest.Mock;
    checkAttendance: jest.Mock;
    lookupPeopleByEnrollmentNumbers: jest.Mock;
    lookupPeopleByIdentifiers: jest.Mock;
  };
  let controller: VotingIntegrationController;

  beforeEach(() => {
    keycloakAuthService = {
      assertMachineToMachinePrincipal: jest.fn(),
    };
    votingIntegrationService = {
      listLinkableEvents: jest.fn(),
      checkAttendance: jest.fn(),
      lookupPeopleByEnrollmentNumbers: jest.fn(),
      lookupPeopleByIdentifiers: jest.fn(),
    };
    controller = new VotingIntegrationController(keycloakAuthService as never, votingIntegrationService as never);
  });

  it('declares the non-onboarded internal boundary and voting-read role on every operation', () => {
    expect(Reflect.getMetadata(ALLOW_NON_ONBOARDED_KEY, VotingIntegrationController)).toBe(true);
    expect(Reflect.getMetadata(REQUIRED_ROLES_KEY, VotingIntegrationController.prototype.listEvents)).toEqual([
      EVENT_MANAGER_M2M_VOTING_ROLES.READ,
    ]);
    expect(Reflect.getMetadata(REQUIRED_ROLES_KEY, VotingIntegrationController.prototype.checkAttendance)).toEqual([
      EVENT_MANAGER_M2M_VOTING_ROLES.READ,
    ]);
    expect(Reflect.getMetadata(REQUIRED_ROLES_KEY, VotingIntegrationController.prototype.lookupPeople)).toEqual([
      EVENT_MANAGER_M2M_VOTING_ROLES.READ,
    ]);
    expect(
      Reflect.getMetadata(REQUIRED_ROLES_KEY, VotingIntegrationController.prototype.lookupPeopleByIdentifier),
    ).toEqual([EVENT_MANAGER_M2M_VOTING_ROLES.READ]);
  });

  it('authorizes and returns the linkable event projection unchanged', async () => {
    const requestUser = authenticatedUser({ sub: 'voting-service' });
    const events = [
      {
        id: 'event-1',
        name: 'Assembleia',
        startDate: publicFixtureDateFromNow(1),
        endDate: publicFixtureDateFromNow(4),
        locationDescription: null,
        shouldCollectAttendance: true,
      },
    ];
    votingIntegrationService.listLinkableEvents.mockResolvedValue(events);

    await expect(controller.listEvents({ user: requestUser } as never)).resolves.toBe(events);

    expect(keycloakAuthService.assertMachineToMachinePrincipal).toHaveBeenCalledWith(requestUser, {
      requiredRoles: [EVENT_MANAGER_M2M_VOTING_ROLES.READ],
    });
    expect(votingIntegrationService.listLinkableEvents).toHaveBeenCalledWith();
  });

  it('forwards attendance checks with the route event id and user id', async () => {
    const requestUser = authenticatedUser({ sub: 'voting-service' });
    const body = { userId: 'keycloak-user-1' };
    const result = { eventId: 'event-1', userId: 'keycloak-user-1', attended: true, attendedAt: null };
    votingIntegrationService.checkAttendance.mockResolvedValue(result);

    await expect(controller.checkAttendance({ user: requestUser } as never, 'event-1', body)).resolves.toBe(result);

    expect(keycloakAuthService.assertMachineToMachinePrincipal).toHaveBeenCalledWith(requestUser, {
      requiredRoles: [EVENT_MANAGER_M2M_VOTING_ROLES.READ],
    });
    expect(votingIntegrationService.checkAttendance).toHaveBeenCalledWith('event-1', 'keycloak-user-1');
  });

  it('forwards enrollment lookup arrays without changing the caller ordering or values', async () => {
    const requestUser = authenticatedUser({ sub: 'voting-service' });
    const body = { enrollmentNumbers: ['20240002', ' 20240001 '] };
    const result = { people: [{ enrollmentNumber: '20240001', name: 'Ada', email: null }] };
    votingIntegrationService.lookupPeopleByEnrollmentNumbers.mockResolvedValue(result);

    await expect(controller.lookupPeople({ user: requestUser } as never, body)).resolves.toBe(result);

    expect(keycloakAuthService.assertMachineToMachinePrincipal).toHaveBeenCalledWith(requestUser, {
      requiredRoles: [EVENT_MANAGER_M2M_VOTING_ROLES.READ],
    });
    expect(votingIntegrationService.lookupPeopleByEnrollmentNumbers).toHaveBeenCalledWith(body.enrollmentNumbers);
  });

  it('forwards private identifier lookup items and returns only the service projection', async () => {
    const requestUser = authenticatedUser({ sub: 'voting-service' });
    const body = {
      identifiers: [
        { requestId: 'candidate-1', identifierType: 'email', identifierValue: 'ada@example.com' },
        { requestId: 'candidate-2', identifierType: 'cpf', identifierValue: '12345678901' },
      ],
    };
    const result = {
      people: [{ requestId: 'candidate-1', enrollmentNumber: '20240001', name: 'Ada', email: 'ada@example.com' }],
    };
    votingIntegrationService.lookupPeopleByIdentifiers.mockResolvedValue(result);

    await expect(controller.lookupPeopleByIdentifier({ user: requestUser } as never, body)).resolves.toBe(result);

    expect(keycloakAuthService.assertMachineToMachinePrincipal).toHaveBeenCalledWith(requestUser, {
      requiredRoles: [EVENT_MANAGER_M2M_VOTING_ROLES.READ],
    });
    expect(votingIntegrationService.lookupPeopleByIdentifiers).toHaveBeenCalledWith(body.identifiers);
  });

  it.each(['list', 'attendance', 'enrollment lookup', 'identifier lookup'] as const)(
    'does not call the voting service when M2M authentication fails: %s',
    async (operation) => {
      const failure =
        operation === 'list'
          ? new UnauthorizedException('Missing service credentials.')
          : new ForbiddenException('Missing required M2M role.');
      keycloakAuthService.assertMachineToMachinePrincipal.mockImplementation(() => {
        throw failure;
      });
      const request = { user: undefined };

      const invoke = () => {
        switch (operation) {
          case 'list':
            return controller.listEvents(request as never);
          case 'attendance':
            return controller.checkAttendance(request as never, 'event-1', { userId: 'user-1' });
          case 'enrollment lookup':
            return controller.lookupPeople(request as never, { enrollmentNumbers: ['20240001'] });
          case 'identifier lookup':
            return controller.lookupPeopleByIdentifier(request as never, {
              identifiers: [{ requestId: 'candidate-1', identifierType: 'email', identifierValue: 'ada@example.com' }],
            });
        }
      };

      await expect(Promise.resolve().then(invoke)).rejects.toBe(failure);
      expect(keycloakAuthService.assertMachineToMachinePrincipal).toHaveBeenCalledWith(request.user, {
        requiredRoles: [EVENT_MANAGER_M2M_VOTING_ROLES.READ],
      });
      expect(votingIntegrationService.listLinkableEvents).not.toHaveBeenCalled();
      expect(votingIntegrationService.checkAttendance).not.toHaveBeenCalled();
      expect(votingIntegrationService.lookupPeopleByEnrollmentNumbers).not.toHaveBeenCalled();
      expect(votingIntegrationService.lookupPeopleByIdentifiers).not.toHaveBeenCalled();
    },
  );

  it('propagates service errors for attendance checks without changing their error mapping', async () => {
    const failure = new NotFoundException('Event was not found.');
    votingIntegrationService.checkAttendance.mockRejectedValue(failure);

    await expect(
      controller.checkAttendance({ user: authenticatedUser({ sub: 'voting-service' }) } as never, 'event-1', {
        userId: 'user-1',
      }),
    ).rejects.toBe(failure);
  });

  it('rejects invalid attendance and people DTOs through the configured REST validation contract', async () => {
    await expect(
      REST_VALIDATION_PIPE.transform({}, bodyMetadata(VotingAttendanceCheckRequestDto)),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      REST_VALIDATION_PIPE.transform({ userId: 7 }, bodyMetadata(VotingAttendanceCheckRequestDto)),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      REST_VALIDATION_PIPE.transform({ userId: 'x'.repeat(129) }, bodyMetadata(VotingAttendanceCheckRequestDto)),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      REST_VALIDATION_PIPE.transform(
        { enrollmentNumbers: ['20240001', 7] },
        bodyMetadata(VotingPeopleLookupRequestDto),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      REST_VALIDATION_PIPE.transform(
        { enrollmentNumbers: Array.from({ length: 1001 }, (_, index) => String(index)) },
        bodyMetadata(VotingPeopleLookupRequestDto),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects malformed nested identifier DTOs and unexpected private fields', async () => {
    await expect(
      REST_VALIDATION_PIPE.transform(
        { identifiers: [{ requestId: 'candidate-1', identifierType: 'passport', identifierValue: 'x' }] },
        bodyMetadata(VotingPersonIdentifierLookupRequestDto),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      REST_VALIDATION_PIPE.transform(
        { identifiers: [{ requestId: 'candidate-1', identifierType: 'email' }] },
        bodyMetadata(VotingPersonIdentifierLookupRequestDto),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      REST_VALIDATION_PIPE.transform(
        {
          identifiers: [
            {
              requestId: 'candidate-1',
              identifierType: 'email',
              identifierValue: 'ada@example.com',
              privateData: 'must-not-cross-the-boundary',
            },
          ],
        },
        bodyMetadata(VotingPersonIdentifierLookupRequestDto),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

function bodyMetadata(
  metatype:
    | typeof VotingAttendanceCheckRequestDto
    | typeof VotingPeopleLookupRequestDto
    | typeof VotingPersonIdentifierLookupRequestDto,
): ArgumentMetadata {
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
