import { Body, Controller, Post, Req, UsePipes } from '@nestjs/common';
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
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { KeycloakAuthService } from '../auth/keycloak-auth.service';
import { REST_VALIDATION_PIPE } from '../common/rest-validation.pipe';
import { AccountMergeService } from './account-merge.service';
import {
  AccountMergeAcknowledgementDto,
  AccountMergeNotificationDto,
  AccountMergeScoreRequestDto,
  AccountMergeScoreResponseDto,
} from './dto';

type RequestWithUser = Request & {
  user?: AuthenticatedUser;
};

@ApiTags('Internal M2M')
@ApiBearerAuth()
@UsePipes(REST_VALIDATION_PIPE)
@Controller('account-merge')
export class AccountMergeController {
  constructor(
    private readonly accountMergeService: AccountMergeService,
    private readonly keycloakAuthService: KeycloakAuthService,
  ) {}

  @Post('score')
  @RequireRoles('account-merge:score')
  @ApiOperation({
    summary: 'Score account merge candidates',
    description:
      'Internal machine-to-machine endpoint used by the account system to ask Event Manager how much local data is associated with each account candidate. The score helps the upstream account system decide which account should be prioritized as the surviving account during a merge. Higher scores indicate that Event Manager has more relevant data tied to that account, such as people records, subscriptions, attendances, lectures, certificates, confirmed major-event subscriptions, profile fields, non-default roles, and account age. This endpoint is not intended for Angular frontend calls or third-party integrations. The caller must be a service principal with the account-merge:score role.',
  })
  @ApiBody({
    type: AccountMergeScoreRequestDto,
    description:
      'Candidate account identifiers to score according to the amount and relevance of Event Manager data linked to each account.',
  })
  @ApiOkResponse({
    type: AccountMergeScoreResponseDto,
    description:
      'Per-candidate scoring result used by the upstream account system as a prioritization signal for choosing the surviving account in a merge.',
  })
  @ApiUnauthorizedResponse({
    description: 'Returned when the request does not include a valid service access token.',
  })
  @ApiForbiddenResponse({
    description:
      'Returned when the authenticated principal is not a machine-to-machine principal or does not have the required account-merge:score role.',
  })
  @ApiBadRequestResponse({
    description: 'Returned when the score request payload is invalid or does not provide usable account candidates.',
  })
  async score(
    @Req() request: RequestWithUser,
    @Body() body: AccountMergeScoreRequestDto,
  ): Promise<AccountMergeScoreResponseDto> {
    this.keycloakAuthService.assertMachineToMachinePrincipal(request.user, {
      requiredRoles: ['account-merge:score'],
    });

    return this.accountMergeService.scoreAccountMergeCandidates(body);
  }

  @Post('merge')
  @RequireRoles('account-merge:write')
  @ApiOperation({
    summary: 'Acknowledge an account merge',
    description:
      'Internal machine-to-machine endpoint used by the account system to notify Event Manager that accounts were merged upstream. Event Manager uses this notification to update its local user/person projections and records the calling service principal for auditability. The caller must be a service principal with the account-merge:write role.',
  })
  @ApiBody({
    type: AccountMergeNotificationDto,
    description:
      'Merge notification emitted by the upstream account system after it has decided which account survives and which account records were merged.',
  })
  @ApiOkResponse({
    type: AccountMergeAcknowledgementDto,
    description:
      'Merge notification accepted and local Event Manager references were acknowledged or updated according to account merge rules.',
  })
  @ApiUnauthorizedResponse({
    description: 'Returned when the request does not include a valid service access token.',
  })
  @ApiForbiddenResponse({
    description:
      'Returned when the authenticated principal is not a machine-to-machine principal or does not have the required account-merge:write role.',
  })
  @ApiBadRequestResponse({
    description:
      'Returned when the merge notification payload is invalid, references inconsistent accounts, or cannot be applied to Event Manager local records.',
  })
  async merge(
    @Req() request: RequestWithUser,
    @Body() body: AccountMergeNotificationDto,
  ): Promise<AccountMergeAcknowledgementDto> {
    const user = this.keycloakAuthService.assertMachineToMachinePrincipal(request.user, {
      requiredRoles: ['account-merge:write'],
    });

    return this.accountMergeService.acknowledgeAccountMerge(body, this.readClientId(user));
  }

  private readClientId(user: AuthenticatedUser): string | null {
    const clientId = user.claims['azp'] ?? user.claims['client_id'];
    return typeof clientId === 'string' && clientId.trim() ? clientId.trim() : (user.sub ?? null);
  }
}
