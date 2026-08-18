import { Permission } from '@cacic-fct/shared-permissions';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Logger,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiProperty,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { RequirePermissions } from '../../auth/decorators/require-permissions.decorator';
import { Public } from '../../auth/decorators/public.decorator';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { RateLimit } from '../../rate-limit/rate-limit.decorator';
import { RateLimitGuard } from '../../rate-limit/rate-limit.guard';
import { RATE_LIMIT_POLICIES } from '../../rate-limit/rate-limit.policies';
import { SPORTS_TEAM_LOGO_POLICY } from './sports-team-logo.policy';
import { SportsTeamLogoService, SportsTeamLogoUploadFile } from './sports-team-logo.service';
import { SportsMutationEventsService } from '../realtime/sports-mutation-events.service';
import { SportsAccessService } from '../security/sports-access.service';

type RequestWithUser = Request & {
  user?: AuthenticatedUser;
};

class SportsTeamLogoUploadBodyDto {
  @ApiProperty({
    description: `${SPORTS_TEAM_LOGO_POLICY.acceptedInputDescription}. O arquivo é normalizado para AVIF após a validação.`,
    type: 'string',
    format: 'binary',
  })
  file!: unknown;

  @ApiProperty({
    description: 'Current team revision used for optimistic concurrency control.',
    example: 4,
    minimum: 1,
  })
  expectedRevision!: number;
}

class SportsTeamLogoResponseDto {
  @ApiProperty()
  teamId!: string;

  @ApiProperty({ example: 5 })
  revision!: number;

  @ApiProperty({ example: '8d969eef6ecad3c29a3a629280e686cff8ca...' })
  sha256!: string;

  @ApiProperty({ enum: [SPORTS_TEAM_LOGO_POLICY.outputMimeType] })
  mimeType!: string;

  @ApiProperty({ maximum: SPORTS_TEAM_LOGO_POLICY.maximumUploadBytes })
  sizeBytes!: number;

  @ApiProperty({ example: 512 })
  width!: number;

  @ApiProperty({ example: 512 })
  height!: number;

  @ApiProperty({
    example:
      '/api/sports/admin/teams/019f0000-0000-7000-8000-000000000001/logo/8d969eef6ecad3c29a3a629280e686cff8ca...',
  })
  downloadUrl!: string;
}

@ApiTags('sports-team-logos')
@ApiBearerAuth()
@Controller('sports/admin/teams')
export class SportsTeamLogoController {
  private readonly logger = new Logger(SportsTeamLogoController.name);

  constructor(
    private readonly logos: SportsTeamLogoService,
    private readonly mutationEvents: SportsMutationEventsService,
  ) {}

