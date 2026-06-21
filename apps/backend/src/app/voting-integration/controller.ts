import { Body, Controller, Get, Param, Post, Req, UsePipes } from '@nestjs/common';
import {
  EVENT_MANAGER_M2M_VOTING_ROLES,
  type EventManagerVotingAttendanceCheckResponse,
  type EventManagerVotingEvent,
  type EventManagerVotingPeopleLookupResponse,
} from '@cacic-fct/event-manager-m2m-contracts';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AllowNonOnboarded } from '../auth/decorators/allow-non-onboarded.decorator';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { KeycloakAuthService } from '../auth/keycloak-auth.service';
import { REST_VALIDATION_PIPE } from '../common/rest-validation.pipe';
import {
  VotingAttendanceCheckRequestDto,
  VotingAttendanceCheckResponseDto,
  VotingIntegrationEventDto,
  VotingPeopleLookupRequestDto,
  VotingPeopleLookupResponseDto,
} from './dto';
import { VotingIntegrationService } from './service';

type RequestWithUser = Request & {
  user?: AuthenticatedUser;
};

@ApiTags('Internal M2M')
@ApiBearerAuth()
@AllowNonOnboarded()
@UsePipes(REST_VALIDATION_PIPE)
@Controller('internal/voting')
export class VotingIntegrationController {
  constructor(
    private readonly keycloakAuthService: KeycloakAuthService,
    private readonly votingIntegrationService: VotingIntegrationService,
  ) {}

  @Get('events')
  @RequireRoles(EVENT_MANAGER_M2M_VOTING_ROLES.READ)
  @ApiOperation({
    summary: 'List Event Manager events that can be linked to CACiC Voto polls',
    description:
      'Internal machine-to-machine endpoint used by CACiC Voto to populate the poll event-link selector. It returns non-deleted events happening today or in the future. The caller must be a service principal with the voting-integration:read role.',
  })
  @ApiOkResponse({
    type: [VotingIntegrationEventDto],
    description: 'Events ordered by start date.',
  })
  @ApiUnauthorizedResponse({
    description: 'Returned when the request does not include a valid service access token.',
  })
  @ApiForbiddenResponse({
    description:
      'Returned when the authenticated principal is not a machine-to-machine principal or lacks the voting-integration:read role.',
  })
  listEvents(@Req() request: RequestWithUser): Promise<EventManagerVotingEvent[]> {
    this.assertM2m(request);
    return this.votingIntegrationService.listLinkableEvents();
  }

  @Post('events/:eventId/attendance-check')
  @RequireRoles(EVENT_MANAGER_M2M_VOTING_ROLES.READ)
  @ApiOperation({
    summary: 'Check whether a Keycloak user has attendance registered for an event',
    description:
      'Internal machine-to-machine endpoint used by CACiC Voto before accepting attendance-restricted votes. The lookup uses the shared Keycloak subject through local user/person projections and the kc:<sub> external reference convention.',
  })
  @ApiBody({
    type: VotingAttendanceCheckRequestDto,
    description: 'Keycloak user identifier to check against Event Manager attendance records.',
  })
  @ApiOkResponse({
    type: VotingAttendanceCheckResponseDto,
    description: 'Attendance lookup result.',
  })
  @ApiUnauthorizedResponse({
    description: 'Returned when the request does not include a valid service access token.',
  })
  @ApiForbiddenResponse({
    description:
      'Returned when the authenticated principal is not a machine-to-machine principal or lacks the voting-integration:read role.',
  })
  @ApiBadRequestResponse({
    description: 'Returned when the attendance lookup payload is invalid.',
  })
  checkAttendance(
    @Req() request: RequestWithUser,
    @Param('eventId') eventId: string,
    @Body() body: VotingAttendanceCheckRequestDto,
  ): Promise<EventManagerVotingAttendanceCheckResponse> {
    this.assertM2m(request);
    return this.votingIntegrationService.checkAttendance(eventId, body.userId);
  }

  @Post('people/lookup')
  @RequireRoles(EVENT_MANAGER_M2M_VOTING_ROLES.READ)
  @ApiOperation({
    summary: 'Resolve Event Manager people by enrollment number',
    description:
      'Internal machine-to-machine endpoint used by CACiC Voto admin screens to display names for enrollment-based voter eligibility lists. Returned people data is for display only and the caller must continue using its own eligibility table for vote authorization.',
  })
  @ApiBody({
    type: VotingPeopleLookupRequestDto,
    description: 'Enrollment numbers imported into a CACiC Voto eligibility list.',
  })
  @ApiOkResponse({
    type: VotingPeopleLookupResponseDto,
    description: 'Active Event Manager people records matching the requested enrollment numbers.',
  })
  @ApiUnauthorizedResponse({
    description: 'Returned when the request does not include a valid service access token.',
  })
  @ApiForbiddenResponse({
    description:
      'Returned when the authenticated principal is not a machine-to-machine principal or lacks the voting-integration:read role.',
  })
  @ApiBadRequestResponse({
    description: 'Returned when the lookup payload is invalid.',
  })
  lookupPeople(
    @Req() request: RequestWithUser,
    @Body() body: VotingPeopleLookupRequestDto,
  ): Promise<EventManagerVotingPeopleLookupResponse> {
    this.assertM2m(request);
    return this.votingIntegrationService.lookupPeopleByEnrollmentNumbers(body.enrollmentNumbers);
  }

  private assertM2m(request: RequestWithUser): void {
    this.keycloakAuthService.assertMachineToMachinePrincipal(request.user, {
      requiredRoles: [EVENT_MANAGER_M2M_VOTING_ROLES.READ],
    });
  }
}
