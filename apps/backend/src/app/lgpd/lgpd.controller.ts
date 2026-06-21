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
import { AllowNonOnboarded } from '../auth/decorators/allow-non-onboarded.decorator';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { KeycloakAuthService } from '../auth/keycloak-auth.service';
import { REST_VALIDATION_PIPE } from '../common/rest-validation.pipe';
import { LgpdDeletionRequestDto, LgpdUserRequestDto } from './dto';
import { LgpdService } from './lgpd.service';

type RequestWithUser = Request & {
  user?: AuthenticatedUser;
};

@ApiTags('Internal M2M')
@ApiBearerAuth()
@AllowNonOnboarded()
@UsePipes(REST_VALIDATION_PIPE)
@Controller('lgpd')
export class LgpdController {
  constructor(
    private readonly keycloakAuthService: KeycloakAuthService,
    private readonly lgpdService: LgpdService,
  ) {}

  @Post('user-data')
  @RequireRoles('lgpd:read')
  @ApiOperation({
    summary: 'Collect Event Manager user data for LGPD export',
    description:
      'Internal machine-to-machine endpoint used by the account backend to collect personal data stored by Event Manager. This endpoint is not intended for Angular frontend calls or third-party integrations. The caller must be a service principal with the lgpd:read role.',
  })
  @ApiBody({
    type: LgpdUserRequestDto,
    description:
      'User lookup payload identifying the data subject whose Event Manager data should be grouped for LGPD access/export workflows.',
  })
  @ApiOkResponse({
    description: 'Event Manager user data grouped by category for privacy export or access-request processing.',
    schema: {
      type: 'object',
      additionalProperties: true,
      example: {
        identity: {
          userId: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ad',
          personId: '018f47b1-5c4e-7c7b-9e6f-0c8c2f7281ae',
        },
        subscriptions: [],
        attendances: [],
        receipts: [],
        certificates: [],
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Returned when the request does not include a valid service access token.',
  })
  @ApiForbiddenResponse({
    description:
      'Returned when the authenticated principal is not a machine-to-machine principal or does not have the required lgpd:read role.',
  })
  @ApiBadRequestResponse({
    description:
      'Returned when the LGPD user lookup payload is invalid or does not contain enough information to locate the data subject.',
  })
  userData(@Req() request: RequestWithUser, @Body() body: LgpdUserRequestDto) {
    this.keycloakAuthService.assertMachineToMachinePrincipal(request.user, {
      requiredRoles: ['lgpd:read'],
    });

    return this.lgpdService.collectUserData(body);
  }

  @Post('deletion/schedule')
  @RequireRoles('lgpd:delete')
  @ApiOperation({
    summary: 'Schedule LGPD deletion for Event Manager data',
    description:
      'Internal machine-to-machine endpoint used by the account backend to request deletion handling for Event Manager data. The operation is expected to preserve data that must be retained for legal, audit, certificate, attendance, financial, or institutional records while removing or anonymizing data that can be deleted.',
  })
  @ApiBody({
    type: LgpdDeletionRequestDto,
    description:
      'Deletion request payload identifying the data subject and the privacy workflow requesting scheduled deletion.',
  })
  @ApiOkResponse({
    description:
      'Deletion workflow accepted and Event Manager user data was soft-deleted, anonymized, or marked for deletion according to service retention rules.',
    schema: {
      type: 'object',
      additionalProperties: true,
      example: {
        status: 'success',
        deletedAt: '2026-05-29T17:20:00.000Z',
        retainedCategories: ['certificates', 'attendanceRecords'],
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Returned when the request does not include a valid service access token.',
  })
  @ApiForbiddenResponse({
    description:
      'Returned when the authenticated principal is not a machine-to-machine principal or does not have the required lgpd:delete role.',
  })
  @ApiBadRequestResponse({
    description: 'Returned when the deletion request payload is invalid or cannot be matched to a data subject.',
  })
  scheduleDeletion(@Req() request: RequestWithUser, @Body() body: LgpdDeletionRequestDto) {
    this.keycloakAuthService.assertMachineToMachinePrincipal(request.user, {
      requiredRoles: ['lgpd:delete'],
    });

    return this.lgpdService.scheduleDeletion(body);
  }

  @Post('deletion/delete')
  @RequireRoles('lgpd:delete')
  @ApiOperation({
    summary: 'Permanently delete retained Event Manager user data',
    description:
      'Internal machine-to-machine endpoint for the final deletion step of an LGPD workflow. This endpoint should be used only by trusted privacy/account services after retention checks have been resolved, because it may remove data that was previously retained after the scheduled deletion phase.',
  })
  @ApiBody({
    type: LgpdDeletionRequestDto,
    description:
      'Deletion request payload identifying the data subject whose remaining deletable Event Manager data should be permanently removed.',
  })
  @ApiOkResponse({
    description: 'Remaining deletable Event Manager user data was permanently deleted according to service rules.',
    schema: {
      type: 'object',
      additionalProperties: true,
      example: {
        status: 'success',
        deletedAt: '2026-05-29T17:20:00.000Z',
        permanentlyDeletedCategories: ['receipts', 'profileProjection'],
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Returned when the request does not include a valid service access token.',
  })
  @ApiForbiddenResponse({
    description:
      'Returned when the authenticated principal is not a machine-to-machine principal or does not have the required lgpd:delete role.',
  })
  @ApiBadRequestResponse({
    description:
      'Returned when the deletion request payload is invalid, cannot be matched to a data subject, or cannot be hard-deleted under current retention rules.',
  })
  hardDelete(@Req() request: RequestWithUser, @Body() body: LgpdDeletionRequestDto) {
    this.keycloakAuthService.assertMachineToMachinePrincipal(request.user, {
      requiredRoles: ['lgpd:delete'],
    });

    return this.lgpdService.hardDelete(body);
  }
}