  @Post(':sportsTeamId/logo')
  @RequirePermissions(Permission.SportsTeam.Update)
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.receiptUpload, [{ source: 'params', path: 'sportsTeamId' }])
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: SPORTS_TEAM_LOGO_POLICY.maximumUploadBytes,
        files: 1,
      },
    }),
  )
  @ApiOperation({
    summary: 'Upload an immutable sports team logo',
    description:
      'Validates raster content, stores it under a SHA-256 content-addressed key, and updates the team through revision-based optimistic concurrency control.',
  })
  @ApiParam({ name: 'sportsTeamId', description: 'Sports team identifier.' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: SportsTeamLogoUploadBodyDto })
  @ApiOkResponse({ type: SportsTeamLogoResponseDto })
  @ApiBadRequestResponse({ description: 'The image content, dimensions, size, or expected revision is invalid.' })
  @ApiConflictResponse({ description: 'The team revision changed before the logo could be persisted.' })
  @ApiForbiddenResponse({ description: `Missing scoped permission ${Permission.SportsTeam.Update}.` })
  @ApiNotFoundResponse({ description: 'The sports team does not exist.' })
  @ApiResponse({ status: 413, description: 'The multipart file exceeds 15 MiB.' })
  async upload(
    @Param('sportsTeamId') sportsTeamId: string,
    @Body('expectedRevision', ParseIntPipe) expectedRevision: number,
    @UploadedFile() file: SportsTeamLogoUploadFile | undefined,
    @Req() request: RequestWithUser,
  ) {
    if (!request.user) {
      throw new BadRequestException('O usuário autenticado não está disponível.');
    }
    const result = await this.logos.upload(sportsTeamId, expectedRevision, file, request.user);
    try {
      await this.mutationEvents.publishForEntity('TEAM', sportsTeamId, true);
    } catch (error) {
      this.logger.warn(
        `Could not publish sports team logo mutation for ${sportsTeamId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return result;
  }

  @Get(':sportsTeamId/logo-review/:changeRequestId')
  @RequirePermissions(Permission.SportsTeam.Review)
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    summary: 'Download a pending sports team logo for administrator review',
    description: 'Streams the private logo attached to an active team-change request without exposing its storage key.',
  })
  @ApiParam({ name: 'sportsTeamId', description: 'Sports team identifier.' })
  @ApiParam({ name: 'changeRequestId', description: 'Active sports team-change request identifier.' })
  @ApiProduces(SPORTS_TEAM_LOGO_POLICY.outputMimeType)
  @ApiOkResponse({ description: 'Raw pending logo stream without storage metadata.' })
  @ApiForbiddenResponse({ description: `Missing scoped permission ${Permission.SportsTeam.Review}.` })
  @ApiNotFoundResponse({ description: 'The active logo review or its private image does not exist.' })
  async downloadPendingReview(
    @Param('sportsTeamId') sportsTeamId: string,
    @Param('changeRequestId') changeRequestId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const logo = await this.logos.downloadPendingReview(sportsTeamId, changeRequestId);
    response.setHeader('Content-Type', logo.mimeType);
    response.setHeader('Content-Length', String(logo.sizeBytes));
    response.setHeader('ETag', `"sha256-${logo.sha256}"`);
    return new StreamableFile(logo.stream, {
      type: logo.mimeType,
      length: logo.sizeBytes,
    });
  }

  @Get(':sportsTeamId/logo/:sha256')
  @RequirePermissions(Permission.SportsTeam.Read)
  @Header('Cache-Control', 'private, max-age=31536000, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    summary: 'Download the current immutable sports team logo',
    description: 'The SHA-256 path segment makes the response safe for long-lived immutable browser caching.',
  })
  @ApiParam({ name: 'sportsTeamId', description: 'Sports team identifier.' })
  @ApiParam({ name: 'sha256', description: 'Exact SHA-256 hash returned by the upload endpoint.' })
  @ApiProduces(SPORTS_TEAM_LOGO_POLICY.outputMimeType)
  @ApiOkResponse({ description: 'Raw raster logo stream without storage metadata.' })
  @ApiForbiddenResponse({ description: `Missing scoped permission ${Permission.SportsTeam.Read}.` })
  @ApiNotFoundResponse({ description: 'The logo hash is invalid, stale, or unavailable.' })
  async download(
    @Param('sportsTeamId') sportsTeamId: string,
    @Param('sha256') sha256: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const logo = await this.logos.download(sportsTeamId, sha256);
    response.setHeader('Content-Type', logo.mimeType);
    response.setHeader('Content-Length', String(logo.sizeBytes));
    response.setHeader('ETag', `"sha256-${logo.sha256}"`);
    return new StreamableFile(logo.stream, {
      type: logo.mimeType,
      length: logo.sizeBytes,
    });
  }
}

@ApiTags('sports-team-logos')
@Public()
@Controller('sports/public/teams')
export class PublicSportsTeamLogoController {
  constructor(private readonly logos: SportsTeamLogoService) {}

  @Get(':sportsTeamId/logo/:sha256')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    summary: 'Download a published immutable sports team logo',
  })
  @ApiParam({ name: 'sportsTeamId', description: 'Sports team identifier.' })
  @ApiParam({ name: 'sha256', description: 'Exact current SHA-256 logo hash.' })
  @ApiProduces(SPORTS_TEAM_LOGO_POLICY.outputMimeType)
  @ApiOkResponse({ description: 'Raw raster logo stream without storage metadata.' })
  @ApiNotFoundResponse({ description: 'The team is not public or the logo is unavailable.' })
  async download(
    @Param('sportsTeamId') sportsTeamId: string,
    @Param('sha256') sha256: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const logo = await this.logos.downloadPublic(sportsTeamId, sha256);
    response.setHeader('Content-Type', logo.mimeType);
    response.setHeader('Content-Length', String(logo.sizeBytes));
    response.setHeader('ETag', `"sha256-${logo.sha256}"`);
    return new StreamableFile(logo.stream, {
      type: logo.mimeType,
      length: logo.sizeBytes,
    });
  }
}

@ApiTags('sports-team-logos')
@ApiBearerAuth()
@Controller('sports/teams')
export class SportsTeamRepresentativeLogoController {
  constructor(
    private readonly logos: SportsTeamLogoService,
    private readonly access: SportsAccessService,
  ) {}

  @Get(':sportsTeamId/logo/:sha256')
  @Header('Cache-Control', 'private, max-age=31536000, immutable')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({
    summary: 'Download the current immutable logo for a represented team',
  })
  async downloadCurrent(
    @Param('sportsTeamId') sportsTeamId: string,
    @Param('sha256') sha256: string,
    @Req() request: RequestWithUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    await this.access.requireTeamRepresentativeReader({ req: request }, sportsTeamId);
    const logo = await this.logos.download(sportsTeamId, sha256);
    response.setHeader('Content-Type', logo.mimeType);
    response.setHeader('Content-Length', String(logo.sizeBytes));
    response.setHeader('ETag', `"sha256-${logo.sha256}"`);
    return new StreamableFile(logo.stream, {
      type: logo.mimeType,
      length: logo.sizeBytes,
    });
  }

  @Post(':sportsTeamId/logo-change')
  @UseGuards(RateLimitGuard)
  @RateLimit(RATE_LIMIT_POLICIES.receiptUpload, [{ source: 'params', path: 'sportsTeamId' }])
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: SPORTS_TEAM_LOGO_POLICY.maximumUploadBytes,
        files: 1,
      },
    }),
  )
  @ApiOperation({
    summary: 'Queue an immutable team-logo change for administrator review',
    description:
      'Only an active team representative may upload. The object is content-addressed but remains unpublished until the delta is approved.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: SportsTeamLogoUploadBodyDto })
  @ApiOkResponse({ description: 'The queued request and immutable image metadata.' })
  async submitChange(
    @Param('sportsTeamId') sportsTeamId: string,
    @Body('expectedRevision', ParseIntPipe) expectedRevision: number,
    @Query('expectedRequestRevision', new ParseIntPipe({ optional: true }))
    expectedRequestRevision: number | undefined,
    @UploadedFile() file: SportsTeamLogoUploadFile | undefined,
    @Req() request: RequestWithUser,
  ) {
    const { actor } = await this.access.requireTeamRepresentative({ req: request }, sportsTeamId);
    return this.logos.submitRepresentativeUpload(
      sportsTeamId,
      expectedRevision,
      expectedRequestRevision,
      file,
      actor.id,
    );
  }
}
